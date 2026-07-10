# Server-side heartbeat — setup

The `heartbeat` Edge Function is the companion's pulse while the app is
CLOSED: every 30 minutes it looks at the mirrored schedule
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
