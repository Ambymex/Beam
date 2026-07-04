// messages-sync: the single round-trip for the cross-app message vault.
// The client POSTs its sync key, any locally-unsynced messages, and its pull
// cursor; we upsert the pushed rows and return everything in that key's
// bucket newer than the cursor. Push and pull in one call keeps mobile
// clients cheap (one wake, one request).
//
// Uses the service-role key (server-only) because anon has no access to the
// messages table at all — the sync key in the body is the authorization.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface InMessage {
  id: string;
  channel: string; // 'chat' | 'comms'
  source?: string;
  role?: string | null;
  title?: string | null;
  body?: string;
  kind?: string | null;
  ts: string; // ISO
}

const PULL_LIMIT = 500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { sync_key, source, push, since } = (await req.json()) as {
      sync_key: string;
      source?: string;
      push?: InMessage[];
      since?: string | null;
    };

    // A short key is a typo or a guess, not an identity — refuse both.
    if (typeof sync_key !== 'string' || sync_key.length < 12) {
      return json({ error: 'sync_key required (min 12 chars)' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let pushed = 0;
    if (push && push.length) {
      const rows = push
        .filter((m) => m && typeof m.id === 'string' && m.id && typeof m.ts === 'string')
        .slice(0, 200) // sanity cap per call; the client just sends the rest next round
        .map((m) => ({
          id: m.id,
          sync_key,
          channel: m.channel === 'comms' ? 'comms' : 'chat',
          source: m.source || source || 'unknown',
          role: m.role ?? null,
          title: m.title ?? null,
          body: m.body ?? '',
          kind: m.kind ?? null,
          ts: m.ts,
        }));
      if (rows.length) {
        // ignoreDuplicates: a message never changes once said — first write wins
        const { error } = await supabase
          .from('messages')
          .upsert(rows, { onConflict: 'sync_key,id', ignoreDuplicates: true });
        if (error) return json({ error: error.message }, 500);
        pushed = rows.length;
      }
    }

    let query = supabase
      .from('messages')
      .select('id, channel, source, role, title, body, kind, ts, created_at')
      .eq('sync_key', sync_key)
      .order('created_at', { ascending: true })
      .limit(PULL_LIMIT);
    if (since) query = query.gt('created_at', since);

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const pulled = data ?? [];
    // Cursor only advances when rows arrive; more than PULL_LIMIT rows just
    // means the next sync continues from the new cursor.
    const cursor = pulled.length ? pulled[pulled.length - 1].created_at : (since ?? null);

    return json({ ok: true, pushed, pulled, cursor, more: pulled.length === PULL_LIMIT });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
