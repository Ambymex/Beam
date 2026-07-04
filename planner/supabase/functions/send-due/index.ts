// send-due (§7): invoked every minute by pg_cron. Finds scheduled_pushes whose
// fire_at has passed and sent=false, sends each as a Web Push via VAPID to its
// install's subscription, and marks it sent. This is what makes alerts land
// when the app is CLOSED — the whole point of the server spine.
//
// A stale subscription (404/410) prunes the install's subscription row so we
// stop trying.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendWebPush, type VapidKeys } from '../_shared/webpush.ts';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const keys: VapidKeys = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:planner@example.com',
  };

  const now = new Date().toISOString();
  // grab a batch of ripe events with their subscription, oldest first
  const { data: due, error } = await supabase
    .from('scheduled_pushes')
    .select('id, install_id, event_key, kind, title, body, vibe_id, push_subscriptions(endpoint, p256dh, auth)')
    .eq('sent', false)
    .lte('fire_at', now)
    .order('fire_at', { ascending: true })
    .limit(100);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0;
  let pruned = 0;
  for (const row of due ?? []) {
    const sub = (row as Record<string, unknown>).push_subscriptions as
      | { endpoint: string; p256dh: string; auth: string }
      | null;
    if (!sub?.endpoint) {
      await supabase.from('scheduled_pushes').update({ sent: true }).eq('id', row.id);
      continue;
    }
    // Transitions collapse by kind (two "dryer's free" = one banner) and open
    // the ring; companion messages are each their own banner (tag = event_key,
    // matching the client's local-fire tag so open-app overlap collapses too)
    // and tap through to the Comms channel where the full text lives.
    const isCompanion = row.kind === 'companion-alert';
    const payload = JSON.stringify({
      title: row.title,
      body: row.body,
      kind: row.kind,
      vibeId: row.vibe_id,
      url: isCompanion ? '/?comms=1' : '/',
      tag: isCompanion ? `${row.event_key}` : `${row.kind}`,
    });
    try {
      const res = await sendWebPush(sub, payload, keys);
      if (res.status === 404 || res.status === 410) {
        // subscription gone — prune it (cascade removes its events)
        await supabase.from('push_subscriptions').delete().eq('install_id', row.install_id);
        pruned++;
        continue;
      }
      await supabase.from('scheduled_pushes').update({ sent: true }).eq('id', row.id);
      if (res.ok) sent++;
    } catch {
      // transient — leave sent=false so the next cron tick retries
    }
  }
  return new Response(JSON.stringify({ ok: true, due: due?.length ?? 0, sent, pruned }), {
    headers: { 'content-type': 'application/json' },
  });
});
