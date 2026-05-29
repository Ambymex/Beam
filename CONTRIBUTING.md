# Contributing to Beam

Thanks for being here! Beam is a net-carb-first keto tracker built for people
juggling **keto + coeliac + lactose intolerance + MCAS** — and, increasingly,
for the wider neurodivergent community that overlaps heavily with those. Two
values guide the project:

1. **Kindness over gamification.** Features should inform, not shame. The
   streak has a grace day on purpose; please keep that spirit.
2. **Honesty about limits.** Beam is *not* a medical device and gives *no*
   medical advice. Flags and macros are hints to verify, never guarantees.

## Project layout

```
app.py                 FastAPI: serves the PWA + optional Libre glucose bridge
librelinkup.py         LibreLinkUp client (only used if glucose is configured)
scripts/make_icons.py  Dependency-free PNG icon generator (build/startup)
static/
  index.html           App shell
  styles.css           All styling (dark, mobile-first)
  app.js               UI + state (log, favourites, meals, scanning, settings)
  glucose.js           Pure glucose engine: store, correlation, insights, TIR
  foods.json           Seed food database
  sw.js                Service worker (offline shell)
  manifest.webmanifest PWA manifest
docs/preview.svg       Home-screen preview (illustration)
```

There is **no build step** and **no framework** — just vanilla HTML/CSS/JS. Keep
it that way unless there's a strong reason not to; it's part of why the app is
easy to audit and trust with health data.

## Running locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8080
```

Open <http://localhost:8080>. No environment variables are required; the
glucose panel stays hidden until you configure the Libre bridge (see the
README).

## Testing

The data logic in `glucose.js` is written to be pure and Node-requirable, so it
can be tested without a browser:

```bash
node --check static/app.js          # syntax
node --check static/glucose.js
```

```js
// quick logic check
const G = require("./static/glucose.js");
// G.mealEvents(...), G.responseFor(...), G.foodInsights(...),
// G.timeInRange(...), G.mergePoints(...) are all pure and testable.
```

When changing behaviour, please add a small Node check that exercises the pure
function (clustering, spike calc, merge/dedupe, TIR, etc.). UI changes: verify
by hand at a few viewport sizes and tab through with the keyboard.

## Adding foods to `foods.json`

Each entry is per serving. **Net carbs = total carbs − fiber − sugar alcohols.**
Required keys: `id`, `name`, `serving`, `net_carbs_g`, `gf`, `df`, `histamine`.

```json
{
  "id": "macadamia",
  "name": "Macadamia nuts",
  "serving": "28g (~10)",
  "net_carbs_g": 1.5, "protein_g": 2.2, "fat_g": 21, "calories": 204, "fiber_g": 2.4,
  "gf": true, "df": true, "histamine": "low",
  "note": "Lowest-carb nut, MCAS-friendly.",
  "tags": ["nuts", "snack"]
}
```

- `gf` = gluten-free, `df` = dairy-free (lactose-free).
- `histamine`: `"low" | "moderate" | "high"`. When in doubt, cite a source in
  the PR — histamine lists disagree, so we err toward flagging known liberators.
- `leftover_risk: true` for foods whose histamine climbs as they age.

## Accessibility expectations

New UI should: honour `prefers-reduced-motion`, be keyboard operable with a
visible focus ring, keep modals as focus-trapped dialogs, announce important
changes via the toast (`aria-live`), and keep touch targets ~40px+. Please
don't regress these.

## Submitting changes

1. Branch from the default branch.
2. Keep commits focused with clear messages.
3. Note how you tested.
4. Open a PR describing the change and any health-data or a11y implications.

By contributing you agree your work is licensed under the project's MIT license.
