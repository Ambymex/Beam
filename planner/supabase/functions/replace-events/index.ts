// replace-events (§7): the client POSTs its install_id + the current upcoming
// transition events; we atomically replace that install's FUTURE unsent rows.
// Editing the ring (cascade, nudge, new appointments) thus stays in sync — old
// plans vanish, new ones take their place — without ever touching other
// installs or already-sent pings.
//
// Uses the service-role key (server-only) so it can write scheduled_pushes,
// which anon can't reach directly.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface InEvent {
  key: string;
  fireAt: string;
  kind: string;
  title: string;
  body: string;
  vibeId: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { install_id, events } = (await req.json()) as {
      install_id: string;
      events: InEvent[];
    };
    if (!install_id) return json({ error: 'install_id required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // drop this install's future, unsent rows, then insert the fresh set
    await supabase
      .from('scheduled_pushes')
      .delete()
      .eq('install_id', install_id)
      .eq('sent', false)
      .gte('fire_at', new Date().toISOString());

    const rows = (events ?? []).map((e) => ({
      install_id,
      event_key: e.key,
      fire_at: e.fireAt,
      kind: e.kind,
      title: e.title,
      body: e.body,
      vibe_id: e.vibeId ?? null,
      sent: false,
    }));

    if (rows.length) {
      const { error } = await supabase
        .from('scheduled_pushes')
        .upsert(rows, { onConflict: 'install_id,event_key' });
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true, count: rows.length });
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
