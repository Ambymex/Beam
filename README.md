# Beam

A net-carb-first keto food tracker, built for awkward bodies. It's a
phone-installable PWA that puts your **net carb budget** front and centre and
flags every food for **gluten 🌾, dairy 🥛 and histamine 🧬** — the things
generic trackers like MyFitnessPal bury or ignore entirely.

Designed around three overlapping needs:

- **Keto** — a daily net-carb budget (default 20g) as the hero number, with
  fiber and sugar alcohols already subtracted. Calories are a footnote, not the
  headline.
- **Coeliac** — gluten flagged on every food; sneaky sources (e.g. sausage
  rusk) called out in notes.
- **Lactose intolerance** — dairy clearly marked, with dairy-free subs in the
  database (ghee, coconut cream, etc.).
- **MCAS** — a per-day **histamine load** indicator plus high/moderate
  histamine flags and "eat fresh" warnings for leftover-risk foods. Almost no
  mainstream tracker does this.

- **Glucose × food correlation** *(optional, needs the Libre bridge)* — the
  thing MyFitnessPal structurally can't do. Beam clusters your log into eating
  events and scores each against your real CGM data: **baseline → peak → spike
  (Δ) and time-to-peak**, drawn on a day chart with meal markers. Over time you
  learn which "keto-safe" foods actually spike *you*. A **"biggest spikers"**
  leaderboard ranks every food by its average glucose rise across all your
  tracked meals (and surfaces your steadiest "safe bets").

Your food log lives entirely in your browser's local storage — no account, no
cloud database, nothing to leak. The only network feature is the **optional**
glucose bridge below.

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Beam PWA (this app)         │        │  Optional: Libre 2 glucose   │
│  • net carb budget ring      │        │  Libre 2 → LibreLinkUp cloud │
│  • gluten/dairy/histamine    │        │            ↓                 │
│  • food log (on-device)      │◀───────│  Beam /glucose/* endpoints   │
└─────────────────────────────┘  token  └──────────────────────────────┘
```

## Use it

The app is fully static — open the served URL on your phone and **Add to Home
Screen**. It then works offline, launches full-screen, and remembers your log.

- **Add food**: tap `+ Add food`, search the database (or add a custom food),
  pick the meal and servings, done.
- **Budget ring**: green → amber at 80% → red when you blow past your budget.
- **Settings (⚙)**: change the daily budget, glucose units, paste a glucose
  token, or export/clear your data.

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8080
```

Open <http://localhost:8080>. No environment variables are required — the
glucose panel simply stays hidden until you configure it.

Regenerate the app icons (zero dependencies) with:

```bash
python scripts/make_icons.py
```

## Deploy to Fly.io

```bash
fly launch --no-deploy   # pick a name; skip Postgres/Redis
fly deploy
```

The app sleeps when idle and wakes on first request, so it costs ~nothing.

## Optional: live glucose from a FreeStyle Libre 2

Beam started as a Libre→cloud bridge and that capability is still here. If you
wear a Libre 2, you can surface your live reading inside the tracker.

1. Set up a **LibreLinkUp follower** account (install LibreLinkUp on any
   device, sign up with a *different* email from your LibreLink, then in
   LibreLink go to **Connected Apps → LibreLinkUp → Add Connection** and invite
   that follower email; accept the invite).
2. Configure Beam with the follower credentials and a self-chosen API token:

   ```bash
   fly secrets set \
     LLU_EMAIL='follower@example.com' \
     LLU_PASSWORD='follower-password' \
     API_TOKEN="$(openssl rand -hex 32)"
   ```

   (Locally, `export` the same three variables before running uvicorn.)
3. In the app's **Settings → API token**, paste the `API_TOKEN` value. The
   glucose panel appears with your current reading, trend and age, plus the
   **Glucose response** card.

Because Abbott's history endpoint only serves ~12h, Beam appends every reading
it sees into on-device storage each time you open the app, building its own
multi-week series. So glucose correlation gets richer the more you use it —
open Beam at least once during the day to capture that day's curve. Stored
readings are pruned after ~35 days.

The token is stored only on your device and sent as a Bearer header to Beam's
`/glucose/current` endpoint. Rotate it anytime with `fly secrets set` to revoke
a leaked token. If logins start failing, Abbott has likely bumped the minimum
client version — update the `version` string in `librelinkup.py`.

## Notes & honesty

- This is a personal-use tool, **not medical advice or a medical device**.
  Histamine tolerance is highly individual — the flags are a starting map, not
  gospel. Trust your own reactions over any label here.
- Macros in `static/foods.json` are typical reference values; brands vary, so
  check labels for anything packaged.
- The legacy Gemini Gem Action (`gem-action.yaml`) is kept for reference but is
  no longer the primary interface.
