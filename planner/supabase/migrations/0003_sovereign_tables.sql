-- Sovereign Terminal's home tables, relocated onto this project after its
-- original Supabase project (nlwwgxcw…) disappeared (free-tier pause/expiry).
-- Schema matches what its session_manager.py already expects, so the only
-- client change is pointing SUPABASE_URL/SUPABASE_KEY here.
--
-- RLS enabled with NO anon policies: this project's anon key ships inside the
-- planner PWA, so it must not open these tables. Sovereign Terminal is a
-- trusted local app and uses the service-role key instead (which bypasses RLS).

create table if not exists chats (
  id          text primary key,
  title       text,
  messages    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists user_settings (
  id      bigint primary key,
  config  jsonb not null default '{}'::jsonb
);

alter table chats         enable row level security;
alter table user_settings enable row level security;
-- no anon policies on purpose (service-role access only)
