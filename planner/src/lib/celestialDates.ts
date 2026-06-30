// Hardcoded astronomical event dates 2024-2030.
// These drive the rare-celestial override layer of the Environmental Theme
// Engine (highest priority). Dates are UTC, stored as 'YYYY-MM-DD'.
//
// Sources: NASA Eclipse, IMO Meteor Shower Calendar. Minor showers omitted;
// only the visually spectacular ones that justify a CSS animation layer.

export type CelestialEventType = 'solar-eclipse' | 'lunar-eclipse' | 'meteor-shower';

export interface CelestialEvent {
  type: CelestialEventType;
  name: string;
  /** Start date inclusive (YYYY-MM-DD) */
  start: string;
  /** End date inclusive — same as start for eclipses, multi-day for showers */
  end: string;
}

// ── Solar Eclipses (total & annular only — partials aren't dramatic enough) ──
const SOLAR_ECLIPSES: CelestialEvent[] = [
  { type: 'solar-eclipse', name: 'Total Solar Eclipse',   start: '2024-04-08', end: '2024-04-08' },
  { type: 'solar-eclipse', name: 'Annular Solar Eclipse', start: '2024-10-02', end: '2024-10-02' },
  { type: 'solar-eclipse', name: 'Total Solar Eclipse',   start: '2025-03-29', end: '2025-03-29' },
  { type: 'solar-eclipse', name: 'Annular Solar Eclipse', start: '2025-09-21', end: '2025-09-21' },
  { type: 'solar-eclipse', name: 'Total Solar Eclipse',   start: '2026-08-12', end: '2026-08-12' },
  { type: 'solar-eclipse', name: 'Annular Solar Eclipse', start: '2027-02-06', end: '2027-02-06' },
  { type: 'solar-eclipse', name: 'Total Solar Eclipse',   start: '2027-08-02', end: '2027-08-02' },
  { type: 'solar-eclipse', name: 'Annular Solar Eclipse', start: '2028-01-26', end: '2028-01-26' },
  { type: 'solar-eclipse', name: 'Total Solar Eclipse',   start: '2028-07-22', end: '2028-07-22' },
  { type: 'solar-eclipse', name: 'Annular Solar Eclipse', start: '2029-01-14', end: '2029-01-14' },
  { type: 'solar-eclipse', name: 'Total Solar Eclipse',   start: '2030-06-01', end: '2030-06-01' },
  { type: 'solar-eclipse', name: 'Annular Solar Eclipse', start: '2030-11-25', end: '2030-11-25' },
];

// ── Lunar Eclipses (total & partial — penumbrals are too subtle) ──
const LUNAR_ECLIPSES: CelestialEvent[] = [
  { type: 'lunar-eclipse', name: 'Penumbral Lunar Eclipse',  start: '2024-03-25', end: '2024-03-25' },
  { type: 'lunar-eclipse', name: 'Partial Lunar Eclipse',    start: '2024-09-18', end: '2024-09-18' },
  { type: 'lunar-eclipse', name: 'Total Lunar Eclipse',      start: '2025-03-14', end: '2025-03-14' },
  { type: 'lunar-eclipse', name: 'Total Lunar Eclipse',      start: '2025-09-07', end: '2025-09-07' },
  { type: 'lunar-eclipse', name: 'Total Lunar Eclipse',      start: '2026-03-03', end: '2026-03-03' },
  { type: 'lunar-eclipse', name: 'Partial Lunar Eclipse',    start: '2026-08-28', end: '2026-08-28' },
  { type: 'lunar-eclipse', name: 'Penumbral Lunar Eclipse',  start: '2027-02-20', end: '2027-02-20' },
  { type: 'lunar-eclipse', name: 'Penumbral Lunar Eclipse',  start: '2027-07-18', end: '2027-07-18' },
  { type: 'lunar-eclipse', name: 'Penumbral Lunar Eclipse',  start: '2027-08-17', end: '2027-08-17' },
  { type: 'lunar-eclipse', name: 'Partial Lunar Eclipse',    start: '2028-01-12', end: '2028-01-12' },
  { type: 'lunar-eclipse', name: 'Partial Lunar Eclipse',    start: '2028-07-06', end: '2028-07-06' },
  { type: 'lunar-eclipse', name: 'Penumbral Lunar Eclipse',  start: '2028-12-31', end: '2028-12-31' },
  { type: 'lunar-eclipse', name: 'Total Lunar Eclipse',      start: '2029-06-26', end: '2029-06-26' },
  { type: 'lunar-eclipse', name: 'Total Lunar Eclipse',      start: '2029-12-20', end: '2029-12-20' },
  { type: 'lunar-eclipse', name: 'Partial Lunar Eclipse',    start: '2030-06-15', end: '2030-06-15' },
];

