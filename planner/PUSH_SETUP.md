# Web Push setup (§7) — what's built, what's next

This is the **receive half** of the notification spine. The server half
(Supabase schedule + cron + VAPID send) is the next round and needs your
project + keys.

## What works now (verifiable)

- **Service worker** (`public/sw.js`) renders a notification from a transition
  payload on `push` and on a local `mock-push` message. `notificationclick`
  focuses/opens the app.
- **`src/lib/notify.ts`** — the canonical, unit-tested payload→notification
  shaping (the SW mirrors it). Transitions only: `block-start`,
  `appliance-free`, `travel-start`. There is deliberately **no `undone` kind** —
  undone work migrates silently (§5/§13), never nags.
- **`src/lib/push.ts`** — permission request, subscribe (degrades gracefully
  until the VAPID key is set), `isStandalone()` detection, and
  `sendTestNotification()` which fires through the SW.
- **Alerts settings** (`🔔 Alerts`) — permission state, enable, **send a test**,
  and the iOS Share → Add to Home Screen guidance.

### Verified in CI/sandbox
`shapeNotification` unit tests (titles, kinds, tag/renotify, null-safety,
icons), SW message acceptance, and the Alerts UI. **Not** verifiable in a
headless browser: the OS actually painting the notification — confirm that
on-device after installing to the Home Screen.

## On-device check (you)

1. Deploy over **HTTPS** (required for service workers + push).
2. On iPhone: open in Safari → **Share → Add to Home Screen** → open from the
   Home Screen (must be standalone — §7).
3. `🔔 Alerts → Enable alerts` (the prompt must fire from inside the installed
   PWA), then **Send a test alert**. You should see "Time to leave …".

## Server half (next round — needs your Supabase project)

1. **Generate a VAPID keypair** (do NOT commit the private key):
   ```bash
   npx web-push generate-vapid-keys
   ```
   - Public key → client build env: `VITE_VAPID_PUBLIC_KEY=...`
     (e.g. a `.env` consumed by Vite; it's safe to ship publicly).
   - Private key → Supabase Edge Function secret only.

2. **Schema** (Supabase):
   - `push_subscriptions(user_id, endpoint, p256dh, auth, created_at)` — the
     client POSTs `subscribe()`'s result here.
   - the schedule already lives client-side; mirror the blocks you want
     server-fired (block starts, appliance-cycle ends, appointment
     travel-starts) into a `scheduled_pushes(fire_at, payload, sub_id, sent)`
     table.

3. **Edge Function on a cron** (`pg_cron` or scheduled function): every minute,
   select due `scheduled_pushes`, send Web Push via VAPID to each subscription,
   mark `sent`. The load-bearing ping is the **travel-start** ("leave now"),
   which the client already exposes as `departureHours()` on each appointment.

4. **Active-colour signal (§10 socket):** expose "what vibe is active right now"
   as a tiny read endpoint over the same schedule. Tuya lights bolt on later as
   a listener — no rewrite.

The client is already shaped for all of this: appointments carry their
departure edge, blocks carry start/vibe, and `push.ts` is ready to POST a real
subscription the moment `VITE_VAPID_PUBLIC_KEY` is set.
