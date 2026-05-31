# Radial Day Planner

A glanceable, colour-first day planner built around a radial 24-hour
clock-diary. One rotation = one day. See [`radialdayplannerspec.md`] (the design
handoff) for the full rationale; the four load-bearing rules:

1. **Spatial over numeric.** Time is an angle, lane is a radius. No number pads,
   no typed times — ever.
2. **Colour is sacred and primary.** Hue is reserved entirely for the user's
   emotion/vibe palette. **No UI/system element may use a meaningful hue** — the
   now-marker, selection, and drag preview all signal through luminosity, glow
   and line-weight instead.
3. **The taper means honesty.** Soft/tapered = "my own estimate"; hard-edged =
   "the world's deadline." (Grammar arrives with the block editor.)
4. **Forgive, don't nag.** Undone migrates silently; alerts fire on transitions.

## Stack

- **Svelte + Vite** PWA (TypeScript), SVG-rendered canvas.
- Supabase + server-scheduled Web Push and OpenRouter land in later steps —
  a closed iOS PWA can't fire its own alerts, so notifications must be pushed
  from the server (spec §7).

## Run it

```bash
cd planner
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run check      # svelte-check (types)
```

## What's built so far

**Step 1–2 (partial): the living canvas + first gesture.**

- **Geometry** (`src/lib/geometry.ts`) — midnight at the bottom, noon at the
  top, time running clockwise (the day rises up the left, sets down the right).
  Civilian 1–12 twice, never 24h. 24 hour spokes + 96 fifteen-minute ticks.
- **Lanes** (`src/lib/lanes.ts`) — three fixed concentric lanes (Main / Washer /
  Dryer). Input snaps to the nearest lane radially. Optional inner lanes later.
- **The now-wedge** (spec §14) — not a clock hand: a consumed-vs-remaining wedge
  that fills in behind "now" as the day burns down, drawn in luminosity only,
  with a faint glowing now-tick. Updates live.
- **Drag-to-place** (spec §5.2) — press on a lane, sweep the angle to set
  start→end; the block snaps to the nearest lane and commits on release. Colour
  is a neutral placeholder until the hex/vibe DB lands.
- **Hub** — current date; spatial cycle position comes later (§11).
- **PWA shell** — manifest, icon, service-worker registration socket (the real
  push spine is step 7).

## Build order (from the spec)

1. ✅ Radial canvas + geometry (static)
2. 🟡 Lanes + colour/taper rendering + input gesture _(gesture in; colour &
   taper handle pending the palette)_
3. Hub + now-wedge _(now-wedge ✅; cycle entry pending)_
4. Local persistence + day-thumbnail gallery + silent migration of undone
5. Future days + appointments + travel-time wings
6. On-the-fly editing + cascade
7. Supabase schedule + Web Push spine, with the "active colour" signal exposed
8. SQL structured search (`vibe_id` as the tag vocabulary)
9. OpenRouter translator/synthesis, with fallbacks
10. _Later:_ Tuya listener, spatial cycle tracker

## Not in this repo's other half

The top-level `Beam` project (FastAPI glucose bridge) is unrelated and left
untouched; this planner lives entirely under `planner/`.
