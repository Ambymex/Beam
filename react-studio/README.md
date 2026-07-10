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

1. Pick a **theme** in the stage toolbar to preview against any environment;
   **Fire** replays, **Loop** auto-replays, **¼×** is quarter-speed study
   mode, and the **scrub bar** under the stage freezes the whole react so you
   can walk its timeline frame by frame.
2. A react is **1–4 layers**, each a full emitter (the classic recipe: a
   sparse *hero* layer carrying the feeling over a dense, dim *support* layer
   selling the depth — load **Champagne Toast** to study one). Layers can be
   muted for solo study and delayed for phrasing.
3. Tune the **parametric controls** on the left — emission (direction
   including *fountain* arcs, count, trickle, delay, travel **easing curves**
   with teach notes), particle (11 shapes + custom paths, size, **depth
   link**, colour), motion (spin, flutter, **scale from/to**), look (opacity,
   **fade envelope**, glow).
4. Watch the **Coach** under the stage — nine live animation-habit principles
   (vary the speeds, trickle the entrance, never pop, restraint, big things
   move slow, coherent depth, easing tells the physics, hero + support, calm
   hands). Nudges name the layer and explain the why; they're principles, not
   rules.
5. The **perf meter** shows live DOM nodes + fps — everything the studio
   emits animates `transform`/`opacity` only, so watch it hold your display's
   refresh rate even at high counts. That's the house law demonstrating
   itself.
6. Hit **Export code** and **Copy all**. The output has six clearly-labelled
   parts; paste each into its home in `CompanionReacts.svelte`, plus the
   prompt line into the REACTS section of `ChatCompanion.svelte`.
   Multi-layer reacts export as per-layer arrays/classes sharing one set of
   keyframes — still one `fire()` branch, still self-removing.

## Scope

Covers the **particle-shower family** — fall, rise, burst, and fountain —
which is what most reacts are (black hearts, sparks, cherry blossoms,
drifting petals, champagne). One-off set pieces like the tungsten strike
aren't parametric and are hand-built in the app; the studio deliberately
doesn't try to model them.

Notes: drafts saved before the layers update load fine (they migrate to
one-layer configs on load, keeping their old burst easing/grow-in). The
studio renders the *base* react; the app occasionally adds theme-specific
touches by hand. Exported ids should be unique — rename before export to
avoid colliding with a shipped react.
