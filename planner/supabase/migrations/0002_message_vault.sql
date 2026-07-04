-- Message vault: the cloud copy of the companion's words (and the user's),
-- shared across apps. One row per message; chat and comms are channels of the
-- same table so any client that can write one can write the other.
--
-- Identity is a SHARED SYNC KEY (a random secret the user generates once and
-- pastes into each app) — not a login, and deliberately not the push spine's
-- per-install id, which can't span apps or reinstalls. The key partitions the
-- table into private buckets; the primary key is (sync_key, id) so client ids
-- only have to be unique within one user's space.
--
-- RLS: like the push spine, anon gets NO direct table access. All reads and
-- writes go through the messages-sync Edge Function (service role), which
-- requires the sync key in the request body.

create table if not exists messages (
  id          text not null,                       -- client-generated message id
  sync_key    text not null,                       -- the shared secret ("you")
  channel     text not null,                       -- 'chat' | 'comms'
  source      text not null default 'planner',     -- which app wrote it
  role        text,                                -- chat: 'user' | 'assistant'
  title       text,                                -- comms: notification title
  body        text not null default '',
  kind        text,                                -- comms: companion-alert | scheduled-alert
  ts          timestamptz not null,                -- when the message was said (client clock)
  created_at  timestamptz not null default now(),  -- when it reached the server (pull cursor)
  primary key (sync_key, id)
);

-- the pull query: everything in my bucket newer than my cursor
create index if not exists messages_pull_idx
  on messages (sync_key, created_at);

alter table messages enable row level security;
-- no anon policies on purpose: service-role-only via the Edge Function
