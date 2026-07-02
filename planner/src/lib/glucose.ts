// CGM integration via the Beam bridge (../../app.py — FastAPI on Fly.io).
//
// Beam's /glucose/history only reaches back 12h, so the planner polls while
// open and accumulates readings in Dexie (db.glucose) to build the full-day
// picture the ring wants — and to keep past days for symptom/diary correlation.
//
// Values are stored in mg/dL (Beam's native unit); mmol/L is derived at
// display time. Thresholds are stored in mmol/L because that's the display
// default and what the user reasons in.

import { writable, get } from 'svelte/store';
import { db } from './db';
import { todayKey } from './days';

const URL_KEY = 'radial-planner-beam-url';
const TOKEN_KEY = 'radial-planner-beam-token';
const UNIT_KEY = 'radial-planner-glucose-unit'; // 'mmol' | 'mgdl'
const LOW_KEY = 'radial-planner-glucose-low'; // mmol/L
const HIGH_KEY = 'radial-planner-glucose-high'; // mmol/L

const MGDL_PER_MMOL = 18.0182;
const POLL_MS = 5 * 60 * 1000; // Libre uploads roughly every 5 minutes
const HISTORY_REFRESH_MS = 30 * 60 * 1000; // periodic gap-fill from /history
const KEEP_DAYS = 90;

export interface GlucosePoint {
  ts: number; // epoch ms (UTC instant; bucketing into days is done locally)
  mgdl: number;
}

export interface CurrentGlucose {
  mgdl: number;
  mmol: number;
  trend: string; // Beam's text: "stable", "rising", ...
  minutesOld: number;
  isHigh: boolean;
  isLow: boolean;
  fetchedAt: number;
}

export interface BeamConfig {
  url: string;
  token: string;
  unit: 'mmol' | 'mgdl';
  lowMmol: number;
  highMmol: number;
}

