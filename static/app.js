"use strict";

/* ---------------------------------------------------------------------------
 * Beam — net-carb-first keto tracker.
 * All personal data lives in localStorage on this device. No accounts, no
 * server-side DB. The only network call is the optional Libre glucose bridge.
 * ------------------------------------------------------------------------- */

const RING_CIRC = 2 * Math.PI * 84; // matches r=84 in the SVG

const DEFAULTS = { budget: 20, units: "mmol", token: "" };

const state = {
  foods: [],
  settings: { ...DEFAULTS },
  date: todayKey(),
  meal: "breakfast",
  pending: null, // food awaiting quantity confirmation
  glucoseEnabled: false,
};

/* ---- storage ---- */
function loadSettings() {
  try {
    state.settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("beam.settings") || "{}") };
  } catch { state.settings = { ...DEFAULTS }; }
}
function saveSettings() {
  localStorage.setItem("beam.settings", JSON.stringify(state.settings));
}
function loadLog() {
  try { return JSON.parse(localStorage.getItem("beam.log") || "{}"); }
  catch { return {}; }
}
function saveLog(log) { localStorage.setItem("beam.log", JSON.stringify(log)); }
function dayEntries(date = state.date) { return loadLog()[date] || []; }

/* ---- date helpers ---- */
function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shiftDate(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayKey(dt);
}
function prettyDate(key) {
  const t = todayKey();
  if (key === t) return "Today";
  if (key === shiftDate(t, -1)) return "Yesterday";
  if (key === shiftDate(t, 1)) return "Tomorrow";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/* ---- math ---- */
const r1 = (n) => Math.round(n * 10) / 10;
function totals(entries) {
  return entries.reduce((a, e) => ({
    net: a.net + e.net_carbs_g,
    protein: a.protein + (e.protein_g || 0),
    fat: a.fat + (e.fat_g || 0),
    cals: a.cals + (e.calories || 0),
    fiber: a.fiber + (e.fiber_g || 0),
  }), { net: 0, protein: 0, fat: 0, cals: 0, fiber: 0 });
}

/* ---- flags ---- */
function flagChips(food, { compact = false } = {}) {
  const chips = [];
  if (food.gf === false) chips.push(`<span class="flag danger">🌾 gluten</span>`);
  if (food.df === false) chips.push(`<span class="flag warn">🥛 dairy</span>`);
  if (food.histamine === "high") chips.push(`<span class="flag danger">🧬 high histamine</span>`);
  else if (food.histamine === "moderate" && !compact) chips.push(`<span class="flag warn">🧬 mod histamine</span>`);
  if (food.leftover_risk && !compact) chips.push(`<span class="flag warn">⏳ eat fresh</span>`);
  return chips.join("");
}

/* =========================================================================
 * Rendering
 * ====================================================================== */
function render() {
  const entries = dayEntries();
  const t = totals(entries);
  const budget = state.settings.budget;

  // ring
  const pct = Math.min(t.net / budget, 1);
  const ringFill = document.getElementById("ringFill");
  ringFill.style.strokeDashoffset = RING_CIRC * (1 - pct);
  const over = t.net > budget;
  const near = !over && t.net >= budget * 0.8;
  const col = over ? "var(--red)" : near ? "var(--amber)" : "var(--teal)";
  ringFill.style.stroke = col;

  document.getElementById("ringValue").textContent = r1(t.net);
  const left = budget - t.net;
  const leftEl = document.getElementById("ringLeft");
  leftEl.textContent = over ? `${r1(-left)}g over` : `${r1(left)}g left`;
  leftEl.style.color = col;

  const msg = document.getElementById("budgetMsg");
  msg.className = "budget-msg" + (over ? " over" : near ? " warn" : "");
  msg.textContent = over
    ? `Over your ${budget}g budget — that's okay, note what tipped it.`
    : near
    ? `Getting close — ${r1(left)}g of headroom left.`
    : `${r1(left)}g of your ${budget}g budget left.`;

  // macros
  document.getElementById("mProtein").textContent = r1(t.protein) + "g";
  document.getElementById("mFat").textContent = r1(t.fat) + "g";
  document.getElementById("mCals").textContent = Math.round(t.cals);
  document.getElementById("mFiber").textContent = r1(t.fiber) + "g";

  // histamine load (MCAS awareness)
  const safetyRow = document.getElementById("safetyRow");
  const highHist = entries.filter((e) => e.histamine === "high").length;
  const modHist = entries.filter((e) => e.histamine === "moderate").length;
  if (entries.length) {
    safetyRow.hidden = false;
    const el = document.getElementById("histLoad");
    let level = "low", label = "Histamine load: low 🟢";
    if (highHist >= 2) { level = "high"; label = `Histamine load: high 🔴 — ${highHist} high-histamine items`; }
    else if (highHist === 1 || modHist >= 2) { level = "moderate"; label = `Histamine load: moderate 🟡`; }
    el.className = "chip hist " + level;
    el.textContent = label;
  } else {
    safetyRow.hidden = true;
  }

  // date header
  document.getElementById("dateLabel").textContent = prettyDate(state.date);
  document.getElementById("dateSub").textContent = state.date;

  renderLog(entries);
  if (typeof renderGlucose === "function") renderGlucose();
}

function renderLog(entries) {
  const list = document.getElementById("logList");
  const empty = document.getElementById("logEmpty");
  list.innerHTML = "";
  if (!entries.length) { empty.hidden = false; return; }
  empty.hidden = true;

  const order = ["breakfast", "lunch", "dinner", "snack"];
  const byMeal = {};
  entries.forEach((e, i) => { (byMeal[e.meal] ||= []).push({ ...e, _i: i }); });

  for (const meal of order) {
    const items = byMeal[meal];
    if (!items || !items.length) continue;
    const mealNet = r1(items.reduce((s, e) => s + e.net_carbs_g, 0));
    const label = document.createElement("div");
    label.className = "meal-group-label";
    label.textContent = `${meal} · ${mealNet}g net`;
    list.appendChild(label);

    for (const e of items) {
      const div = document.createElement("div");
      div.className = "log-item";
      div.innerHTML = `
        <div class="li-main">
          <div class="li-name">${escapeHtml(e.name)}</div>
          <div class="li-sub">${e.qty !== 1 ? r1(e.qty) + " × " : ""}${escapeHtml(e.serving || "")}</div>
          <div class="flags">${flagChips(e, { compact: true })}</div>
        </div>
        <div class="li-carb">${r1(e.net_carbs_g)}<small>g</small></div>
        <button class="li-del" aria-label="Remove">×</button>`;
      div.querySelector(".li-del").addEventListener("click", () => removeEntry(e._i));
      list.appendChild(div);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* =========================================================================
 * Mutations
 * ====================================================================== */
function addEntry(entry) {
  const log = loadLog();
  (log[state.date] ||= []).push(entry);
  saveLog(log);
  render();
}
function removeEntry(index) {
  const log = loadLog();
  if (!log[state.date]) return;
  log[state.date].splice(index, 1);
  if (!log[state.date].length) delete log[state.date];
  saveLog(log);
  render();
  toast("Removed");
}

/* =========================================================================
 * Add-food sheet
 * ====================================================================== */
function openSheet() {
  document.getElementById("sheet").hidden = false;
  const s = document.getElementById("search");
  s.value = "";
  renderResults("");
  setTimeout(() => s.focus(), 50);
}
function closeSheet() { document.getElementById("sheet").hidden = true; }

function scoreFood(food, q) {
  const name = food.name.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.includes(q)) return 1;
  if ((food.tags || []).some((t) => t.includes(q))) return 2;
  return -1;
}
function renderResults(q) {
  q = q.trim().toLowerCase();
  const box = document.getElementById("results");
  let list;
  if (!q) {
    list = state.foods.slice().sort((a, b) => a.name.localeCompare(b.name));
  } else {
    list = state.foods
      .map((f) => ({ f, s: scoreFood(f, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.f.name.localeCompare(b.f.name))
      .map((x) => x.f);
  }
  box.innerHTML = "";
  if (!list.length) {
    box.innerHTML = `<div class="empty">No match. Use “+ Add a custom food” below.</div>`;
    return;
  }
  for (const f of list) {
    const div = document.createElement("div");
    div.className = "result";
    div.innerHTML = `
      <div class="r-main">
        <div class="r-name">${escapeHtml(f.name)}</div>
        <div class="r-sub">${escapeHtml(f.serving)}</div>
        <div class="flags">${flagChips(f, { compact: true })}</div>
      </div>
      <div class="r-carb">${r1(f.net_carbs_g)}<small>g net</small></div>`;
    div.addEventListener("click", () => openQty(f));
    box.appendChild(div);
  }
}

/* ---- quantity sheet ---- */
function openQty(food) {
  state.pending = food;
  document.getElementById("qtyTitle").textContent = food.name;
  document.getElementById("qtyFlags").innerHTML = flagChips(food);
  document.getElementById("qtyNote").textContent = food.note || "";
  const input = document.getElementById("qtyInput");
  input.value = 1;
  updateQtyPreview();
  document.getElementById("qtySheet").hidden = false;
}
function closeQty() { document.getElementById("qtySheet").hidden = true; state.pending = null; }
function updateQtyPreview() {
  const f = state.pending; if (!f) return;
  const qty = Math.max(0.25, parseFloat(document.getElementById("qtyInput").value) || 1);
  document.getElementById("qtyPreview").innerHTML =
    `<b>${r1(f.net_carbs_g * qty)}g</b> net carbs · ${r1((f.protein_g || 0) * qty)}p / ${r1((f.fat_g || 0) * qty)}f · ${Math.round((f.calories || 0) * qty)} kcal`;
}
function confirmQty() {
  const f = state.pending; if (!f) return;
  const qty = Math.max(0.25, parseFloat(document.getElementById("qtyInput").value) || 1);
  addEntry({
    name: f.name, serving: f.serving, qty,
    net_carbs_g: r1(f.net_carbs_g * qty),
    protein_g: r1((f.protein_g || 0) * qty),
    fat_g: r1((f.fat_g || 0) * qty),
    calories: Math.round((f.calories || 0) * qty),
    fiber_g: r1((f.fiber_g || 0) * qty),
    gf: f.gf, df: f.df, histamine: f.histamine, leftover_risk: f.leftover_risk,
    meal: state.meal, time: new Date().toISOString(),
  });
  closeQty();
  closeSheet();
  toast(`Added ${f.name}`);
}

/* ---- custom food ---- */
function openCustom() { document.getElementById("customSheet").hidden = false; }
function closeCustom() {
  document.getElementById("customSheet").hidden = true;
  ["cName", "cCarbs", "cProtein", "cFat", "cCals", "cFiber"].forEach((id) => (document.getElementById(id).value = ""));
}
function confirmCustom() {
  const name = document.getElementById("cName").value.trim();
  if (!name) { toast("Give it a name"); return; }
  addEntry({
    name, serving: "1 serving", qty: 1,
    net_carbs_g: r1(+document.getElementById("cCarbs").value || 0),
    protein_g: r1(+document.getElementById("cProtein").value || 0),
    fat_g: r1(+document.getElementById("cFat").value || 0),
    calories: Math.round(+document.getElementById("cCals").value || 0),
    fiber_g: r1(+document.getElementById("cFiber").value || 0),
    gf: document.getElementById("cGf").checked,
    df: document.getElementById("cDf").checked,
    histamine: document.getElementById("cHist").value,
    meal: state.meal, time: new Date().toISOString(),
  });
  closeCustom();
  closeSheet();
  toast(`Added ${name}`);
}

/* =========================================================================
 * Glucose bridge (optional)
 * ====================================================================== */
async function refreshGlucose() {
  const card = document.getElementById("glucoseCard");
  if (!state.glucoseEnabled || !state.settings.token) { card.hidden = true; return; }
  card.hidden = false;
  try {
    const res = await fetch("/glucose/current", {
      headers: { Authorization: `Bearer ${state.settings.token}` },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Bad token" : `Error ${res.status}`);
    const g = res.json ? await res.json() : null;
    const valEl = document.getElementById("glucoseVal");
    const useMmol = state.settings.units === "mmol";
    valEl.textContent = useMmol ? g.mmol_per_l : g.mg_per_dl;
    valEl.className = "glucose-val" + (g.is_high ? " high" : g.is_low ? " low" : "");
    document.getElementById("glucoseUnit").textContent = useMmol ? "mmol/L" : "mg/dL";
    const arrows = { "rising quickly": "↑↑", rising: "↑", stable: "→", falling: "↓", "falling quickly": "↓↓" };
    document.getElementById("glucoseTrend").textContent = `${arrows[g.trend] || ""} ${g.trend || ""}`.trim();
    document.getElementById("glucoseAge").textContent =
      g.minutes_old === 0 ? "just now" : `${g.minutes_old} min ago`;
  } catch (e) {
    document.getElementById("glucoseVal").textContent = "–";
    document.getElementById("glucoseTrend").textContent = e.message;
    document.getElementById("glucoseAge").textContent = "";
  }
}

// Pull the latest 12h from the bridge into the local series, then re-render.
async function syncGlucose() {
  if (!state.glucoseEnabled || !state.settings.token) return;
  try {
    const { added, total } = await BeamGlucose.sync(state.settings.token);
    state.glucoseSync = { ok: true, total, added, at: Date.now() };
  } catch (e) {
    state.glucoseSync = { ok: false, msg: e.message };
  }
  renderGlucose();
}

// Render the day's glucose chart + per-meal spike cards for state.date.
function renderGlucose() {
  const card = document.getElementById("glucoseResponse");
  if (!state.glucoseEnabled || !state.settings.token) { card.hidden = true; return; }
  card.hidden = false;

  const unit = state.settings.units;
  const series = BeamGlucose.loadSeries();
  const events = BeamGlucose.mealEvents(dayEntries());

  const info = document.getElementById("gsyncInfo");
  if (state.glucoseSync && !state.glucoseSync.ok) info.textContent = state.glucoseSync.msg;
  else if (state.glucoseSync) info.textContent = `${state.glucoseSync.total} readings stored`;
  else info.textContent = "";

  document.getElementById("gchartWrap").innerHTML =
    BeamGlucose.buildDayChart(series, events, state.date, unit);

  const list = document.getElementById("gEvents");
  const empty = document.getElementById("gEmpty");
  list.innerHTML = "";

  if (!events.length) {
    empty.hidden = false;
    empty.textContent = "Log a meal to see how your glucose responds.";
    return;
  }

  const dayHasGlucose = BeamGlucose.seriesForDay(series, state.date).length >= 2;
  if (!dayHasGlucose) {
    empty.hidden = false;
    empty.textContent = "No glucose readings stored for this day yet. Open Beam during the day to capture them.";
    return;
  }
  empty.hidden = true;

  for (const ev of events) {
    const r = BeamGlucose.responseFor(ev, series);
    const div = document.createElement("div");
    div.className = "gevent";
    const time = new Date(ev.startT).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const foods = escapeHtml(ev.foods.slice(0, 3).join(", ") + (ev.foods.length > 3 ? "…" : ""));

    let badge, detail;
    if (!r) {
      badge = `<span class="spike none">no data</span>`;
      detail = `<div class="gevent-detail">No glucose readings around this time.</div>`;
    } else {
      const cls = BeamGlucose.spikeClass(r.delta);
      const sign = r.delta >= 0 ? "+" : "";
      badge = `<span class="spike ${cls}">▲ ${sign}${BeamGlucose.fmtDelta(r.delta, unit)}</span>`;
      detail = `<div class="gevent-detail">
        ${BeamGlucose.fmt(r.baseline, unit)} → <b>${BeamGlucose.fmt(r.peak, unit)}</b> ${BeamGlucose.unitLabel(unit)}
        · peak at ${r.timeToPeakMin} min</div>`;
    }

    div.innerHTML = `
      <div class="gevent-row">
        <div class="gevent-main">
          <div class="gevent-title">${escapeHtml(ev.label)} · ${time}</div>
          <div class="gevent-foods">${foods}</div>
        </div>
        <div class="gevent-right">
          <div class="gevent-net">${ev.net}g net</div>
          ${badge}
        </div>
      </div>
      ${detail}`;
    list.appendChild(div);
  }
}

/* =========================================================================
 * Settings
 * ====================================================================== */
function openSettings() {
  document.getElementById("setBudget").value = state.settings.budget;
  document.getElementById("setUnits").value = state.settings.units;
  document.getElementById("setToken").value = state.settings.token;
  document.getElementById("glucoseStatus").textContent = state.glucoseEnabled
    ? "(server: connected)" : "(server: not configured)";
  document.getElementById("settingsSheet").hidden = false;
}
function closeSettings() {
  state.settings.budget = Math.max(5, +document.getElementById("setBudget").value || 20);
  state.settings.units = document.getElementById("setUnits").value;
  state.settings.token = document.getElementById("setToken").value.trim();
  saveSettings();
  document.getElementById("settingsSheet").hidden = true;
  render();
  refreshGlucose();
  syncGlucose();
}
function exportData() {
  const blob = new Blob([JSON.stringify({ settings: state.settings, log: loadLog(), glucose: BeamGlucose.loadSeries() }, null, 2)],
    { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `beam-export-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function clearData() {
  if (!confirm("Delete ALL logged food and settings on this device? This can't be undone.")) return;
  localStorage.removeItem("beam.log");
  localStorage.removeItem("beam.settings");
  BeamGlucose.clear();
  state.settings = { ...DEFAULTS };
  render();
  document.getElementById("settingsSheet").hidden = true;
  toast("All data cleared");
}

/* ---- toast ---- */
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 1800);
}

/* =========================================================================
 * Wiring
 * ====================================================================== */
function bind() {
  document.getElementById("prevDay").onclick = () => { state.date = shiftDate(state.date, -1); render(); };
  document.getElementById("nextDay").onclick = () => { state.date = shiftDate(state.date, 1); render(); };
  document.getElementById("dateBtn").onclick = () => { state.date = todayKey(); render(); };

  document.getElementById("addBtn").onclick = openSheet;
  document.querySelectorAll("[data-close]").forEach((el) => (el.onclick = closeSheet));
  document.getElementById("search").addEventListener("input", (e) => renderResults(e.target.value));

  document.getElementById("mealTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".meal-tab"); if (!btn) return;
    state.meal = btn.dataset.meal;
    document.querySelectorAll(".meal-tab").forEach((b) => b.classList.toggle("active", b === btn));
  });

  document.querySelectorAll("[data-qclose]").forEach((el) => (el.onclick = closeQty));
  document.getElementById("qtyInput").addEventListener("input", updateQtyPreview);
  document.getElementById("qtyMinus").onclick = () => { stepQty(-0.25); };
  document.getElementById("qtyPlus").onclick = () => { stepQty(0.25); };
  document.getElementById("qtyAdd").onclick = confirmQty;

  document.getElementById("customBtn").onclick = openCustom;
  document.querySelectorAll("[data-cclose]").forEach((el) => (el.onclick = closeCustom));
  document.getElementById("customAdd").onclick = confirmCustom;

  document.getElementById("settingsBtn").onclick = openSettings;
  document.querySelectorAll("[data-sclose]").forEach((el) => (el.onclick = closeSettings));
  document.getElementById("exportBtn").onclick = exportData;
  document.getElementById("clearBtn").onclick = clearData;
  document.getElementById("glucoseRefresh").onclick = () => { refreshGlucose(); syncGlucose(); };
}
function stepQty(d) {
  const input = document.getElementById("qtyInput");
  input.value = Math.max(0.25, r1((parseFloat(input.value) || 1) + d));
  updateQtyPreview();
}

/* ---- boot ---- */
async function boot() {
  loadSettings();
  bind();
  render();

  try {
    const res = await fetch("foods.json");
    const data = await res.json();
    state.foods = data.foods || [];
  } catch { toast("Couldn't load food database"); }

  try {
    const res = await fetch("/config");
    const cfg = await res.json();
    state.glucoseEnabled = !!cfg.glucose_enabled;
  } catch { state.glucoseEnabled = false; }
  refreshGlucose();
  syncGlucose();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
