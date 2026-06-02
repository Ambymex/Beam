# Web Push spine — setup (§7)

The notification spine has two halves:

- **Receive half** (already built + working): the service worker renders a
  notification from a transition payload; `notify.ts` shapes it; the 🔔 Alerts
  panel handles permission + a local test.
- **Server half** (this doc): a Supabase project mirrors your schedule and a
  cron sends the due pings via VAPID — so alerts land **even when the app is
  closed**, which is the whole point.

What fires (transitions only): a block **starting**, an appliance cycle
**ending** ("dryer's free"), and for appointments the **travel-start**
("leave now" — at the departure edge, not the appointment time). Undone work
never pings; it migrates silently.

---

## 0. One-time: VAPID keys

```bash
npx web-push generate-vapid-keys
```

You get a **public** and **private** key (base64url). Public ships to the
client; private stays server-side only.

> A keypair was generated during the build session — reuse it or make a fresh
> one. Treat the private key as a secret.

---

## 1. Create the Supabase project + schema

1. Create a project at supabase.com (free tier is fine).
2. In the SQL editor, run [`supabase/migrations/0001_push_spine.sql`](./supabase/migrations/0001_push_spine.sql).
   It creates `push_subscriptions` + `scheduled_pushes`, indexes, and RLS.

---

## 2. Deploy the Edge Functions

```bash
supabase login
supabase link --project-ref <PROJECT_REF>

# set secrets (server-only)
supabase secrets set \
  VAPID_PUBLIC_KEY='<public>' \
  VAPID_PRIVATE_KEY='<private>' \
  VAPID_SUBJECT='mailto:you@example.com'

supabase functions deploy replace-events
supabase functions deploy send-due
supabase functions deploy active-colour
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions
automatically.)

---

## 3. Schedule the cron (every minute)

In the SQL editor, with your real values:

```sql
select cron.schedule('send-due-pushes', '* * * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-due',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
$$);
```

---

## 4. Point the client at it (build env)

Create `planner/.env` (or set in your host's build env):

```
VITE_VAPID_PUBLIC_KEY=<public>
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Rebuild + redeploy the PWA. Then on the **installed** app: 🔔 Alerts → Enable
alerts → it uploads your subscription + schedule. The Alerts panel will show
**Scheduled pings: synced ✓**.

---

## How the client stays in sync

- Editing the ring (draw, cascade, nudge, appointments) debounce-triggers a
  re-sync: `replace-events` swaps this install's **future, unsent** rows for the
  fresh set. Old plans vanish, new ones take their place.
- Each device has a random `install_id` in localStorage (no login). It scopes
  its own subscription + events; nothing is shared between installs.
- A dead subscription (404/410 from the push service) is pruned automatically.

## Verified in-sandbox

`events.ts` transition extraction is unit-tested (14 checks): block-start at
start, appliance-free at core-end, travel-start at the departure edge (not the
appointment time), done → no event, past-event filtering, idempotent keys. The
Edge Functions + VAPID crypto can only be exercised against a live Supabase
project (your step), so verify the end-to-end ping on-device after deploy:
draw a block a couple of minutes out, lock the phone, wait.

## §10 socket (Tuya later)

`active-colour` returns `{ vibeId }` for the currently-active block over the
same schedule. Lights bolt on later as a listener reading this endpoint and
mapping `vibe_id` → hex from your palette — no rewrite. The server never
invents a colour (§2).
