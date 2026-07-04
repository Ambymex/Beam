import Dexie, { type Table } from 'dexie';
import type { DayData } from './daydata';
import type { CustomVibe } from './customVibes';
import type { CustomCategory } from './customCategories';

export class RadialPlannerDB extends Dexie {
  days!: Table<{
    date: string;
    blocks: DayData['blocks'];
    symptoms: DayData['symptoms'];
    nextId: number;
    nextSymptomId: number;
    diary?: string;
  }, string>;

  customVibes!: Table<CustomVibe, string>;
  customCategories!: Table<CustomCategory, string>;
  // CGM readings from the Beam bridge: one row per measurement, keyed by epoch-ms.
  glucose!: Table<{ ts: number; mgdl: number }, number>;
  scratchpad!: Table<{ id: string; content: string; updatedAt: Date }, string>;
  notifications!: Table<{
    id: string;
    date: string;
    timeHours: number;
    title: string;
    body: string;
    sent: number; // 0 = pending, 1 = sent
  }, string>;
  // Comms channel: the full text of every companion notification, archived at
  // send time — the OS banner truncates, this never does (see comms.ts).
  comms!: Table<{
    id: string;
    ts: number; // epoch ms
    title: string;
    body: string;
    kind: string; // 'companion-alert' | 'scheduled-alert'
    read: number; // 0 = unread, 1 = read
    synced?: number; // 0/absent = not yet in the cloud vault, 1 = uploaded (msgSync.ts)
  }, string>;

  constructor() {
    super('RadialPlannerDB');
    this.version(1).stores({
      days: 'date',
      customVibes: 'id, categoryId',
      customCategories: 'id',
    });
    this.version(2).stores({
      days: 'date',
      customVibes: 'id, categoryId',
      customCategories: 'id',
      scratchpad: 'id',
    });
    this.version(3).stores({
      days: 'date',
      customVibes: 'id, categoryId',
      customCategories: 'id',
      scratchpad: 'id',
      notifications: 'id, date, sent',
    });
    this.version(4).stores({
      days: 'date',
      customVibes: 'id, categoryId',
      customCategories: 'id',
      scratchpad: 'id',
      notifications: 'id, date, sent',
      glucose: 'ts',
    });
    this.version(5).stores({
      days: 'date',
      customVibes: 'id, categoryId',
      customCategories: 'id',
      scratchpad: 'id',
      notifications: 'id, date, sent',
      glucose: 'ts',
      comms: 'id, ts, read',
    });
    this.version(6).stores({
      days: 'date',
      customVibes: 'id, categoryId',
      customCategories: 'id',
      scratchpad: 'id',
      notifications: 'id, date, sent',
      glucose: 'ts',
      comms: 'id, ts, read, synced',
    });
  }
}

export const db = new RadialPlannerDB();

// Migration flag key
const MIGRATION_KEY = 'radial-planner-db-migrated-v1';

// Migration logic from localStorage to Dexie
export async function migrateFromLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return;
    const isMigrated = localStorage.getItem(MIGRATION_KEY);
    if (isMigrated === 'true') return;

    console.log('[DB] Starting migrations from localStorage to Dexie...');

    // 1. Migrate DaysMap
    const daysRaw = localStorage.getItem('radial-planner-days-v1');
    if (daysRaw) {
      const daysMap = JSON.parse(daysRaw) as Record<string, DayData>;
      const operations = Object.entries(daysMap).map(([date, data]) => {
        return db.days.put({
          date,
          blocks: data.blocks || [],
          symptoms: data.symptoms || [],
          nextId: data.nextId || 1,
          nextSymptomId: data.nextSymptomId || 1,
        });
      });
      await Promise.all(operations);
      console.log(`[DB] Migrated ${operations.length} days of schedule data.`);
    }

    // 2. Migrate Custom Vibes
    const vibesRaw = localStorage.getItem('radial-planner-custom-vibes-v1');
    if (vibesRaw) {
      const customVibes = JSON.parse(vibesRaw) as CustomVibe[];
      const operations = customVibes.map(v => db.customVibes.put(v));
      await Promise.all(operations);
      console.log(`[DB] Migrated ${operations.length} custom vibes.`);
    }

    // 3. Migrate Custom Categories
    const catsRaw = localStorage.getItem('radial-planner-custom-cats-v1');
    if (catsRaw) {
      const customCats = JSON.parse(catsRaw) as CustomCategory[];
      const operations = customCats.map(c => db.customCategories.put(c));
      await Promise.all(operations);
      console.log(`[DB] Migrated ${operations.length} custom categories.`);
    }

    // Mark as migrated
    localStorage.setItem(MIGRATION_KEY, 'true');
    console.log('[DB] LocalStorage migration complete.');
  } catch (err) {
    console.error('[DB] Failed to migrate from localStorage:', err);
  }
}
