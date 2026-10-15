// Appetite tracker (§ new, Ash 2026-08-23). A passive log on the 'appetite'
// lane, built to mirror the symptom ring: each entry is a level marker whose
// OPACITY encodes how strong the appetite was, so a day's pattern reads at a
// glance the same way symptoms do. No category dimension — appetite is a single
// scale (low → very high), so the level IS the data.
//
// Like symptoms, the fill borrows the theme's neutral glass hue (never a sacred
// vibe hue, §2) and opacity carries the meaning.

export type AppetiteLevel = 'low' | 'normal' | 'high' | 'very_high';

// Ordered low→high; opacity rises with the level so a fuller appetite reads as
// a more solid arc (parallels symptom severity → opacity).
export const APPETITE_LEVELS: { id: AppetiteLevel; label: string; opacity: number }[] = [
  { id: 'low',       label: 'Low',       opacity: 0.25 },
  { id: 'normal',    label: 'Normal',    opacity: 0.5  },
  { id: 'high',      label: 'High',      opacity: 0.75 },
  { id: 'very_high', label: 'Very high', opacity: 1.0  },
];

export interface AppetiteEntry {
  id: number;
  timeHours: number;    // hours-from-midnight (0–24)
  level: AppetiteLevel;
  note?: string;        // optional free-text
}

// Same neutral, theme-following fill as the symptom ring (§ SYMPTOM_FILL) — the
// two trackers share a visual language; the radius (lane) tells them apart.
export const APPETITE_FILL = 'rgb(from var(--glass-bg, #8a8a96) r g b / 1)';

// Arc width per entry, centred on its timeHours — wide enough to tap, narrow
// enough to see the day's pattern. Matches the symptom ring.
export const APPETITE_ARC_HOURS = 0.5; // 30 minutes

// Opacity for a given level (falls back to 'normal' for unknown values).
export function appetiteOpacity(level: AppetiteLevel): number {
  return APPETITE_LEVELS.find((l) => l.id === level)?.opacity ?? 0.5;
}

// Next unique ID within a day's array.
export function nextAppetiteId(entries: AppetiteEntry[]): number {
  return entries.length === 0 ? 1 : Math.max(...entries.map((e) => e.id)) + 1;
}

// Hit-test: is a given radius and hour inside this entry's angular arc?
// Identical geometry to symptomContains — the arc is centred on timeHours.
export function appetiteContains(e: AppetiteEntry, r: number, hours: number, laneInner: number, laneOuter: number): boolean {
  if (r < laneInner || r > laneOuter) return false;
  const half = APPETITE_ARC_HOURS / 2;
  const start = e.timeHours - half;
  const end = e.timeHours + half;

  // Handle cross-midnight for the arc (e.g. at 23:45 or 00:15).
  if (hours >= start && hours <= end) return true;
  if (hours + 24 >= start && hours + 24 <= end) return true;
  if (hours - 24 >= start && hours - 24 <= end) return true;

  return false;
}