// ── Meteor Showers (peak windows — the 2-4 night stretch worth animating) ──
const METEOR_SHOWERS: CelestialEvent[] = [
  // Quadrantids (peak Jan 3-4 each year)
  ...years(2024, 2030, (y) => ({ type: 'meteor-shower' as const, name: 'Quadrantids', start: `${y}-01-02`, end: `${y}-01-04` })),
  // Lyrids (peak Apr 21-23)
  ...years(2024, 2030, (y) => ({ type: 'meteor-shower' as const, name: 'Lyrids', start: `${y}-04-21`, end: `${y}-04-23` })),
  // Eta Aquariids (peak May 5-7)
  ...years(2024, 2030, (y) => ({ type: 'meteor-shower' as const, name: 'Eta Aquariids', start: `${y}-05-05`, end: `${y}-05-07` })),
  // Perseids (peak Aug 11-13)
  ...years(2024, 2030, (y) => ({ type: 'meteor-shower' as const, name: 'Perseids', start: `${y}-08-11`, end: `${y}-08-13` })),
  // Orionids (peak Oct 20-22)
  ...years(2024, 2030, (y) => ({ type: 'meteor-shower' as const, name: 'Orionids', start: `${y}-10-20`, end: `${y}-10-22` })),
  // Leonids (peak Nov 16-18)
  ...years(2024, 2030, (y) => ({ type: 'meteor-shower' as const, name: 'Leonids', start: `${y}-11-16`, end: `${y}-11-18` })),
  // Geminids (peak Dec 13-15)
  ...years(2024, 2030, (y) => ({ type: 'meteor-shower' as const, name: 'Geminids', start: `${y}-12-13`, end: `${y}-12-15` })),
];

function years(from: number, to: number, fn: (y: number) => CelestialEvent): CelestialEvent[] {
  const out: CelestialEvent[] = [];
  for (let y = from; y <= to; y++) out.push(fn(y));
  return out;
}

// ── Combined + lookup ──

const ALL_EVENTS: CelestialEvent[] = [
  ...SOLAR_ECLIPSES,
  ...LUNAR_ECLIPSES,
  ...METEOR_SHOWERS,
];

/** Build a fast Set<string> of 'YYYY-MM-DD' for each event type. */
function buildDateIndex(): Map<string, CelestialEvent[]> {
  const idx = new Map<string, CelestialEvent[]>();
  for (const ev of ALL_EVENTS) {
    const d0 = new Date(ev.start + 'T00:00:00Z');
    const d1 = new Date(ev.end + 'T00:00:00Z');
    for (let d = d0; d <= d1; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const list = idx.get(key) ?? [];
      list.push(ev);
      idx.set(key, list);
    }
  }
  return idx;
}

const DATE_INDEX = buildDateIndex();

/** Return all celestial events active on a given date (local calendar day). */
export function celestialEventsOn(date: Date): CelestialEvent[] {
  const key = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return DATE_INDEX.get(key) ?? [];
}

/**
 * Return the highest-priority celestial event for a date, if any.
 * Priority: solar eclipse > lunar eclipse > meteor shower.
 */
export function topCelestialEvent(date: Date): CelestialEvent | null {
  const events = celestialEventsOn(date);
  if (events.length === 0) return null;
  const solar = events.find((e) => e.type === 'solar-eclipse');
  if (solar) return solar;
  const lunar = events.find((e) => e.type === 'lunar-eclipse');
  if (lunar) return lunar;
  return events.find((e) => e.type === 'meteor-shower') ?? null;
}
