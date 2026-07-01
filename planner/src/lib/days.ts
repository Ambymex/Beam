// Svelte stores + Dexie (IndexedDB) persistence for the day schedule.
//
// On import (before any component reads it) we load the saved map from Dexie
// and run the silent migration to today — so undone blocks from past days are 
// already on today's ring by first render (§13).

import { writable, derived, get } from 'svelte/store';
import { dateKey, migrateUndone, sortedKeysDesc, type DaysMap, type DayData } from './daydata';
import { db, migrateFromLocalStorage } from './db';

export const todayKey = (): string => dateKey(new Date());

export const days = writable<DaysMap>({});

async function initDays() {
  if (typeof window === 'undefined') return;

  // 1. Migrate old localStorage data if needed
  await migrateFromLocalStorage();

  try {
    // 2. Load all records from Dexie
    const rows = await db.days.toArray();
    const loadedMap: DaysMap = {};
    for (const row of rows) {
      loadedMap[row.date] = {
        blocks: row.blocks,
        symptoms: row.symptoms,
        nextId: row.nextId,
        nextSymptomId: row.nextSymptomId,
        diary: row.diary || ''
      };
    }

    // 3. Migrate undone blocks forward to today
    const migratedMap = migrateUndone(loadedMap, todayKey());

    // 4. Save any modified records back to Dexie
    const saves: Promise<any>[] = [];
    for (const [date, data] of Object.entries(migratedMap)) {
      const original = loadedMap[date];
      if (!original || JSON.stringify(original) !== JSON.stringify(data)) {
        saves.push(db.days.put({
          date,
          blocks: data.blocks,
          symptoms: data.symptoms,
          nextId: data.nextId,
          nextSymptomId: data.nextSymptomId,
          diary: data.diary || ''
        }));
      }
    }
    await Promise.all(saves);

    // 5. Update Svelte store to trigger reactive rendering
    isInitialized = true;
    days.set(migratedMap);

    // 6. Trigger push sync
    void import('./sync').then((m) => m.scheduleResync()).catch(() => {});
  } catch (err) {
    console.error('[DB] Failed to initialize days from database:', err);
  }
}

// Start loading immediately in the background
initDays();

// Which day the ring is showing. Defaults to today; the gallery sets it.
export const currentKey = writable<string>(todayKey());

// Trigger Google Calendar sync when switching days
currentKey.subscribe(async (key) => {
  if (typeof window === 'undefined') return;
  try {
    const gcalMod = await import('./gcal');
    if (get(gcalMod.gcalSyncActive)) {
      void gcalMod.syncCalendarDay(key);
    }
  } catch (err) {
    // ignore
  }
});

// The selected day's data (always defined; empty if untouched).
export const currentDay = derived(
  [days, currentKey],
  ([$days, $key]): DayData => $days[$key] ?? { blocks: [], symptoms: [], nextId: 1, nextSymptomId: 1 },
);

// Gallery list: every day with data plus today, most-recent first.
export const dayKeysDesc = derived(days, ($days) => sortedKeysDesc($days, todayKey()));

// Future days for the "time machine" (§8): pre-seeded empty rings you can land
// on and drop an appointment before its morning. The next `n` days after today.
export function futureKeys(n = 14): string[] {
  const out: string[] = [];
  const base = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(dateKey(d));
  }
  return out;
}

// Write a day's blocks back into the map.
export function saveDay(key: string, blocks: DayData['blocks'], nextId: number, symptoms: DayData['symptoms'], nextSymptomId: number, diary?: string) {
  days.update((all) => {
    const existing = all[key];
    const resolvedDiary = diary !== undefined ? diary : (existing?.diary || '');
    return {
      ...all,
      [key]: {
        blocks,
        symptoms,
        nextId,
        nextSymptomId,
        diary: resolvedDiary
      }
    };
  });
}

// Store subscription for automatic persistence of all memory changes to IndexedDB
let lastValue: DaysMap = {};
let isInitialized = false;

days.subscribe((value) => {
  if (typeof window === 'undefined') return;
  if (!isInitialized) {
    if (Object.keys(value).length > 0) {
      isInitialized = true;
      lastValue = structuredClone(value);
    }
    return;
  }

  const snapshotPrev = structuredClone(lastValue);

  // 1. Put changed or added days to Dexie
  for (const [key, data] of Object.entries(value)) {
    const prev = lastValue[key];
    if (!prev || JSON.stringify(prev) !== JSON.stringify(data)) {
      db.days.put({
        date: key,
        blocks: data.blocks,
        symptoms: data.symptoms,
        nextId: data.nextId,
        nextSymptomId: data.nextSymptomId,
        diary: data.diary || ''
      }).catch((err) => console.error('[DB] Subscriber failed to save day:', err));
    }
  }

  // 2. Delete removed days from Dexie
  for (const key of Object.keys(lastValue)) {
    if (!(key in value)) {
      db.days.delete(key).catch((err) => console.error('[DB] Subscriber failed to delete day:', err));
    }
  }

  lastValue = structuredClone(value);

  // 3. Trigger push sync
  void import('./sync').then((m) => m.scheduleResync()).catch(() => {});

  // 4. Google Calendar Sync Push (debounced by 1.5s to prevent drag flooding)
  if (typeof window !== 'undefined') {
    import('./gcal').then((gcalMod) => {
      if (get(gcalMod.gcalSyncActive)) {
        if (gcalPushTimeout) clearTimeout(gcalPushTimeout);

        gcalPushTimeout = window.setTimeout(async () => {
          for (const [dateStr, data] of Object.entries(value)) {
            const prev = snapshotPrev[dateStr];
            if (!prev) continue;

            const currentBlocks = data.blocks;
            const prevBlocks = prev.blocks;

            // Find deleted blocks
            for (const pb of prevBlocks) {
              if (pb.gcalId && !currentBlocks.some(b => b.gcalId === pb.gcalId)) {
                void gcalMod.deleteGCalEvent(pb.gcalId);
              }
            }

            // Find added or updated blocks
            let storeUpdates = false;
            const updatedBlocks = [...currentBlocks];

            for (let i = 0; i < updatedBlocks.length; i++) {
              const b = updatedBlocks[i];
              if (b.laneId !== 'main' || !b.label) continue;

              const pb = prevBlocks.find(x => x.id === b.id);
              const isNew = !b.gcalId;
              const isUpdated = pb && (pb.label !== b.label || pb.startHours !== b.startHours || pb.coreEndHours !== b.coreEndHours);

              if (isNew || isUpdated) {
                const newGCalId = await gcalMod.pushLocalBlockToGCal(b, dateStr);
                if (newGCalId && isNew) {
                  updatedBlocks[i] = { ...b, gcalId: newGCalId };
                  storeUpdates = true;
                }
              }
            }

            if (storeUpdates) {
              days.update(all => ({
                ...all,
                [dateStr]: {
                  ...data,
                  blocks: updatedBlocks
                }
              }));
            }
          }
        }, 1500);
      }
    }).catch(() => {});
  }
});

let gcalPushTimeout: number | undefined;
