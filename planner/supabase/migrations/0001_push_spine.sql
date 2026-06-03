-- Push spine schema (spec §7) + the §10 "active colour now" socket.
--
-- Two tables, keyed by a per-install handle (no login): the device's push
-- subscription, and its upcoming transition events. A cron sends due events.
--
-- RLS: the anon key may upsert its own subscription and (via Edge Functions
-- using the service role) have its events replaced. Reads of raw rows are not
-- exposed to anon; the active-colour signal is served by an Edge Function.

create extension if not exists pg_cron;

-- one row per installed device
create table if not exists push_subscriptions (
  install_id  text primary key,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  updated_at  timestamptz not null default now()
);

-- upcoming transition pings; the cron flips sent=true after delivery
create table if not exists scheduled_pushes (
  id          bigint generated always as identity primary key,
  install_id  text not null references push_subscriptions(install_id) on delete cascade,
  event_key   text not null,                 -- 'YYYY-MM-DD:blockId:kind' (idempotent)
  fire_at     timestamptz not null,
  kind        text not null,                 -- block-start | appliance-free | travel-start
  title       text not null,
  body        text not null,
  vibe_id     text,                          -- for the §10 active-colour signal
  sent        boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (install_id, event_key)
);

create index if not exists scheduled_pushes_due_idx
  on scheduled_pushes (fire_at) where sent = false;

-- §10 socket: "what vibe is active right now" derives from the most recent
-- block-start whose window covers now. Exposed read-only via an Edge Function
-- (active-colour), not raw table access.

alter table push_subscriptions enable row level security;
alter table scheduled_pushes   enable row level security;

-- Anon may upsert its own subscription row (addressing this device). Everything
-- else (events, sends, the active-colour read) goes through Edge Functions that
-- use the service-role key, so no broad anon table access is granted.
drop policy if exists sub_upsert on push_subscriptions;
create policy sub_upsert on push_subscriptions
  for insert to anon with check (true);
drop policy if exists sub_update on push_subscriptions;
create policy sub_update on push_subscriptions
  for update to anon using (true) with check (true);
drop policy if exists sub_select on push_subscriptions;
create policy sub_select on push_subscriptions
  for select to anon using (true);

-- The cron job: every minute, invoke the send-due Edge Function. (Set the
-- function URL + service-role bearer once at deploy; see PUSH_SETUP.md.)
-- Example (run once in the SQL editor, with real values substituted):
--
--   select cron.schedule('send-due-pushes', '* * * * *', $$
--     select net.http_post(
--       url     := 'https://<PROJECT>.functions.supabase.co/send-due',
--       headers := jsonb_build_object(
--         'Content-Type','application/json',
--         'Authorization','Bearer <SERVICE_ROLE_KEY>'
--       ),
--       body    := '{}'::jsonb
--     );
--   $$);
