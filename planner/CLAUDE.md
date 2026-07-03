# Radial Day Planner — guide for aesthetic tweaks

A Svelte 4 + Vite PWA: a 24-hour radial planner with an environmental theme
engine, glassmorphism, an AI companion, CGM (glucose) integration, and MCAS
symptom tracking. This file is aimed at small, focused styling jobs (colours,
spacing, animations). Read the landmines section before touching anything.

**You are in the right folder if this file is next to `src/App.svelte`.**
(There is a STALE copy of this app at `radial-planner/planner` two levels up —
never edit that one.)

## Where colours live

| What | File | Notes |
|---|---|---|
| Theme palettes (12 env themes) | `src/lib/themes.json` | CSS custom properties per theme; `common` block = shared glass tokens |
| Ring structural colours | `src/lib/theme.ts` → `VAR_PALETTE` | maps SVG parts to CSS vars |
| Ambient background gradient | derived in `src/lib/envTheme.ts` from `--gradient-start/--gradient-end` | don't hand-write `--ambient-gradient` in themes.json |
| Background animations (stars, meteors, aurora curtains, rain ripples) | `src/app.css` (`*-canopy` classes) | toggled by `envTheme.ts` state flags |
| Glass utility classes | `src/app.css` (`.glass-panel`, `.glass-card`) | components also use the tokens directly |
| Header chips | `src/App.svelte` `.chip` | glass tokens + `backdrop-filter` |
| Unassigned-block + symptom colour | `src/lib/blocks.ts` `NEUTRAL`, `src/lib/symptoms.ts` `SYMPTOM_FILL` | derive from `--glass-bg` via relative colour syntax (see below) |

### Token cheat-sheet (per theme in themes.json)
- `--gradient-start` / `--gradient-end` — the page-wide ambient gradient (all full-screen panels share it).
- `--app-bg` — solid fallback + browser `theme-color`. **Dark themes must keep it starting with `#0`** — `theme.ts` detects dark mode via `startsWith('#0')`.
- `--surface`, `--surface-2`, `--surface-3` — translucent white elevation tiers (`rgba(255,255,255,α)`). **Keep the rgba format**: the Theme Designer parses the alpha back out of these strings.
- `--glass-bg/-border/-blur/-shadow` — the glass look. Bright themes (sunrise/day/sunset) override with stronger alphas; dark themes inherit `common`.
- `--signal` / `--signal-glow` / `--signal-contrast` — the one emphasis colour (selection rings, now-tick, out-of-range glucose).
- `--text`, `--text-2`, `--text-dim`, `--text-faint` — text hierarchy.

### The relative-colour trick
Symptoms and unassigned blocks borrow the glass HUE at their own alpha:
`rgb(from var(--glass-bg, #8a8a96) r g b / 1)`. Omitting the `/ alpha` keeps
the origin's (very low) alpha — always specify it explicitly.

## Landmines — read before editing

1. **`src/lib/vibes.ts` is sacred. Never change its hex values or ids.** They
   are the user's synesthetic emotion↔colour vocabulary (she has emotion-colour
   synesthesia; the hexes MEAN things), and the ids are stored in her task
   data. The design rule everywhere else: hue carries meaning ONLY for vibes —
   structural UI signals use luminosity/glass, plus `--signal` for emphasis.
2. **`src/lib/theme.ts` module-evaluation order.** The store subscriptions near
   the top call `applyTheme()` synchronously during import. Any `const` they
   reference (e.g. `CUSTOM_KEYS`) must be declared ABOVE them, or the whole app
   black-screens with a TDZ ReferenceError and no visible error.
3. **Two transition speeds in `app.css` are intentional.** Ambient surfaces
   crossfade over 2.5s (environmental theme changes); `button, input, select`
   respond in 0.2s. Don't merge them — slow buttons feel broken.
4. **Adding a new theme-designer-editable CSS var?** Add it to `CUSTOM_KEYS` in
   `theme.ts` (cleanup list) AND make `ThemeDesigner.svelte` parse it back in
   both `loadFromComputedStyle()` and `applyConfig()` — values that don't
   round-trip get silently clobbered by the next slider move.
5. **Block geometry has invariants** (`normalizedSpan`/`repairBlock` in
   `src/lib/blocks.ts`). Rendering and hit-testing must use the same normalized
   numbers. Don't bypass them with raw `startHours/coreEndHours`.
6. **Don't rename any `radial-planner-*` localStorage keys** or Dexie tables
   (`src/lib/db.ts` — additive versioned migrations only).
7. **`RadialCanvas.svelte` syncs local state to the store by JSON comparison**
   — don't transform blocks while loading them there (loops forever). Data
   repairs belong in `migrateUndone()` (`src/lib/daydata.ts`).
8. **Touch handling on SVG is fragile on iOS.** The dial/ring listeners use
   patterns that took real debugging: position-before-capture, try/catch around
   `setPointerCapture`, `getBoundingClientRect` (never `getScreenCTM`) for
   angles, non-passive touch `preventDefault`, and a solo-finger guard on the
   double-tap detector. Don't "simplify" these.
9. **The companion prompt is token-dieted on purpose** (`ChatCompanion.svelte`):
   scratchpad is fetched on demand via `read_scratchpad`, diary history lines
   capped at 300 chars, heartbeat uses its own lean prompt and is enforced
   notify-only. Don't re-add bulk to the every-turn prompt.

## Testing checklist for any visual change

1. `npx vite build` — must pass (it's fast).
2. Run `npx vite --port 5200` and check in a browser.
3. Use the theme dropdown (header, right end) to check at least **Day** (light)
   and **Twilight** (dark) — bright themes break differently than dark ones.
4. Browser console must stay clean.
5. Anything touching the ring: create a block, tap-select it, drag its taper
   handle — gestures are coordinate-mapped and easy to break silently.
6. The user tests on iPhone via ngrok — flag anything that might behave
   differently on touch/WebKit (see landmine 8).

## Known nits (safe small first tasks)

- Remove the TEMP debug line: `dialDebug` in `src/lib/cycle.ts`, its trace
  calls in `CycleDial.svelte`, and the `.hint.debug` line in
  `CycleEditor.svelte` (added while hunting an iOS drag bug — now fixed).
- Somewhere a label still reads "cycle day one"-ish after the cycle position
  changes (user report, low priority): the dial itself updates fine; check
  what renders cycle text OUTSIDE `CycleDial.svelte` before assuming a store bug.

## Conventions

- Comments explain constraints/whys, not whats; match the existing voice.
- Spec references like (§2, §8) refer to the user's original design spec —
  keep them when moving code.
- One change at a time; the user commits between tweaks.
