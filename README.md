# Beam

A tiny HTTPS bridge that lets your Gemini companion read your FreeStyle Libre 2
blood glucose data directly, as a Gem Action.

```
Libre 2 sensor  --BLE-->  iPhone LibreLink  --upload-->  LibreView cloud
                                                              |
                                                              | (LibreLinkUp follower API)
                                                              v
                                              Beam (FastAPI on Fly.io)
                                                              |
                                                              | (HTTPS, OpenAPI Action)
                                                              v
                                                       Gemini Gem
```

## 1. Set up a LibreLinkUp follower

Abbott's official LibreLinkUp app is the "caregiver" companion to LibreLink.
We piggyback on it: you invite a second account to follow your readings, and
Beam logs in as that follower.

1. On any device (a second phone, an old tablet, even a friend's phone you
   borrow once), install **LibreLinkUp** from the App Store / Play Store.
2. Sign up for a new account using a **different email** from your main
   LibreLink account. Pick a strong password.
3. On your **main** phone, open LibreLink → **Connected Apps** →
   **LibreLinkUp** → **Add Connection** and enter the follower account's
   email. The follower will get an email invite — accept it.
4. Open LibreLinkUp on the follower device and confirm you can see your
   glucose readings flowing in. (You can uninstall the app afterwards; we
   only need the credentials.)

You now have:
- `LLU_EMAIL` — the follower account's email
- `LLU_PASSWORD` — the follower account's password

## 2. Run locally (optional sanity check)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill it in
set -a; source .env; set +a
uvicorn app:app --reload --port 8080
```

```bash
curl -H "Authorization: Bearer $API_TOKEN" http://localhost:8080/glucose/current
```

You should see something like:

```json
{
  "mg_per_dl": 112,
  "mmol_per_l": 6.2,
  "trend": "stable",
  "timestamp_utc": "2026-05-15T14:23:00+00:00",
  "minutes_old": 1,
  "is_high": false,
  "is_low": false
}
```

## 3. Deploy to Fly.io

```bash
brew install flyctl     # if you haven't
fly auth login
fly launch --no-deploy  # accept name beam-glucose or pick your own; skip Postgres/Redis
fly secrets set \
  LLU_EMAIL='your-followup-account@example.com' \
  LLU_PASSWORD='your-followup-password' \
  API_TOKEN="$(openssl rand -hex 32)"
fly deploy
fly secrets list   # confirm; copy API_TOKEN value once for the Gem step
```

Note the URL Fly prints (e.g. `https://beam-glucose.fly.dev`).

The app sleeps when idle and wakes on the first request (~1s cold start),
so it costs essentially nothing to run.

## 4. Wire it up as a Gem Action

In the Gemini app or web (Google AI Pro / Ultra required for custom Gems):

1. **Gems** → **New Gem** → name it whatever (e.g. "Health buddy").
2. Add the system instructions you'd like — something like *"You can read my
   live glucose with the Beam Action. Use mg/dL by default."*
3. Under **Actions** (or **Tools**, depending on UI version), choose **Add
   custom action** → **Import OpenAPI**.
4. Paste the contents of [`gem-action.yaml`](./gem-action.yaml), with the
   `servers.url` line replaced by your real Fly URL.
5. For **Authentication**, choose **API key** → **Bearer** and paste the
   `API_TOKEN` value from step 3.
6. Save. Test by asking him "what's my glucose right now?" — he should call
   `getCurrentGlucose` and reply with the reading.

> If your Gemini tier doesn't expose custom Gem Actions, the same server
> works as a plain URL: ask him to fetch
> `https://beam-glucose.fly.dev/glucose/current` with header
> `Authorization: Bearer <token>`. Slightly clunkier, same data.

## Operational notes

- **Token rotation**: rotate `API_TOKEN` with `fly secrets set` and update
  the Gem's auth — that's enough to revoke any leaked URL.
- **Version drift**: Abbott periodically tightens the minimum LibreLinkUp
  client version they accept. If logins suddenly start failing, bump the
  `version` string in `librelinkup.py` to whatever the current LibreLinkUp
  iOS app reports.
- **Multiple sensors / accounts**: if your follower account follows more
  than one person, set `LLU_PATIENT_ID` to disambiguate. You can find IDs
  by hitting `/glucose/current` once and inspecting Fly logs, or by
  unsetting it and listing the connections in a quick REPL.
- **Privacy**: this is a personal-use bridge, not a medical device. Don't
  share the URL or token; treat both as credentials.
