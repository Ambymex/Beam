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

/* ---- favourites & recents (one-tap re-logging) ---- */
// A "template" is a ready-to-log entry minus meal/time: the exact thing you ate
// last, including quantity and already-scaled macros.
const TEMPLATE_KEYS = ["name", "serving", "qty", "net_carbs_g", "protein_g", "fat_g", "calories", "fiber_g", "gf", "df", "histamine", "leftover_risk"];
function toTemplate(o) {
  const t = {};
  for (const k of TEMPLATE_KEYS) if (o[k] !== undefined) t[k] = o[k];
  return t;
}
function loadFavs() {
  try { const a = JSON.parse(localStorage.getItem("beam.favourites") || "[]"); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function saveFavs(a) { localStorage.setItem("beam.favourites", JSON.stringify(a)); }
function isFav(name) { return loadFavs().some((f) => f.name === name); }
function toggleFav(template) {
  const favs = loadFavs();
  const i = favs.findIndex((f) => f.name === template.name);
  if (i >= 0) favs.splice(i, 1);
  else favs.unshift(toTemplate(template));
  saveFavs(favs);
}
// Most-recently-logged distinct foods (by name), newest first, excluding favs.
function getRecents(limit = 12) {
  const log = loadLog();
  const all = [];
  for (const date of Object.keys(log)) for (const e of log[date]) all.push(e);
  all.sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
  const seen = new Set(loadFavs().map((f) => f.name));
  const out = [];
  for (const e of all) {
    if (seen.has(e.name)) continue;
    seen.add(e.name);
    out.push(toTemplate(e));
    if (out.length >= limit) break;
  }
  return out;
}
// Guess the meal slot from the clock, matching how meals cluster naturally.
function mealForHour(h) {
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}
// A timestamp that lands on the viewed day (real clock time if it's today).
function entryTimeForDate(dateKey) {
  const now = new Date();
  if (dateKey === todayKey()) return now.toISOString();
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes()).toISOString();
}

/* ---- saved meals: a named bundle of foods logged in one tap ---- */
function loadMeals() {
  try { const a = JSON.parse(localStorage.getItem("beam.meals") || "[]"); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function saveMeals(a) { localStorage.setItem("beam.meals", JSON.stringify(a)); }
function savedMealNet(m) { return r1(m.items.reduce((s, t) => s + (t.net_carbs_g || 0), 0)); }
function addSavedMeal(name, items) {
  const meals = loadMeals();
  meals.unshift({ id: "m" + Date.now(), name, items: items.map(toTemplate) });
  saveMeals(meals);
}
function deleteSavedMeal(id) {
  saveMeals(loadMeals().filter((m) => m.id !== id));
}

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

/* ---- streak (kind by design: a grace day, no guilt) ---- */
// A day "counts" if you logged something and stayed at/under budget.
function dayQualifies(log, key, budget) {
  const e = log[key] || [];
  return e.length > 0 && totals(e).net <= budget;
}
function streakStats() {
  const log = loadLog();
  const budget = state.settings.budget;

  // Best run ever: longest stretch of consecutive calendar days that qualify.
  const quals = Object.keys(log).filter((k) => dayQualifies(log, k, budget)).sort();
  let best = 0, run = 0, prev = null;
  for (const k of quals) {
    run = prev && shiftDate(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }

  // Current run, ending today — but if today simply hasn't been started yet,
  // we count back from yesterday so an empty morning never "breaks" anything.
  let key = todayKey();
  if (!dayQualifies(log, key, budget) && !(log[key] || []).length) key = shiftDate(key, -1);
  let current = 0;
  while (dayQualifies(log, key, budget)) { current++; key = shiftDate(key, -1); }

  // Last 7 days status for a gentle, informational strip.
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const k = shiftDate(todayKey(), -i);
    const e = log[k] || [];
    week.push(!e.length ? "none" : totals(e).net <= budget ? "in" : "over");
  }
  return { current, best, week };
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

  renderStreak();
  renderLog(entries);
  renderQuickAdd();
  if (typeof renderGlucose === "function") renderGlucose();
}

// Gentle, non-punishing streak display.
function renderStreak() {
  const el = document.getElementById("streakLine");
  const { current, best, week } = streakStats();
  const dots = week.map((s) => `<span class="wk-dot ${s}" title="${s}"></span>`).join("");
  let headline;
  if (current >= 1) {
    headline = `✨ ${current} day${current === 1 ? "" : "s"} within budget`;
  } else {
    headline = `🌱 A fresh start — log a meal to begin`;
  }
  const bestBit = best > Math.max(current, 0) ? `<span class="streak-best">best ${best}</span>` : "";
  el.innerHTML = `<span class="streak-head">${headline}</span>${bestBit}<span class="wk-strip">${dots}</span>`;
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
    const groupNet = r1(items.reduce((s, e) => s + e.net_carbs_g, 0));
    const label = document.createElement("div");
    label.className = "meal-group-label";
    label.innerHTML = `<span>${meal} · ${groupNet}g net</span>`;
    if (items.length >= 2) {
      const save = document.createElement("button");
      save.className = "save-meal-btn";
      save.textContent = "＋ Save meal";
      save.addEventListener("click", () => saveGroupAsMeal(items, meal[0].toUpperCase() + meal.slice(1)));
      label.appendChild(save);
    }
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
// Scale a food (per-serving) to qty servings, producing a template (no meal/time).
function scaledTemplate(f, qty) {
  return {
    name: f.name, serving: f.serving, qty,
    net_carbs_g: r1(f.net_carbs_g * qty),
    protein_g: r1((f.protein_g || 0) * qty),
    fat_g: r1((f.fat_g || 0) * qty),
    calories: Math.round((f.calories || 0) * qty),
    fiber_g: r1((f.fiber_g || 0) * qty),
    gf: f.gf, df: f.df, histamine: f.histamine, leftover_risk: f.leftover_risk,
  };
}
function curQty() { return Math.max(0.25, parseFloat(document.getElementById("qtyInput").value) || 1); }
function openQty(food) {
  state.pending = food;
  document.getElementById("qtyTitle").textContent = food.name;
  document.getElementById("qtyFlags").innerHTML = flagChips(food);
  document.getElementById("qtyNote").textContent = food.note || "";
  document.getElementById("qtyInput").value = 1;
  updateFavBtn();
  updateQtyPreview();
  document.getElementById("qtySheet").hidden = false;
}
function closeQty() { document.getElementById("qtySheet").hidden = true; state.pending = null; }
function updateFavBtn() {
  const btn = document.getElementById("qtyFav");
  const on = state.pending && isFav(state.pending.name);
  btn.textContent = on ? "★" : "☆";
  btn.classList.toggle("on", !!on);
}
function updateQtyPreview() {
  const f = state.pending; if (!f) return;
  const qty = curQty();
  document.getElementById("qtyPreview").innerHTML =
    `<b>${r1(f.net_carbs_g * qty)}g</b> net carbs · ${r1((f.protein_g || 0) * qty)}p / ${r1((f.fat_g || 0) * qty)}f · ${Math.round((f.calories || 0) * qty)} kcal`;
}
function toggleQtyFav() {
  if (!state.pending) return;
  toggleFav(scaledTemplate(state.pending, curQty()));
  updateFavBtn();
  renderQuickAdd();
}
function confirmQty() {
  if (!state.pending) return;
  addEntry({ ...scaledTemplate(state.pending, curQty()), meal: state.meal, time: new Date().toISOString() });
  closeQty();
  closeSheet();
  toast(`Added ${state.pending ? state.pending.name : "food"}`);
}

/* ---- quick add: one-tap re-logging from favourites & recents ---- */
function quickAdd(template) {
  const date = state.date;
  const meal = mealForHour(new Date().getHours());
  addEntry({ ...template, meal, time: entryTimeForDate(date) });
  toastUndo(`Added ${template.name} → ${meal}`, () => {
    const log = loadLog();
    const arr = log[date];
    if (!arr || !arr.length) return;
    arr.pop(); // quick-add appended to the end
    if (!arr.length) delete log[date];
    saveLog(log);
    render();
  });
}
// Log every food in a saved meal at once; they share a timestamp so they
// cluster into a single eating event for glucose correlation.
function logSavedMeal(meal) {
  const date = state.date;
  const slot = mealForHour(new Date().getHours());
  const time = entryTimeForDate(date);
  const log = loadLog();
  const arr = (log[date] ||= []);
  const startLen = arr.length;
  for (const t of meal.items) arr.push({ ...t, meal: slot, time });
  saveLog(log);
  render();
  toastUndo(`Added ${meal.name} (${meal.items.length} items) → ${slot}`, () => {
    const l = loadLog();
    if (l[date]) {
      l[date].splice(startLen, meal.items.length);
      if (!l[date].length) delete l[date];
      saveLog(l);
      render();
    }
  });
}
// Build a saved meal from a logged meal group.
function saveGroupAsMeal(items, defaultName) {
  const name = (prompt("Name this saved meal:", defaultName) || "").trim();
  if (!name) return;
  addSavedMeal(name, items);
  renderQuickAdd();
  toast(`Saved "${name}"`);
}

function renderQuickAdd() {
  const section = document.getElementById("quickAdd");
  const row = document.getElementById("quickChips");
  const meals = loadMeals();
  const favs = loadFavs();
  const recents = getRecents(12 - Math.min(favs.length, 6) - Math.min(meals.length, 4));
  if (!meals.length && !favs.length && !recents.length) { section.hidden = true; return; }
  section.hidden = false;
  row.innerHTML = "";

  // saved meals first (highest-intent shortcuts)
  for (const m of meals) {
    const chip = document.createElement("div");
    chip.className = "qchip is-meal";
    chip.innerHTML = `
      <button class="qchip-main">
        <span class="qchip-name">🍽 ${escapeHtml(m.name)}</span>
        <span class="qchip-net">${m.items.length} items · ${savedMealNet(m)}g</span>
      </button>
      <button class="qchip-star" aria-label="Delete saved meal">×</button>`;
    chip.querySelector(".qchip-main").addEventListener("click", () => logSavedMeal(m));
    chip.querySelector(".qchip-star").addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Delete saved meal "${m.name}"?`)) { deleteSavedMeal(m.id); renderQuickAdd(); }
    });
    row.appendChild(chip);
  }

  // then favourites, then recents
  const foods = [...favs.slice(0, 6).map((t) => ({ t, fav: true })), ...recents.map((t) => ({ t, fav: false }))];
  for (const { t, fav } of foods) {
    const chip = document.createElement("div");
    chip.className = "qchip" + (fav ? " is-fav" : "");
    chip.innerHTML = `
      <button class="qchip-main">
        <span class="qchip-name">${escapeHtml(t.name)}</span>
        <span class="qchip-net">${r1(t.net_carbs_g)}g</span>
      </button>
      <button class="qchip-star" aria-label="${fav ? "Unpin" : "Pin"}">${fav ? "★" : "☆"}</button>`;
    chip.querySelector(".qchip-main").addEventListener("click", () => quickAdd(t));
    chip.querySelector(".qchip-star").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(t);
      renderQuickAdd();
    });
    row.appendChild(chip);
  }
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

  // Time-in-range summary for the viewed day.
  const tirBox = document.getElementById("tirBox");
  const tir = BeamGlucose.timeInRange(series, state.date);
  if (tir) {
    tirBox.hidden = false;
    tirBox.innerHTML = `
      <div class="tir-top">
        <span class="tir-pct">${tir.inPct}%</span>
        <span class="tir-label">in range · avg ${BeamGlucose.fmt(tir.avgMgdl, unit)} ${BeamGlucose.unitLabel(unit)}</span>
      </div>
      <div class="tir-bar">
        <span class="tir-seg below" style="width:${tir.belowPct}%"></span>
        <span class="tir-seg in" style="width:${tir.inPct}%"></span>
        <span class="tir-seg above" style="width:${tir.abovePct}%"></span>
      </div>`;
  } else {
    tirBox.hidden = true;
  }

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

/* ---- insights: cross-day food → spike ranking ---- */
function openInsights() {
  const unit = state.settings.units;
  const { trackedEvents, ranked } = BeamGlucose.foodInsights(loadLog(), BeamGlucose.loadSeries());
  const sub = document.getElementById("insightsSub");
  const body = document.getElementById("insightsBody");
  body.innerHTML = "";

  if (!ranked.length) {
    sub.textContent = `Tracked ${trackedEvents} eating event${trackedEvents === 1 ? "" : "s"} so far.`;
    body.innerHTML = `<div class="empty">Keep logging meals with your CGM connected. A food appears here once it has at least 2 tracked responses — then you'll see which ones spike you most.</div>`;
    document.getElementById("insightsSheet").hidden = false;
    return;
  }

  sub.textContent = `Average glucose rise per food, across ${trackedEvents} tracked meals. A meal's spike is shared by all its foods, so patterns sharpen over time.`;

  const row = (r) => {
    const cls = BeamGlucose.spikeClass(r.avgDelta);
    const sign = r.avgDelta >= 0 ? "+" : "";
    return `<div class="result">
      <div class="r-main">
        <div class="r-name">${escapeHtml(r.name)}</div>
        <div class="r-sub">${r.n} meals · ~${r1(r.avgCarbs)}g net · peak Δ ${BeamGlucose.fmtDelta(r.maxDelta, unit)}</div>
      </div>
      <span class="spike ${cls}">▲ ${sign}${BeamGlucose.fmtDelta(r.avgDelta, unit)}</span>
    </div>`;
  };

  // Worst spikers up top; if there's a decent spread, also surface the steadiest.
  const worst = ranked.slice(0, 8);
  let html = `<div class="insight-group">Worst offenders 🔴</div>` + worst.map(row).join("");
  if (ranked.length > 6) {
    const steady = ranked.slice().reverse().slice(0, 5);
    html += `<div class="insight-group">Steadiest — your safe bets 🟢</div>` + steady.map(row).join("");
  }
  body.innerHTML = html;
  document.getElementById("insightsSheet").hidden = false;
}
function closeInsights() { document.getElementById("insightsSheet").hidden = true; }

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
  const blob = new Blob([JSON.stringify({ settings: state.settings, log: loadLog(), favourites: loadFavs(), meals: loadMeals(), glucose: BeamGlucose.loadSeries() }, null, 2)],
    { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `beam-export-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
// Additive merge of a previously-exported backup. Idempotent: re-importing the
// same file changes nothing (entries dedupe by name+time+carbs, glucose by the
// minute, favourites by name, meals by id/name). Existing data is never deleted.
async function importData(file) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { toast("Couldn't read that file"); return; }
  if (!data || typeof data !== "object") { toast("Not a Beam backup"); return; }

  const days = data.log && typeof data.log === "object" ? Object.keys(data.log).length : 0;
  const gpts = Array.isArray(data.glucose) ? data.glucose.length : 0;
  const nFav = Array.isArray(data.favourites) ? data.favourites.length : 0;
  const nMeal = Array.isArray(data.meals) ? data.meals.length : 0;
  if (!confirm(
    `Import & merge this backup?\n\n` +
    `• ${days} day(s) of food log\n• ${nFav} favourites, ${nMeal} saved meals\n• ${gpts} glucose readings\n\n` +
    `Your existing data is kept; duplicates are skipped.`
  )) return;

  const keyOf = (e) => `${e.name}|${e.time}|${e.net_carbs_g}`;
  if (data.log && typeof data.log === "object") {
    const log = loadLog();
    for (const [date, entries] of Object.entries(data.log)) {
      if (!Array.isArray(entries)) continue;
      const cur = log[date] || [];
      const seen = new Set(cur.map(keyOf));
      for (const e of entries) {
        if (e && e.name && !seen.has(keyOf(e))) { cur.push(e); seen.add(keyOf(e)); }
      }
      log[date] = cur;
    }
    saveLog(log);
  }
  if (Array.isArray(data.favourites)) {
    const favs = loadFavs();
    const names = new Set(favs.map((f) => f.name));
    for (const f of data.favourites) if (f && f.name && !names.has(f.name)) { favs.push(f); names.add(f.name); }
    saveFavs(favs);
  }
  if (Array.isArray(data.meals)) {
    const meals = loadMeals();
    const ids = new Set(meals.map((m) => m.id));
    const mnames = new Set(meals.map((m) => m.name));
    for (const m of data.meals) {
      if (m && m.name && Array.isArray(m.items) && !ids.has(m.id) && !mnames.has(m.name)) {
        meals.push(m); ids.add(m.id); mnames.add(m.name);
      }
    }
    saveMeals(meals);
  }
  if (Array.isArray(data.glucose)) {
    const pts = data.glucose
      .filter((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([t, v]) => ({ t: t * 1000, mgdl: v }));
    BeamGlucose.mergePoints(pts);
  }
  if (data.settings && typeof data.settings === "object") {
    state.settings = { ...state.settings, ...data.settings };
    saveSettings();
  }

  openSettings();   // refresh the visible settings fields from merged state
  render();
  refreshGlucose();
  toast("Backup imported");
}

function clearData() {
  if (!confirm("Delete ALL logged food and settings on this device? This can't be undone.")) return;
  localStorage.removeItem("beam.log");
  localStorage.removeItem("beam.settings");
  localStorage.removeItem("beam.favourites");
  localStorage.removeItem("beam.meals");
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
function toastUndo(msg, undoFn) {
  const el = document.getElementById("toast");
  el.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = msg;
  const btn = document.createElement("button");
  btn.className = "toast-undo";
  btn.textContent = "Undo";
  btn.onclick = () => { clearTimeout(toastTimer); el.hidden = true; undoFn(); };
  el.append(span, btn);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 5000);
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
  document.getElementById("qtyFav").onclick = toggleQtyFav;
  document.getElementById("qtyMinus").onclick = () => { stepQty(-0.25); };
  document.getElementById("qtyPlus").onclick = () => { stepQty(0.25); };
  document.getElementById("qtyAdd").onclick = confirmQty;

  document.getElementById("customBtn").onclick = openCustom;
  document.querySelectorAll("[data-cclose]").forEach((el) => (el.onclick = closeCustom));
  document.getElementById("customAdd").onclick = confirmCustom;

  document.getElementById("settingsBtn").onclick = openSettings;
  document.querySelectorAll("[data-sclose]").forEach((el) => (el.onclick = closeSettings));
  document.getElementById("exportBtn").onclick = exportData;
  document.getElementById("importBtn").onclick = () => document.getElementById("importFile").click();
  document.getElementById("importFile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importData(f);
    e.target.value = ""; // allow re-importing the same file
  });
  document.getElementById("clearBtn").onclick = clearData;
  document.getElementById("glucoseRefresh").onclick = () => { refreshGlucose(); syncGlucose(); };
  document.getElementById("insightsBtn").onclick = openInsights;
  document.querySelectorAll("[data-iclose]").forEach((el) => (el.onclick = closeInsights));
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
