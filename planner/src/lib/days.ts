// Svelte stores + localStorage persistence for the day schedule.
//
// On import (before any component reads it) we load the saved map and run the
// silent migration to today — so undone blocks from past days are already on
// today's ring by first render (§13).

import { writable, derived } from 'svelte/store';
import { dateKey, migrateUndone, sortedKeysDesc, type DaysMap, type DayData } from './daydata';

const STORAGE_KEY = 'radial-planner-days-v1';

export const todayKey = (): string => dateKey(new Date());

function load(): DaysMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DaysMap) : {};
  } catch {
    return {}; // corrupt storage shouldn't brick the app
  }
}

const initial = migrateUndone(load(), todayKey());

export const days = writable<DaysMap>(initial);

// Persist on every change (also fires immediately with the migrated state,
// so the migration result is written back to storage).
days.subscribe((value) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota / private mode — drawing still works in-memory this session */
  }
});

// Which day the ring is showing. Defaults to today; the gallery sets it.
export const currentKey = writable<string>(todayKey());

// The selected day's data (always defined; empty if untouched).
export const currentDay = derived(
  [days, currentKey],
  ([$days, $key]): DayData => $days[$key] ?? { blocks: [], nextId: 1 },
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
export function saveDay(key: string, blocks: DayData['blocks'], nextId: number) {
  days.update((all) => ({ ...all, [key]: { blocks, nextId } }));
}
