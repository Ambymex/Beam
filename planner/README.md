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

**Steps 1–2: the living canvas, the vibe palette, and the taper grammar.**

- **Geometry** (`src/lib/geometry.ts`) — midnight at the bottom, noon at the
  top, time running clockwise (the day rises up the left, sets down the right).
  Civilian 1–12 twice, never 24h. 24 hour spokes + 96 fifteen-minute ticks.
- **Lanes** (`src/lib/lanes.ts`) — three fixed concentric lanes (Main / Washer /
  Dryer). Input snaps to the nearest lane radially. Optional inner lanes later.
- **The now-wedge** (spec §14) — not a clock hand: a consumed-vs-remaining wedge
  that fills in behind "now" as the day burns down, drawn in luminosity only,
  with a faint glowing now-tick. Updates live.
- **Drag-to-place** (spec §5.2) — press on a lane, sweep the angle to set
  start→end; the block snaps to the nearest lane and commits on release.
- **The vibe palette** (`src/lib/vibes.ts`, `Palette.svelte`) — 77 emotion↔hex
  pairs parsed from the hand-written cipher. Tap a swatch to arm it (selection
  signalled by a white ring + glow, never colour); the drawn arc paints in that
  hue. `vibe_id` doubles as the search tag vocabulary (§6/§12).
- **The taper grammar** (spec §4) — a block is solid through its confident core,
  then fades to nothing across the predicted overage (stepped-opacity segments —
  the Prismacolor pencil-lift). New blocks are born soft; drag the luminous tail
  handle to lengthen/shorten the fade, or pull it back to a **hard edge** (crisp,
  with a deadline notch) = "the world's deadline, not mine to estimate."
- **Hub + spatial cycle subdial** (spec §11) — the hub shows the date plus a
  Patek-Nautilus-style cycle subdial: stepped two-tone bezel, horizontal
  grooves, day ticks, a consumed-arc and a luminous marker you DRAG to set
  where you are. Position-not-number — the marker IS the reading; "day N" is a
  faint secondary, never "CD 14" as the primary. The ◍ Cycle editor sets length
  (varies) and "today is day 1". Manual for now (§11); auto-count is a later
  toggle, but the display stays positional. All luminosity — no pink/red, since
  hue belongs to vibes (§2). Position↔angle math is unit-tested.
- **Persistence + the gallery + silent migration** (spec §12 tier 1, §13) —
  every day is saved to localStorage, keyed by date. The ▦ Days gallery is the
  "time machine": re-rendered thumbnails you flick through by shape and colour,
  tap to time-travel into a past day (read-only now-wedge hidden). Undone blocks
  from past days migrate silently onto today on launch — done blocks stay as the
  record; no guilt. Migration + persistence are covered by an end-to-end test.