function lsGet(key: string): string {
  try {
    return typeof localStorage === 'undefined' ? '' : localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function getBeamConfig(): BeamConfig {
  return {
    url: lsGet(URL_KEY).replace(/\/+$/, ''),
    token: lsGet(TOKEN_KEY),
    unit: lsGet(UNIT_KEY) === 'mgdl' ? 'mgdl' : 'mmol',
    lowMmol: parseFloat(lsGet(LOW_KEY)) || 3.9,
    highMmol: parseFloat(lsGet(HIGH_KEY)) || 10.0,
  };
}

export function saveBeamConfig(cfg: Partial<BeamConfig>) {
  try {
    if (cfg.url !== undefined) localStorage.setItem(URL_KEY, cfg.url.trim());
    if (cfg.token !== undefined) localStorage.setItem(TOKEN_KEY, cfg.token.trim());
    if (cfg.unit !== undefined) localStorage.setItem(UNIT_KEY, cfg.unit);
    if (cfg.lowMmol !== undefined) localStorage.setItem(LOW_KEY, String(cfg.lowMmol));
    if (cfg.highMmol !== undefined) localStorage.setItem(HIGH_KEY, String(cfg.highMmol));
  } catch (e) {
    console.warn('[glucose] localStorage write failed:', e);
  }
  beamConfig.set(getBeamConfig());
  restartGlucose();
}

export const beamConfig = writable<BeamConfig>(getBeamConfig());
export const beamEnabled = () => {
  const c = get(beamConfig);
  return !!(c.url && c.token);
};

// Live reading for the hub; null until the first successful fetch.
export const currentGlucose = writable<CurrentGlucose | null>(null);
// Today's accumulated curve for the ring backdrop, sorted by ts ascending.
export const todayGlucose = writable<GlucosePoint[]>([]);

export const mgdlToMmol = (mgdl: number) => mgdl / MGDL_PER_MMOL;
export const mmolToMgdl = (mmol: number) => mmol * MGDL_PER_MMOL;

export function formatGlucose(mgdl: number, unit: 'mmol' | 'mgdl' = get(beamConfig).unit): string {
  return unit === 'mmol' ? mgdlToMmol(mgdl).toFixed(1) : String(Math.round(mgdl));
}

export const TREND_ARROWS: Record<string, string> = {
  'falling quickly': '↓↓',
  falling: '↘',
  stable: '→',
  rising: '↗',
  'rising quickly': '↑↑',
};

async function beamFetch(path: string): Promise<any> {
  const cfg = get(beamConfig);
  if (!cfg.url || !cfg.token) throw new Error('Beam not configured');
  const res = await fetch(`${cfg.url}${path}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) throw new Error(`Beam ${res.status}: ${await res.text()}`);
  return res.json();
}

// One-off connection test for the settings panel.
export async function testBeam(): Promise<CurrentGlucose> {
  const m = await fetchCurrent();
  if (!m) throw new Error('no current measurement');
  return m;
}

// The local-day window [start, end) for a YYYY-MM-DD key.
function dayWindow(key: string): { start: number; end: number } {
  const [y, mo, d] = key.split('-').map(Number);
  const start = new Date(y, mo - 1, d).getTime();
  return { start, end: start + 24 * 3600 * 1000 };
}

export async function glucoseForDay(key: string): Promise<GlucosePoint[]> {
  const { start, end } = dayWindow(key);
  return db.glucose.where('ts').between(start, end, true, false).sortBy('ts');
}

async function refreshTodayStore() {
  todayGlucose.set(await glucoseForDay(todayKey()));
}

async function storePoints(points: { mg_per_dl: number; timestamp_utc: string }[]) {
  if (!points.length) return;
  await db.glucose.bulkPut(
    points.map((p) => ({ ts: new Date(p.timestamp_utc).getTime(), mgdl: p.mg_per_dl })),
  );
}

async function fetchCurrent(): Promise<CurrentGlucose | null> {
  const m = await beamFetch('/glucose/current');
  const reading: CurrentGlucose = {
    mgdl: m.mg_per_dl,
    mmol: m.mmol_per_l,
    trend: m.trend ?? 'unknown',
    minutesOld: m.minutes_old ?? 0,
    isHigh: !!m.is_high,
    isLow: !!m.is_low,
    fetchedAt: Date.now(),
  };
  currentGlucose.set(reading);
  await storePoints([
    {
      mg_per_dl: m.mg_per_dl,
      timestamp_utc: m.timestamp_utc,
    },
  ]);
  return reading;
}

async function fetchHistory() {
  const data = await beamFetch('/glucose/history?minutes=720');
  await storePoints(data.points ?? []);
}

async function prune() {
  try {
    await db.glucose.where('ts').below(Date.now() - KEEP_DAYS * 24 * 3600 * 1000).delete();
  } catch (e) {
    console.warn('[glucose] prune failed:', e);
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastHistoryFetch = 0;

async function tick() {
  try {
    await fetchCurrent();
    if (Date.now() - lastHistoryFetch > HISTORY_REFRESH_MS) {
      lastHistoryFetch = Date.now();
      await fetchHistory();
    }
    await refreshTodayStore();
  } catch (e) {
    // Sensor gaps, sleep-mode cold starts and offline stretches are routine;
    // keep the last reading on screen (the hub dims stale values) and retry
    // on the next tick.
    console.warn('[glucose] poll failed:', e);
  }
}

export function startGlucose() {
  stopGlucose();
  if (!beamEnabled()) {
    // still surface whatever history is cached locally
    refreshTodayStore().catch(() => {});
    return;
  }
  prune();
  lastHistoryFetch = Date.now();
  Promise.resolve()
    .then(fetchHistory)
    .catch((e) => console.warn('[glucose] backfill failed:', e))
    .then(() => tick());
  pollTimer = setInterval(tick, POLL_MS);
}

export function stopGlucose() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function restartGlucose() {
  if (typeof window !== 'undefined') startGlucose();
}

// Summary for the AI companion's prompt context (null when not configured or
// no data yet today). Reads the live stores synchronously.
export function glucoseContextSummary(): string | null {
  if (!beamEnabled()) return null;
  const cfg = get(beamConfig);
  const cur = get(currentGlucose);
  const points = get(todayGlucose);
  const parts: string[] = [];
  if (cur) {
    const staleness = cur.minutesOld > 15 ? ` (STALE: ${cur.minutesOld} min old)` : '';
    parts.push(
      `Current blood glucose: ${formatGlucose(cur.mgdl)} ${cfg.unit === 'mmol' ? 'mmol/L' : 'mg/dL'}, trend ${cur.trend}${staleness}.`,
    );
  }
  if (points.length > 1) {
    const mmols = points.map((p) => mgdlToMmol(p.mgdl));
    const min = Math.min(...mmols);
    const max = Math.max(...mmols);
    const inRange = mmols.filter((v) => v >= cfg.lowMmol && v <= cfg.highMmol).length;
    const pct = Math.round((inRange / mmols.length) * 100);
    const fmt = (v: number) =>
      cfg.unit === 'mmol' ? v.toFixed(1) : String(Math.round(mmolToMgdl(v)));
    parts.push(
      `Today so far (${points.length} readings): range ${fmt(min)}–${fmt(max)}, ${pct}% time in target (${fmt(cfg.lowMmol)}–${fmt(cfg.highMmol)}).`,
    );
  }
  return parts.length ? parts.join(' ') : null;
}
