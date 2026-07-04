# Message vault — setup & cross-app API

The message vault mirrors the companion's **chat** and **comms** archives to
Supabase and pulls in messages written by **other apps** under the same sync
key. Two-way: the planner is one client of the vault, not its owner.

It reuses the push-spine project (same `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` build env). If those are unset, or no sync key is
entered, the whole feature is a silent no-op.

## 1. One-time deploy (server half)

```bash
# from planner/ (project is already linked)
supabase db push            # applies supabase/migrations/0002_message_vault.sql
supabase functions deploy messages-sync
```

No new secrets: the function only uses `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`, which Supabase injects automatically.

## 2. Turn it on in the planner

Companion → ⚙ settings → **Cross-App Sync Key** → *Generate* (or paste an
existing key). The key saves immediately and the first sync runs a moment
later; the tip line under the field shows `Synced HH:MM` or the last error.

- The key is the identity. Anyone holding it can read and write that bucket —
  treat it like a password. It lives in `localStorage`
  (`radial-planner-sync-key`), never in git.
- Entering the **same key on a fresh install** pulls the whole history back
  down (cursor starts at zero) — this is also the backup-restore story.
- Changing the key does NOT re-upload messages already marked synced; a brand
  new bucket starts from the next message onward.

## 3. Writing from another app

One endpoint does everything. POST to
`https://<PROJECT>.supabase.co/functions/v1/messages-sync` with the anon key
in the headers:

```
apikey: <ANON_KEY>
authorization: Bearer <ANON_KEY>
content-type: application/json
```

Body:

```json
{
  "sync_key": "sync_…the shared key…",
  "source": "beam-chat",
  "push": [
    {
      "id": "beamchat_msg_00042",
      "channel": "chat",
      "role": "assistant",
      "body": "the full message text",
      "ts": "2026-07-04T18:30:00Z"
    },
    {
      "id": "beamchat_note_7",
      "channel": "comms",
      "title": "Notification title",
      "body": "full notification body",
      "kind": "companion-alert",
      "ts": "2026-07-04T18:31:00Z"
    }
  ],
  "since": null
}
```

Response: `{ ok, pushed, pulled: [...], cursor, more }`.

Rules of the road:

- **`id` must be globally unique within the key's bucket and stable** — prefix
  with your app name. First write wins; a message never changes once said.
- `channel: "chat"` rows appear inside the planner's companion conversation
  (tagged "via <source>"); `channel: "comms"` rows land in the Comms panel as
  unread.
- To *read*, send `since` = the `cursor` you got last time (or `null` for
  everything) and keep your own cursor, exactly like the planner does.
- Push is capped at 200 rows per call; send the rest on the next call.
  `more: true` on pull means the same — call again with the new cursor.

## Data model (server)

One table, `messages`, primary key `(sync_key, id)`. RLS is enabled with **no
anon policies**: the anon key cannot touch the table directly; every read and
write goes through the `messages-sync` Edge Function, and the sync key in the
body is the authorization. See `supabase/migrations/0002_message_vault.sql`.

## Client plumbing (planner)

- `src/lib/msgSync.ts` — the engine: 90s interval + debounce after each chat
  save; one POST pushes unsynced chat/comms rows and pulls anything new.
- Chat state stays owned by `ChatCompanion.svelte` (always mounted); it
  registers an adapter (`getUnsynced` / `markSynced` / `mergeRemote`) instead
  of msgSync reaching into its localStorage.
- Comms sync state is a `synced` flag on the Dexie `comms` table (v6,
  additive). Remote comms arrive `read: 0, synced: 1` — unread but never
  echoed back up.