- **Text headers + the capture list** (spec §6) — select a block to open its
  editor: give it a text label (rendered as a header hung off the arc, shown
  only when selected — colour identifies the rest), tick it done, or delete it.
  The ✎ List overlay is the untimed capture zone ("to get: cat, milk, emergency
  bag") — the paper margin list, a non-temporal ADHD capture surface, persisted
  on its own. (Tap-tap a block still toggles done as a shortcut.)
- **Edit + cascade** (spec §9) — select a block, then drag its body to reschedule
  or drag a core edge to resize (the taper tail handle from §4 still sets the
  fade). The bar's **→ Nudge / ⇉ Push my day** toggle chooses behaviour: nudge
  moves only the grabbed block; cascade shoves downstream SAME-LANE soft blocks
  forward by the same slip and **halts at the next hard edge** (the world's
  deadline), flagging it with a luminous pulse rather than trampling it. Pure,
  unit-tested math in `cascade.ts`.
- **Future days + appointments + travel-time wings** (spec §8) — the gallery's
  "Ahead" section pre-seeds empty future rings you can land on and plan before
  their morning. The bar's **◷ Block / 📍 Appointment** toggle switches draw
  mode: appointments are **hard-edged, no taper** (externally fixed, not yours to
  estimate) and **never migrate**. Each carries asymmetric travel-time wings in
  the travel hue — a prepend fading BACKWARD toward "whenever I leave" (the
  departure/"leave now" edge — the load-bearing §7 ping anchor) and an append
  fading OUTWARD toward "whenever I get home." Drag the wing handles to size
  them. Wing geometry + the migration carve-out are unit-tested.
- **Push receive half** (spec §7, client side) — the service worker renders
  transition notifications (`notify.ts` shapes them: block-start / appliance-
  free / travel-start — never a nag for undone work). `push.ts` handles
  permission + subscribe (degrades until the VAPID key lands). The `🔔 Alerts`
  panel covers permission, a working **send-a-test** (fires through the SW), and
  the iOS Add-to-Home-Screen guidance. Shaping logic is unit-tested; the
  server-scheduled send is the next round — see `PUSH_SETUP.md`.
- **Zoom & pan** — the ring is dense on a phone, so pinch-to-zoom + two-finger
  pan (one finger stays reserved for drawing), plus +/− and reset buttons and
  desktop wheel-zoom. Implemented purely as a viewBox window, so every gesture
  (draw, drag, taper, wings, cascade, the cycle dial) keeps mapping correctly
  through `getScreenCTM()` with no change to hit-testing. Non-colour controls.
- **Create your own vibes** (spec §4/§6) — a ✛ new form: pick a hue (native
  system colour picker) and name what it feels like. It arms immediately,
  persists (`customVibes.ts`), shows under a "yours" row (re-pick or delete),
  and `resolveVibe()` renders `custom:*` blocks like any vibe. This doesn't
  break "no invented hues" (§2): the rule is the APP mustn't fabricate meaning —
  the user choosing and naming a colour is how the whole DB was built.
- **Two-level vibe palette** (spec §6) — the 77 vibes turned out to cluster, so
  they're grouped into 15 categories (`categories.ts`): tap a category to arm it
  as-is ("just use housework"), tap its chevron to expand the precise members,
  or flip to the flat "all 77" view. A category is itself an armable vibe with
  id `cat:*` (kept searchable per §6/§12), and its swatch is one of its OWN
  member hexes — never an invented hue (§2). `resolveVibe()` renders both member
  and category ids. Verified: 77 categorised exactly once, no invented hues, and
  `cat:*` blocks round-trip through persistence.
- **Light / dark themes** — a manual ☀/☾ toggle (persisted). Warm paper-white
  (a nod to the Prismacolor paper) or the original dark. The key isn't a
  recolour but an **inversion of the signal logic** (§2): the bright glow that
  means now/selection/cascade on black would vanish on paper, so on light it
  becomes a dark, heavier mark — same meaning, flipped value. The 77 vibe hexes
  are never themed; they're the user's data. Driven by one source of truth
  (`theme.ts`): a `palette` store for the SVG + CSS variables for the chrome.
- **PWA shell** — manifest, icon, service-worker registration + push receiver.

## Build order (from the spec)

1. ✅ Radial canvas + geometry (static)
2. ✅ Lanes + colour/taper rendering + input gesture
3. ✅ Hub + now-wedge + spatial cycle subdial
4. ✅ Local persistence + day-thumbnail gallery + silent migration of undone
5. ✅ Future days + appointments + travel-time wings
6. ✅ On-the-fly editing + cascade
7. 🟡 Web Push spine — receive half ✅ (SW + client + Alerts UI, unit-tested);
   server schedule/cron/VAPID-send next (needs Supabase) — see PUSH_SETUP.md
8. SQL structured search (`vibe_id` as the tag vocabulary)
9. OpenRouter translator/synthesis, with fallbacks
10. _Later:_ Tuya listener (spatial cycle tracker ✅ — done early, §11)

## Not in this repo's other half

The top-level `Beam` project (FastAPI glucose bridge) is unrelated and left
untouched; this planner lives entirely under `planner/`.
