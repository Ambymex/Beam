// Recurring-task rules (§ repeats, 2026-08-03). A rule is the durable
// definition; materializeRepeats() (daydata.ts) stamps concrete Block
// instances onto matching days. Rules live in their own Dexie table so they
// survive backup and never entangle with the per-day block JSON.
//
// Design (Ash's calls): flexible weekday picker + daily; an unfinished
// occurrence stays put and the next one appears on schedule (repeat instances
// are exempt from migrateUndone). Completion + single edits are per-instance;
// editing/ending the series flows through here.

import { get, writable } from 'svelte/store';
import { db } from './db';
import { days, todayKey } from './days';
import { materializeRepeats, type RepeatRule } from './daydata';

export const repeatRules = writable<RepeatRule[]>([]);

async function initRepeats() {
  if (typeof window === 'undefined') return;
  try {
    repeatRules.set(await db.repeatRules.toArray());
  } catch (err) {
    console.error('[Repeats] load failed:', err);
  }
}
initRepeats();

// Re-stamp instances across the horizon from the current rules, into the live
// days store (its subscriber persists). Safe to call any time — idempotent.
export function regenerateRepeats(): void {
  const rules = get(repeatRules);
  const current = get(days);
  const next = materializeRepeats(current, rules, todayKey());
  if (next !== current) days.set(next);
}

function persist(rule: RepeatRule): Promise<unknown> {
  return db.repeatRules.put(rule).catch((err) => console.error('[Repeats] save failed:', err));
}

export interface NewRuleInput {
  laneId: string;
  startHours: number;
  coreEndHours: number;
  taperEndHours: number;
  vibeId: string | null;
  label: string;
  freq: 'daily' | 'weekly';
  weekdays: number[];
  anchorKey?: string; // defaults to today
}

export function addRepeatRule(input: NewRuleInput): RepeatRule {
  const rule: RepeatRule = {
    id: 'rep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    laneId: input.laneId,
    startHours: input.startHours,
    coreEndHours: input.coreEndHours,
    taperEndHours: input.taperEndHours,
    vibeId: input.vibeId,
    label: input.label,
    freq: input.freq,
    weekdays: input.weekdays,
    anchorKey: input.anchorKey ?? todayKey(),
    skip: [],
    active: true,
  };
  repeatRules.update((list) => [...list, rule]);
  persist(rule);
  // NB: caller regenerates. When turning an existing task into a repeat, the
  // caller must stamp that block's repeatId FIRST (so its anchor-day instance
  // isn't duplicated), THEN call regenerateRepeats().
  return rule;
}

// Drop this series' still-undone instances STRICTLY AFTER today, so an edit
// re-stamps the days ahead from the new definition. Today's instance is left
// alone — it's usually the one being edited/selected, and churning its id
// would drop the selection mid-edit. Done + past instances stay as record.
function pruneFutureInstances(id: string): void {
  const tk = todayKey();
  days.update((all) => {
    const out = { ...all };
    for (const [key, day] of Object.entries(out)) {
      if (key <= tk) continue;
      const kept = day.blocks.filter((b) => !(b.repeatId === id && !b.done));
      if (kept.length !== day.blocks.length) out[key] = { ...day, blocks: kept };
    }
    return out;
  });
}

export function updateRepeatRule(id: string, patch: Partial<RepeatRule>): void {
  let updated: RepeatRule | undefined;
  repeatRules.update((list) =>
    list.map((r) => (r.id === id ? (updated = { ...r, ...patch, id: r.id }) : r)),
  );
  if (!updated) return;
  persist(updated);
  // wipe future undone instances so the edit takes on the ones ahead, then
  // re-stamp fresh from the new definition
  pruneFutureInstances(id);
  regenerateRepeats();
}

// End the series: stop generating, and clear the future undone instances.
// Past/completed ones remain as history.
export function endRepeatSeries(id: string): void {
  updateRepeatRule(id, { active: false });
}

// Delete a single upcoming occurrence: remember the date so it won't be
// re-stamped, and remove that day's instance.
export function skipOccurrence(id: string, dateKey: string): void {
  let updated: RepeatRule | undefined;
  repeatRules.update((list) =>
    list.map((r) => (r.id === id ? (updated = { ...r, skip: [...new Set([...r.skip, dateKey])] }) : r)),
  );
  if (updated) persist(updated);
  days.update((all) => {
    const day = all[dateKey];
    if (!day) return all;
    const kept = day.blocks.filter((b) => b.repeatId !== id);
    if (kept.length === day.blocks.length) return all;
    return { ...all, [dateKey]: { ...day, blocks: kept } };
  });
}

export function getRule(id: string): RepeatRule | undefined {
  return get(repeatRules).find((r) => r.id === id);
}
