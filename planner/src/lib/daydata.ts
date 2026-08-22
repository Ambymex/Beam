// Day data model + the silent-migration rule (§13). Pure and svelte-free so it
// can be unit-tested; the Svelte stores and persistence live in days.ts.

import { repairBlock, type Block } from './blocks';
import type { Symptom } from './symptoms';

export interface DayData {
  blocks: Block[];
  symptoms: Symptom[];
  nextId: number;
  nextSymptomId: number;
  diary?: string; // Daily reflection/notes
}

export type DaysMap = Record<string, DayData>; // key: 'YYYY-MM-DD' (local date)

// A recurring-task rule (§ repeats). Lives in its own Dexie store (repeats.ts);
// materializeRepeats() stamps concrete Block instances onto matching days.
// Geometry fields mirror a Block so an instance is a straight copy + repeatId.
export interface RepeatRule {
  id: string; // 'rep_...'
  laneId: string;
  startHours: number;
  coreEndHours: number;
  taperEndHours: number;
  vibeId: string | null;
  label: string;
  freq: 'daily' | 'weekly';
  weekdays: number[]; // 0=Sun … 6=Sat — weekly only (empty for daily)
  anchorKey: string; // 'YYYY-MM-DD' — never generate before this date
  skip: string[]; // dates to omit (a single occurrence the user deleted)
  active: boolean; // false = series ended; stop generating (past stays as record)
}

export function repeatMatchesDate(rule: RepeatRule, d: Date): boolean {
  if (rule.freq === 'daily') return true;
  return rule.weekdays.includes(d.getDay());
}

export const emptyDay = (): DayData => ({ blocks: [], symptoms: [], nextId: 1, nextSymptomId: 1, diary: '' });

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

// Keys present in the map up to and including today, most-recent first.
// Future days are deliberately excluded: they belong to the gallery's separate
// "Ahead" lane. Since recurring tasks began seeding concrete blocks onto future
// days (materializeRepeats), those days now live in the map too — without this
// filter they'd sort to the TOP of the past-facing grid and shove today down
// into the middle, so the wrong day reads as "today".
export function sortedKeysDesc(days: DaysMap, todayKey: string): string[] {
  const set = new Set(Object.keys(days));
  set.add(todayKey);
  return [...set].filter((k) => k <= todayKey).sort().reverse();
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
      // never migrate; emotional logs stay as historical record; repeat
      // instances keep their own rhythm (they recur on schedule, never pile
      // forward — Ash's call, 2026-08-03).
      if (b.done || b.kind === 'appointment' || b.laneId === 'emotion' || b.repeatId) {
        stay.push(b);
      } else {
        today.blocks.push(repairBlock({ ...b, id: nextId++, migratedFrom: b.migratedFrom ?? key }));
      }
    }
    day.blocks = stay;
  }

  today.nextId = nextId;
  out[todayKey] = today;

  // Heal geometry invariants everywhere while we're here (this runs once per
  // app start and is saved back) — un-normalized hours from older versions or
  // LLM edits otherwise haunt the ring as unclickable >360° loops.
  for (const day of Object.values(out)) {
    day.blocks = day.blocks.map(repairBlock);
  }
  return out;
}

// Stamp concrete Block instances from repeat rules onto every matching day in
// [today, today+horizon]. Idempotent: adds an instance only when that day has
// none for the rule and the date isn't skipped, so it's safe to run on every
// app start and after any rule edit. Generated instances carry repeatId, which
// exempts them from migrateUndone (they recur, they don't pile forward).
export function materializeRepeats(
  days: DaysMap,
  rules: RepeatRule[],
  todayKey: string,
  horizonDays = 21,
): DaysMap {
  const active = rules.filter((r) => r.active);
  if (!active.length) return days;
  const out: DaysMap = structuredClone(days);
  const base = parseKey(todayKey);
  for (let i = 0; i <= horizonDays; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dk = dateKey(d);
    for (const rule of active) {
      if (dk < rule.anchorKey) continue;
      if (rule.skip.includes(dk)) continue;
      if (!repeatMatchesDate(rule, d)) continue;
      const day = out[dk] ?? emptyDay();
      // already present (generated earlier, or edited/completed in place) — leave it
      if (day.blocks.some((b) => b.repeatId === rule.id)) {
        out[dk] = day;
        continue;
      }
      const id = day.nextId++;
      day.blocks.push(
        repairBlock({
          id,
          laneId: rule.laneId,
          startHours: rule.startHours,
          coreEndHours: rule.coreEndHours,
          taperEndHours: rule.taperEndHours,
          vibeId: rule.vibeId,
          done: false,
          label: rule.label,
          repeatId: rule.id,
        }),
      );
      out[dk] = day;
    }
  }
  return out;
}
