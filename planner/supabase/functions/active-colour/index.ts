// active-colour (§10 socket): "what vibe/colour is active right now?" exposed as
// a tiny read endpoint over the SAME schedule the pushes read. Tuya lights (or
// anything) become a LISTENER bolted on later, reading this — no rewrite, the
// socket is designed in from day one.
//
// Derives the current vibe from this install's most recent block-start event
// at or before now. Returns { vibeId } (or null). The hex stays client/DB-side
// (the listener maps vibe_id → colour from the user's palette); the server
// never invents a colour — consistent with §2.
//
// GET /active-colour?install_id=...

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const install = url.searchParams.get('install_id');
  if (!install) return json({ error: 'install_id required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // most recent block-start at/before now for this install
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('scheduled_pushes')
    .select('vibe_id, fire_at, kind')
    .eq('install_id', install)
    .lte('fire_at', now)
    .order('fire_at', { ascending: false })
    .limit(1);
  if (error) return json({ error: error.message }, 500);

  const row = data?.[0];
  return json({ vibeId: row?.vibe_id ?? null, since: row?.fire_at ?? null });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
