"use strict";

/* ---------------------------------------------------------------------------
 * BeamGlucose — local glucose history store + meal/glucose correlation.
 *
 * The Libre bridge only serves ~12h of history, so we append every reading we
 * see into localStorage and build our own multi-week series. Meals (from the
 * food log) are clustered into "eating events" and scored against that series:
 * baseline -> peak -> delta (your real spike). All maths is in mg/dL; the UI
 * converts for display.
 * ------------------------------------------------------------------------- */

const BeamGlucose = (() => {
  const KEY = "beam.glucose";
  const MGDL_PER_MMOL = 18.0182;
  const PRUNE_DAYS = 35;
  const GAP_MIN = 45;            // entries >45min apart start a new eating event
  const PRE_MIN = 15;            // look this far before eating for baseline
  const POST_MIN = 150;          // look this far after for the peak
  const RANGE_LO = 70, RANGE_HI = 180; // in-range band (mg/dL)

  /* ---- store: array of [epochSec, mgdl], sorted ascending ---- */
  function loadSeries() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch { return []; }
  }
  function saveSeries(a) { localStorage.setItem(KEY, JSON.stringify(a)); }
  function clear() { localStorage.removeItem(KEY); }

  // Merge new {t(ms), mgdl} points, dedupe to one-per-minute, prune old, save.
  function mergePoints(points) {
    const map = new Map();
    for (const [t, v] of loadSeries()) map.set(Math.round(t / 60), [t, v]);
    let added = 0;
    for (const p of points) {
      const sec = Math.round(p.t / 1000);
      const k = Math.round(sec / 60);
      if (!map.has(k)) added++;
      map.set(k, [sec, Math.round(p.mgdl)]);
    }
    const cutoff = Date.now() / 1000 - PRUNE_DAYS * 86400;
    const merged = [...map.values()].filter(([t]) => t >= cutoff).sort((a, b) => a[0] - b[0]);
    saveSeries(merged);
    return { added, total: merged.length };
  }

  // Pull the last 12h from the bridge and fold it into the store.
  async function sync(token) {
    const res = await fetch("/glucose/history?minutes=720", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Bad token" : `Error ${res.status}`);
    const data = await res.json();
    const pts = (data.points || []).map((p) => ({
      t: Date.parse(p.timestamp_utc),
      mgdl: p.mg_per_dl,
    })).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.mgdl));
    return mergePoints(pts);
  }

  /* ---- unit helpers ---- */
  const toMmol = (mgdl) => Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10;
  const fmt = (mgdl, unit) => (unit === "mmol" ? toMmol(mgdl) : Math.round(mgdl));
  const fmtDelta = (mgdl, unit) =>
    unit === "mmol" ? (mgdl / MGDL_PER_MMOL).toFixed(1) : Math.round(mgdl);
  const unitLabel = (unit) => (unit === "mmol" ? "mmol/L" : "mg/dL");

  // Spike severity from a delta in mg/dL (keto context: flatter is better).
  function spikeClass(deltaMgdl) {
    if (deltaMgdl == null) return "none";
    if (deltaMgdl < 20) return "low";        // <1.1 mmol
    if (deltaMgdl < 40) return "moderate";   // <2.2 mmol
    return "high";
  }

  /* ---- meal clustering ---- */
  function dayBounds(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const start = new Date(y, m - 1, d).getTime();
    return [start, start + 86400000];
  }

  // Group a day's log entries into eating events by time proximity.
  function mealEvents(entries) {
    const withT = entries
      .filter((e) => e.time)
      .map((e) => ({ ...e, _t: Date.parse(e.time) }))
      .filter((e) => Number.isFinite(e._t))
      .sort((a, b) => a._t - b._t);

    const events = [];
    let cur = null;
    for (const e of withT) {
      if (!cur || e._t - cur.endT > GAP_MIN * 60000) {
        cur = { startT: e._t, endT: e._t, items: [], net: 0 };
        events.push(cur);
      }
      cur.items.push(e);
      cur.endT = e._t;
      cur.net += e.net_carbs_g || 0;
    }
    for (const ev of events) {
      ev.net = Math.round(ev.net * 10) / 10;
      const meals = [...new Set(ev.items.map((i) => i.meal))];
      ev.label = meals.length === 1 ? cap(meals[0]) : "Meal";
      ev.foods = ev.items.map((i) => i.name);
    }
    return events;
  }
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  /* ---- the correlation itself ---- */
  // Returns {baseline, peak, delta, timeToPeakMin, points} in mg/dL, or null
  // if there isn't enough glucose coverage around the meal to be meaningful.
  function responseFor(event, series) {
    if (!series.length) return null;
    const startSec = event.startT / 1000;
    const lo = startSec - PRE_MIN * 60;
    const hi = startSec + POST_MIN * 60;

    // baseline: nearest reading in [-PRE_MIN, +5min], preferring at/just before
    let baseline = null;
    for (const [t, v] of series) {
      if (t < lo || t > startSec + 300) continue;
      if (!baseline || Math.abs(t - startSec) < Math.abs(baseline[0] - startSec)) baseline = [t, v];
    }
    if (!baseline) return null;

    const window = series.filter(([t]) => t >= baseline[0] && t <= hi);
    const post = window.filter(([t]) => t > startSec - 60);
    if (post.length < 2) return null; // need readings after eating

    let peak = baseline;
    for (const [t, v] of post) if (v > peak[1]) peak = [t, v];

    return {
      baselineT: baseline[0] * 1000,
      baseline: baseline[1],
      peak: peak[1],
      delta: peak[1] - baseline[1],
      timeToPeakMin: Math.max(0, Math.round((peak[0] - startSec) / 60)),
      points: window.map(([t, v]) => [t * 1000, v]),
    };
  }

  // Aggregate every tracked eating event across all logged days into a
  // per-food ranking by average glucose spike. A meal's spike is attributed to
  // all foods in it, so combos share the blame — but over many meals the real
  // culprits separate out. Foods need >= minSamples tracked responses to rank.
  function foodInsights(log, series, { minSamples = 2 } = {}) {
    const agg = new Map();
    let trackedEvents = 0;
    for (const date of Object.keys(log || {})) {
      for (const ev of mealEvents(log[date] || [])) {
        const r = responseFor(ev, series);
        if (!r) continue;
        trackedEvents++;
        for (const item of ev.items) {
          const a = agg.get(item.name) || { deltas: [], carbs: [] };
          a.deltas.push(r.delta);
          a.carbs.push(item.net_carbs_g || 0);
          agg.set(item.name, a);
        }
      }
    }
    const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const ranked = [...agg.entries()]
      .map(([name, a]) => ({
        name, n: a.deltas.length,
        avgDelta: avg(a.deltas),
        maxDelta: Math.max(...a.deltas),
        avgCarbs: avg(a.carbs),
      }))
      .filter((r) => r.n >= minSamples)
      .sort((a, b) => b.avgDelta - a.avgDelta);
    return { trackedEvents, ranked };
  }

  function seriesForDay(series, dateKey) {
    const [a, b] = dayBounds(dateKey);
    return series.filter(([t]) => t * 1000 >= a && t * 1000 < b);
  }

  // Time-in-range for a day's readings (the standard CGM metric).
  function timeInRange(series, dateKey) {
    const day = seriesForDay(series, dateKey);
    if (!day.length) return null;
    let inR = 0, below = 0, above = 0, sum = 0;
    for (const [, v] of day) {
      sum += v;
      if (v < RANGE_LO) below++;
      else if (v > RANGE_HI) above++;
      else inR++;
    }
    const n = day.length;
    const pct = (x) => Math.round((x / n) * 100);
    return { n, avgMgdl: sum / n, inPct: pct(inR), belowPct: pct(below), abovePct: pct(above) };
  }

  /* ---- day chart (returns an SVG string; "" if nothing to show) ---- */
  function buildDayChart(series, events, dateKey, unit) {
    const day = seriesForDay(series, dateKey);
    if (day.length < 2) return "";

    const W = 320, H = 130, padL = 30, padR = 8, padT = 10, padB = 18;
    const xs = day.map(([t]) => t * 1000);
    const evXs = events.map((e) => e.startT);
    let minX = Math.min(...xs, ...evXs);
    let maxX = Math.max(...xs, ...evXs);
    if (maxX - minX < 3600000) maxX = minX + 3600000; // at least 1h span
    minX -= 600000; maxX += 600000;

    const vals = day.map(([, v]) => v);
    let minY = Math.min(...vals, RANGE_LO) - 8;
    let maxY = Math.max(...vals, RANGE_HI) + 8;

    const px = (t) => padL + ((t - minX) / (maxX - minX)) * (W - padL - padR);
    const py = (v) => padT + (1 - (v - minY) / (maxY - minY)) * (H - padT - padB);

    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const line = day.map(([t, v], i) => `${i ? "L" : "M"}${px(t * 1000).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");

    // in-range band
    const bandY = py(RANGE_HI), bandH = py(RANGE_LO) - py(RANGE_HI);
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="gchart" preserveAspectRatio="none" role="img" aria-label="Glucose for the day">`;
    svg += `<rect x="${padL}" y="${bandY.toFixed(1)}" width="${W - padL - padR}" height="${bandH.toFixed(1)}" class="grange"/>`;

    // y gridlines/labels at range edges
    for (const gv of [RANGE_LO, RANGE_HI]) {
      const y = py(gv).toFixed(1);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" class="ggrid"/>`;
      svg += `<text x="2" y="${(+y + 3).toFixed(1)}" class="gaxis">${fmt(gv, unit)}</text>`;
    }

    // meal markers
    for (const e of events) {
      const x = px(Math.min(Math.max(e.startT, minX), maxX)).toFixed(1);
      svg += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${H - padB}" class="gmeal"/>`;
      svg += `<circle cx="${x}" cy="${padT}" r="3" class="gmeal-dot"/>`;
      svg += `<text x="${x}" y="${H - 6}" class="gmeal-label" text-anchor="middle">${esc(e.net)}g</text>`;
    }

    svg += `<path d="${line}" class="gline"/></svg>`;
    return svg;
  }

  return {
    loadSeries, saveSeries, clear, mergePoints, sync,
    mealEvents, responseFor, foodInsights, seriesForDay, timeInRange, buildDayChart,
    fmt, fmtDelta, unitLabel, spikeClass, toMmol,
    GAP_MIN, RANGE_LO, RANGE_HI,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BeamGlucose;
