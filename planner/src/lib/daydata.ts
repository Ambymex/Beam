// Day data model + the silent-migration rule (§13). Pure and svelte-free so it
// can be unit-tested; the Svelte stores and persistence live in days.ts.

import type { Block } from './blocks';

export interface DayData {
  blocks: Block[];
  nextId: number;
}

export type DaysMap = Record<string, DayData>; // key: 'YYYY-MM-DD' (local date)

export const emptyDay = (): DayData => ({ blocks: [], nextId: 1 });

// Local-date key. 'YYYY-MM-DD' sorts lexicographically === chronologically,
// which the migration and gallery rely on.
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Keys present in the map plus today, most-recent first.
export function sortedKeysDesc(days: DaysMap, todayKey: string): string[] {
  const set = new Set(Object.keys(days));
  set.add(todayKey);
  return [...set].sort().reverse();
}

// Silent migration (§13 / "forgive, don't nag"): every NOT-done block on a day
// strictly before today moves forward onto today. Done blocks stay put as the
// historical record. No guilt, no notification — the undone work just quietly
// reappears on today's ring. A still-undone block migrates again next time,
// gently following the user forward until it's done.
export function migrateUndone(days: DaysMap, todayKey: string): DaysMap {
  const out: DaysMap = structuredClone(days);
  const today = out[todayKey] ?? emptyDay();
  let nextId = today.nextId;

  for (const key of Object.keys(out)) {
    if (key >= todayKey) continue; // only past days
    const day = out[key];
    const stay: Block[] = [];
    for (const b of day.blocks) {
      // Done blocks stay as the record; appointments are date-fixed (§8) and
      // never migrate — a past appointment is history, not unfinished work.
      if (b.done || b.kind === 'appointment') {
        stay.push(b);
      } else {
        today.blocks.push({ ...b, id: nextId++, migratedFrom: b.migratedFrom ?? key });
      }
    }
    day.blocks = stay;
  }

  today.nextId = nextId;
  out[todayKey] = today;
  return out;
}
