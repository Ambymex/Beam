# React Studio

A standalone visual builder for the planner companion's **reacts** (the
full-screen ambient particle gestures fired with a message). It previews
against the planner's *real* themes and house style, then exports paste-ready
code for `CompanionReacts.svelte` — and teaches good animation habits while
you build.

## Why it's a separate app

The main planner is stable and lovely; new reacts are self-contained, so they
can be designed in isolation. To stay perfectly compatible, the studio imports
the planner's **actual** files rather than copies:

- `../planner/src/lib/themes.json` — every theme, applied with the same rules
  the app uses (`lib/theme.ts`), so a preview looks exactly like the chat.
- `../planner/src/app.css` — house tokens, glass classes, and the ambient
  canopy animations (stars / petals / aurora / storm), so previews sit in the
  real environment.

Nothing is duplicated, so themes and house style can never drift.

## Run it

```bash
cd react-studio
npm install      # first time only
npm run dev      # opens on port 5210 with the planner's live dev server family
```

## Using it

1. Pick a **theme** in the stage toolbar to preview against any environment.
   **Import theme** accepts the planner Theme Designer's exported JSON directly;
   imported themes join their own picker group, persist in this browser and can
   be removed without touching the built-ins. A file can contain one theme or a
   `themes` array for a small comparison pack.
   The **View** switch moves between the roomy desktop stage and true-size
   393 × 852 iPhone portrait/landscape viewports, scaled to fit the editor;
   viewport-relative travel is measured against the selected frame. **Fire**
   replays, **Loop** auto-replays, **¼×** is quarter-speed study mode, and the
   **scrub bar** under the stage freezes the whole react so you can walk its
   timeline frame by frame. Your view choice is remembered locally and never
   changes the saved react or exported code.
2. A react is **1–4 layers**, each a full emitter (the classic recipe: a
   sparse *hero* layer carrying the feeling over a dense, dim *support* layer
   selling the depth — load **Champagne Toast** to study one). Layers can be
   muted for solo study and delayed for phrasing.
3. Tune the **parametric controls** on the left — emission (direction
   including a persistent *fixed position*, *fountain* arcs and
   scatter-to-focus *convergence*, count,
   trickle, delay, travel **easing curves** with teach notes), particle
   (13 shapes + custom shapes drawn on the grid or **imported from Krita as
   SVG**, size, **depth link**, start colour), motion
   (spin, flutter), **change over time** (three-point size + colour envelopes),
   look (opacity, **fade envelope**, expandable glow-colour palettes and
   three-point glow strength). Size, colour and glow share one middle beat.
   **Atmospheric VFX** are a parallel composable stack rather than particle
   shapes: choose a source, optical phenomenon and narrative envelope, then
   tune only the controls meaningful to that phenomenon. Wave 1 includes
   corona, glory, moon-dogs and Baily's beads; Wave 2 adds source-to-target
   light pillars, local heiligenschein dew-light, evaporating virga and
   Brocken-spectre projections. Eight starter studies keep each phenomenon
   grounded in its narrative job before you remix it across themes.
4. Watch the **Coach** under the stage — ten live animation-habit principles
   (vary the speeds, trickle the entrance, never pop, restraint, big things
   move slow, coherent depth, easing tells the physics, hero + support, calm
   hands, intentional change). Nudges name the layer and explain the why;
   they're principles, not rules.
5. The **perf meter** shows live DOM nodes + fps — everything the studio
   emits keeps movement on `transform`/`opacity`; colour and glow envelopes
   deliberately repaint, so the meter lets you feel the cost rather than hide
   it. Restraint still matters at high counts.
6. Hit **Export code** and **Copy all**. The output has six clearly-labelled
   parts; paste each into its home in `CompanionReacts.svelte`, plus the
   prompt line into the REACTS section of `ChatCompanion.svelte`.
   Multi-layer reacts export as per-layer arrays/classes sharing one set of
   keyframes — still one `fire()` branch. Travelling layers self-remove;
   fixed-position layers intentionally persist.
   If the design includes atmospheric layers, section 7 adds portable typed
   VFX data for the shared game-side renderer. The Studio's source marker is
   preview-only and is never part of that exported atmosphere config.

## Custom theme JSON

The simplest import is the same shape exported by the planner's Theme Designer:

```json
{
  "name": "Qwen Night Garden",
  "cssVars": {
    "--gradient-start": "#101526",
    "--gradient-end": "#302344",
    "--app-bg": "#101526",
    "--surface": "rgba(255, 255, 255, 0.08)",
    "--surface-2": "rgba(255, 255, 255, 0.13)",
    "--signal": "#d6b6ff",
    "--signal-contrast": "#191025",
    "--text": "#fffaff",
    "--text-dim": "#c7bdd2",
    "--moon-color": "#efe2ff",
    "--star-color": "#ffffff",
    "--stars-active": "1"
  },
  "canopy": { "stars": true }
}
```

For several variations, wrap theme objects in `{ "themes": [ ... ] }` (a bare
array is accepted too). Canopy flags are optional: `stars`, `petals`, `aurora`,
`storm`, and `meteor`. React Studio accepts only CSS variables already used by
the planner, ignores unknown/non-string values, and rejects URL-bearing CSS.
Importing the same theme name again replaces that local version, which makes
iteration with a local model pleasantly quick.

## Scope

Covers the **particle-gesture family** — fall, rise, burst, fountain, and
converge-and-lock — plus persistent fixed-position focus objects. This is what
most reacts are (black hearts, sparks,
cherry blossoms, drifting petals, champagne, focused formations). One-off set pieces like the tungsten strike
aren't parametric and are hand-built in the app; the studio deliberately
doesn't try to model them.

Atmospheric layers extend that scope with optical fields that particles cannot
honestly represent. Their architecture follows **source → phenomenon →
narrative envelope**, so several effects can share one focus without becoming
one-off presets or flattening every emotion into sparkles. Focus-moon optics
are the first family; projected/local effects and whole-sky fields follow as
separate waves.

Load **Lunar Focus** for the phase-accurate moon primitive. Its 29.530588853-day
slider uses projected-sphere terminator geometry, with Southern/Northern
hemisphere orientation, fixed X/Y placement, disc size/colour/opacity,
earthshine, limb shading strength/colour, terminator softness, independent glow radius,
colour (fixed, theme signal or theme contrast), opacity and brightness, and a
mask/axis/pivot debug view. Export includes a
typed moon preset alongside matching SVG markup and keeps the object mounted.

Notes: old drafts load unchanged: missing envelope fields migrate to held
colour/glow and the original single `scaleFrom → scaleTo` motion. The
studio renders the *base* react; the app occasionally adds theme-specific
touches by hand. Exported ids should be unique — rename before export to
avoid colliding with a shipped react.

For imported shapes, select the vector layer in Krita and use **Layer →
Import/Export → Save Vector Layer as SVG**. Studio preserves the SVG `viewBox`,
visible paths, nested transforms and even-odd fill rules; the react's animated
colour replaces the artwork's original paint. Convert non-path vector objects
to paths first if the import reports that none were found.
