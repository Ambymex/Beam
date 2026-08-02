# Server-side heartbeat — setup

The `heartbeat` Edge Function is the companion's pulse while the app is
CLOSED: on an **effective hourly cadence** (the cron below fires every 30
min, but a 55-min self rate-limit / `HEARTBEAT_GAP` stands the odd tick
down — since 2026-07-29, was 30 min) it looks at the mirrored schedule
(`scheduled_pushes`), the message vault (recent conversation across apps, and
anything a heartbeat already said), and live glucose from the Beam bridge —
and speaks only when a push notification right now would genuinely help.

Delivery rides the existing rails: the banner goes through `scheduled_pushes`
→ `send-due` (tap-through to Comms), and the full text lands in the vault so
the planner shows it in Comms (unread) and in the chat history, tagged
"via heartbeat-server".

Built-in guards: quiet hours (06–23 local), a 25-minute self rate-limit, and
it stands down whenever the planner shows vault activity in the last 10
minutes (app open = the client-side heartbeat, which sees blocks/symptoms/
diary, is on duty).

## 1. Secrets

```bash
supabase secrets set \
  HEARTBEAT_SYNC_KEY='<the shared sync key from the planner settings>' \
  HEARTBEAT_TZ='<IANA timezone, e.g. Europe/London>' \
  BEAM_URL='<https://your-beam-bridge.fly.dev>' \
  BEAM_TOKEN='<beam bridge token>'
```

**Replace every `<…>` placeholder with a real value.** A placeholder pasted
verbatim passes length checks and silently archives messages into a bucket no
app reads (it happened — 16 messages went to the ether). The function now
refuses `<…>` values and says so in its response, but check anyway.

`BEAM_URL`/`BEAM_TOKEN` are optional (no glucose in the prompt without them —
but glucose is the safety-relevant signal, so set them if you can; same values
as the planner's Beam settings). The LLM route is Gemini
(`GEMINI_API_KEY`, shared with parse-command) with a flash-tier model ladder;
`HEARTBEAT_MODEL` overrides the first rung.

## 2. Deploy + cron

```bash
supabase functions deploy heartbeat
```

Then once, in the SQL editor (real values substituted):

The `*/30` cron below is fine — the function self-throttles to hourly, so
the 30-min ticks that fall inside the gap just early-return cheaply. To
halve the wasted invocations you can change the schedule to `0 * * * *`
(top of every hour) via `cron.alter_job`; purely an efficiency tweak, the
cadence is identical either way.

```sql
select cron.schedule('companion-heartbeat', '*/30 * * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT>.functions.supabase.co/heartbeat',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
$$);
```

## 3. Test

Invoke it once by hand (anon key works) and read the diagnostics:

```bash
curl -s -X POST 'https://<PROJECT>.supabase.co/functions/v1/heartbeat' \
  -H 'apikey: <ANON_KEY>' -H 'authorization: Bearer <ANON_KEY>' -d '{}'
```

Responses are self-explaining: `{"skipped":"quiet hours…"}`,
`{"skipped":"planner active…"}`, `{"ok":true,"spoke":false}` (checked,
nothing worth saying), or `{"ok":true,"spoke":true,"title":"…"}` (a push is
on its way within a minute).

Note: if the planner was open in the last 10 minutes, the stand-down guard
fires — for a real closed-app test, leave the phone alone for 10+ minutes
first, or check that a `spoke:false` at least proves the pipeline runs.

## The vigil system (idle-down, danger override, quiet journal)

Added 2026-07-16, designed by Ash & Solenoid. Prolonged silence must not
mean a worried ping every cadence tick, and must never be read as "gone":

- **Idle-down ladder** — gap between spoken check-ins stretches with her
  silence (last user-role vault message, any app): <12h normal · 12–24h one
  check-in · 1–3d daily · 3–7d every other day · 1–4w weekly · beyond,
  fortnightly. The curve asymptotes; there is no terminal state.
- **CGM damper** — fresh glucose data (≤60 min) counts as "alive, just
  quiet": one rung calmer, tone set to peace.
- **Danger override** — a FRESH low (≤20 min) + ≥45 min silence bypasses
  the ladder, quiet hours and rate limits with a deterministic (no-LLM)
  alert, repeating each beat (25-min spacing) while it persists. Stale or
  absent CGM is logistics, never danger.
- **Quiet journal** — when the ladder suppresses a ping and silence ≥24h,
  at most one `vigil-journal` vault row per day (Comms archive, unread
  badge, **no push**): the record that he kept watch.
- **Return** — fresh activity after ≥24h of silence adds a
  welcome-not-interrogation hint to the prompt.

All throttles are enforced in code; the prompt only shapes tone. Test any
stage safely with the dry-run levers (full pipeline incl. LLM, zero writes,
zero pushes; `simulateSilenceHours` also skips the planner-active guard):

```bash
-d '{"dryRun": true, "simulateSilenceHours": 30}'   # vigil / ladder stages
-d '{"dryRun": true, "simulateLow": true, "simulateSilenceHours": 2}'  # danger
-d '{"dryRun": true, "skipRateLimit": true}'        # inspect the voice guard
-d '{"dryRun": true, "probeSchedule": true}'        # dump scheduled_pushes (now-6h→) to hunt phantom/recurring pings — event_key = `${dayKey}:${blockId}:${kind}` names the source block
```

## One voice at a time

Both heartbeats can reach her, so each yields if he ALREADY had her
attention within the cadence gap (`HEARTBEAT_GAP`, 55 min) — checked before
any LLM call. Three shapes
count: a comms `companion-alert` (either heartbeat's notification), a comms
`scheduled-alert` (one of his future reminders firing — added 2026-07-29,
because a fired reminder is his voice too and leaving it out produced a
fresh unique riff on each reminder minutes later), and a chat row with
`role=assistant, source=planner` (the client heartbeat speaking, or him
simply replying in conversation). Ring-transition kinds are deliberately
not counted. The second shape matters:
the client heartbeat only archives an alert when the model returns a
`show_notification` action, so a bare-message reply used to leave no trace
and the server would speak again — an intermittent double whose "pattern"
was really the model's action choice. The client also syncs before judging,
so its local view is current at decision time. Every dry-run response
includes a `voiceProbe` with each arm's age (timestamps only).
