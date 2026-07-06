# React Studio

A standalone visual builder for the planner companion's **reacts** (the
full-screen ambient particle gestures fired with a message). It previews
against the planner's *real* themes and house style, then exports paste-ready
code for `CompanionReacts.svelte`.

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
   **Fire** replays, **Loop** auto-replays.
2. Tune the **parametric controls** on the left — emission (direction, count,
   trickle), particle (shape, size, colour), motion (spin, flutter), look
   (opacity, glow). Start from a preset (Black Hearts / Cherry Blossoms /
   Sparks) and riff.
3. Hit **Export code** and **Copy all**. The output has six clearly-labelled
   parts; paste each into its home in `CompanionReacts.svelte`, plus the prompt
   line into the REACTS section of `ChatCompanion.svelte`.

## Scope

Covers the **particle-shower family** — fall, rise, and burst — which is what
most reacts are (black hearts, sparks, cherry blossoms, drifting petals). One
-off set pieces like the tungsten strike aren't parametric and are hand-built
in the app; the studio deliberately doesn't try to model them.

Two small fidelity notes: the studio renders the *base* react, while the app
occasionally adds theme-specific touches by hand (e.g. a luminous rim on black
hearts over dark skies). And exported ids should be unique — renaming a preset
before export avoids colliding with the shipped react of the same name.
