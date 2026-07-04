// schedule-push: mirrors ONE companion-scheduled message into the push spine
// so it fires as a real web push when the app is closed. The client keeps its
// local Dexie copy (source of truth for the Comms archive); this row is the
// delivery vehicle.
//
// Rows land with kind 'companion-alert', which replace-events explicitly
// preserves — ring edits replace transitions, never his words.
//
// Service role, same reason as the siblings: anon can't touch scheduled_pushes.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { install_id, id, fire_at, title, body } = (await req.json()) as {
      install_id: string;
      id: string;
      fire_at: string;
      title: string;
      body?: string;
    };
    if (!install_id || !id || !fire_at || !title) {
      return json({ error: 'install_id, id, fire_at, title required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // event_key doubles as the notification tag; the client fires its local
    // copy under the same tag so open-app overlap collapses to one banner.
    const { error } = await supabase.from('scheduled_pushes').upsert(
      {
        install_id,
        event_key: `companion:${id}`,
        fire_at,
        kind: 'companion-alert',
        title,
        body: body ?? '',
        vibe_id: null,
        sent: false,
      },
      { onConflict: 'install_id,event_key' },
    );
    // FK failure (no push subscription uploaded yet) is expected on installs
    // that never enabled alerts — report it, the client treats it as advisory.
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
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
