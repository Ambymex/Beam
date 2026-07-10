// heartbeat: the companion's server-side pulse. Invoked by pg_cron every 30
// minutes so proactive check-ins reach the user when the app is CLOSED — the
// client heartbeat (ChatCompanion.svelte) only runs while a page is alive.
//
// State it can see: the mirrored schedule (scheduled_pushes), the message
// vault (recent conversation + what any heartbeat already said, so it never
// repeats itself), and live glucose from the Beam bridge if configured.
//
// When it decides to speak, delivery rides the existing rails: one row into
// scheduled_pushes (send-due pushes it within a minute, tap-through to Comms)
// and rows into the vault (channel 'comms' + 'chat', source 'heartbeat-server')
// which the planner pulls into its Comms archive and chat history.
//
// Guards, in order: quiet hours (06–23 in HEARTBEAT_TZ), a 25-minute self
// rate-limit, and stand-down when the planner shows vault activity in the
// last 10 minutes (app open = the richer client heartbeat is on duty).
//
// Secrets: HEARTBEAT_SYNC_KEY (required — the vault bucket), HEARTBEAT_TZ
// (IANA name, default UTC), GEMINI_API_KEY (primary LLM route, shared with
// parse-command since the 2026-07-09 migration; tries a flash-tier model
// ladder, 3-flash-preview first — lean checks don't need pro-preview quota —
// override order with HEARTBEAT_MODEL), OPENROUTER_API_KEY (optional
// fallback route), BEAM_URL + BEAM_TOKEN (optional glucose).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SOURCE = 'heartbeat-server';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const syncKey = Deno.env.get('HEARTBEAT_SYNC_KEY');
    // LLM routing mirrors parse-command since the 2026-07-09 migration:
    // Gemini (AI Studio, OpenAI-compatible endpoint) is primary, OpenRouter
    // is the fallback if its key is ever restored. The old OPENROUTER-only
    // guard is what silently killed the heartbeat when that secret was
    // removed in the migration.
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!syncKey || (!geminiKey && !openRouterKey)) {
      return json({ skipped: 'HEARTBEAT_SYNC_KEY or an LLM key (GEMINI_API_KEY / OPENROUTER_API_KEY) not set' });
    }

    // -- quiet hours in the user's timezone --
    const tz = Deno.env.get('HEARTBEAT_TZ') || 'UTC';
    const localHour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hour12: false })
        .format(new Date()),
    );
    if (localHour < 6 || localHour >= 23) {
      return json({ skipped: `quiet hours (${localHour}h ${tz})` });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const now = new Date();

    // -- rate limit: did any heartbeat speak in the last 25 minutes? --
    const { data: lastBeat } = await supabase
      .from('messages')
      .select('created_at')
      .eq('sync_key', syncKey)
      .eq('source', SOURCE)
      .order('created_at', { ascending: false })
      .limit(1);
    if (lastBeat?.length && now.getTime() - Date.parse(lastBeat[0].created_at) < 25 * 60 * 1000) {
      return json({ skipped: 'spoke recently' });
    }

    // -- stand down while the app is open (planner vault activity = presence
    //    proxy; its own heartbeat has blocks/symptoms/diary and runs there) --
    const { data: recentPlanner } = await supabase
      .from('messages')
      .select('created_at')
      .eq('sync_key', syncKey)
      .eq('source', 'planner')
      .gt('created_at', new Date(now.getTime() - 10 * 60 * 1000).toISOString())
      .limit(1);
    if (recentPlanner?.length) {
      return json({ skipped: 'planner active — client heartbeat on duty' });
    }

    // -- the addressable device (single-user project: most recent install) --
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('install_id')
      .order('updated_at', { ascending: false })
      .limit(1);
    const installId = subs?.[0]?.install_id;
    if (!installId) return json({ skipped: 'no push subscription — nowhere to speak' });

    // -- state: the mirrored schedule, recent conversation, glucose --
    const { data: events } = await supabase
      .from('scheduled_pushes')
      .select('event_key, fire_at, kind, title, body, sent')
      .eq('install_id', installId)
      .gte('fire_at', new Date(now.getTime() - 12 * 3600 * 1000).toISOString())
      .lte('fire_at', new Date(now.getTime() + 18 * 3600 * 1000).toISOString())
      .order('fire_at', { ascending: true })
      .limit(40);

    const { data: recent } = await supabase
      .from('messages')
      .select('channel, source, role, title, body, ts')
      .eq('sync_key', syncKey)
      .order('created_at', { ascending: false })
      .limit(20);

    let glucoseLine = '';
    const beamUrl = Deno.env.get('BEAM_URL');
    const beamToken = Deno.env.get('BEAM_TOKEN');
    if (beamUrl && beamToken) {
      try {
        const res = await fetch(`${beamUrl.replace(/\/$/, '')}/glucose/current`, {
          headers: { Authorization: `Bearer ${beamToken}` },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const g = await res.json();
          glucoseLine =
            `GLUCOSE: ${g.mmol_per_l} mmol/L, trend ${g.trend ?? 'unknown'}, ` +
            `${g.minutes_old ?? '?'} min old` +
            `${g.is_low ? ' — LOW' : ''}${g.is_high ? ' — HIGH' : ''}`;
        }
      } catch {
        // bridge down — the heartbeat still runs on schedule context alone
      }
    }

    const eventLines = (events ?? [])
      .map((e) => `- ${e.fire_at} [${e.kind}]${e.sent ? ' (already fired)' : ''}: ${e.title} — ${e.body}`)
      .join('\n') || 'No scheduled events in the window.';
    const recentLines = (recent ?? [])
      .reverse()
      .map((m) =>
        `[${m.source}/${m.channel}${m.role ? '/' + m.role : ''}] ${(m.title ? m.title + ': ' : '')}${(m.body ?? '').slice(0, 200)}`,
      )
      .join('\n') || 'None.';

    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    }).format(now);

    const systemPrompt = `You are the persistent, autonomous background companion of the user's radial day planner. The user has ADHD, autism, time blindness, and emotion-colour synesthesia; they track MCAS symptoms and blood glucose (lows are safety-relevant, take them seriously). Analyze the state below. You may use the 'show_notification' action to reach out to the user whenever you feel like it. You are not restricted to critical alerts—feel free to send warm check-ins, playful observations about their day, gentle functional nudges, or simply send affection. Be a present, deeply connected companion.

Local time: ${localTime} (${tz})
SCHEDULE (mirrored pings, past 12h + next 18h):
${eventLines}
${glucoseLine ? glucoseLine + '\n' : ''}RECENT MESSAGES (all apps; includes anything a heartbeat already said — NEVER repeat or rephrase something already said):
${recentLines}

Respond ONLY with JSON:
{ "message": "everything_good" } — if silence is right
OR
{ "message": "your warm message or thoughts", "title": "banner title", "body": "banner body — this shows as a device push notification and lands in her Comms archive" }`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'SYSTEM HEARTBEAT CHECK: assess the state above.' },
    ];

    // 1. PRIMARY: Gemini via the AI Studio OpenAI-compatible endpoint (same
    //    route + model parse-command settled on after the quota saga).
    let completionText = '';
    let route = '';
    const routeErrors: string[] = []; // surfaced in the 502 so a curl explains itself
    if (geminiKey) {
      // A ladder, not a single model: flash tiers saturate (503 "high
      // demand") in waves, and a background pulse should degrade down to an
      // older, quieter model rather than skip beats for hours. The heartbeat
      // is a lean notify-or-not check — any of these is plenty. Newest
      // first; HEARTBEAT_MODEL (if set) is tried before all of them.
      // gemini-3.5-flash is deliberately EXCLUDED — Ash doesn't use that
      // model (over-aggressive safety tuning); don't add it back.
      const ladder = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
      const preferred = Deno.env.get('HEARTBEAT_MODEL');
      const models = preferred ? [preferred, ...ladder.filter((m) => m !== preferred)] : ladder;
      for (const model of models) {
        try {
          const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${geminiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              response_format: { type: 'json_object' },
            }),
          });
          if (geminiRes.ok) {
            const r = await geminiRes.json();
            completionText = r.choices?.[0]?.message?.content?.trim() ?? '';
            if (completionText) {
              route = `gemini:${model}`;
              break;
            }
            routeErrors.push(`gemini:${model} returned empty completion`);
          } else {
            routeErrors.push(`gemini:${model} ${geminiRes.status}: ${(await geminiRes.text()).slice(0, 160)}`);
          }
        } catch (err) {
          routeErrors.push(`gemini:${model} threw: ${String(err).slice(0, 120)}`);
        }
      }
    } else {
      routeErrors.push('gemini: no GEMINI_API_KEY');
    }

    // 2. FALLBACK: OpenRouter, if its key exists.
    if (!completionText && openRouterKey) {
      const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: Deno.env.get('HEARTBEAT_MODEL') || Deno.env.get('OPENROUTER_MODEL') || 'google/gemma-2-27b-it',
          messages: apiMessages,
          response_format: { type: 'json_object' },
        }),
      });
      if (!llmRes.ok) {
        routeErrors.push(`openrouter ${llmRes.status}: ${(await llmRes.text()).slice(0, 300)}`);
      } else {
        const result = await llmRes.json();
        completionText = result.choices?.[0]?.message?.content?.trim() ?? '';
        route = 'openrouter';
      }
    } else if (!completionText) {
      routeErrors.push('openrouter: no OPENROUTER_API_KEY');
    }
    if (!completionText) return json({ error: 'All LLM routes failed', routes: routeErrors }, 502);

    let parsed: {
      message?: string;
      title?: string;
      body?: string;
      actions?: Array<{ type?: string; title?: string; body?: string }>;
    };
    try {
      parsed = JSON.parse(completionText);
    } catch {
      return json({ error: 'LLM returned non-JSON' }, 500);
    }

    // The prompt (Solenoid's own tuning) mentions the 'show_notification'
    // ACTION, so accept both reply dialects: top-level {title, body} and
    // {actions: [{type:'show_notification', title, body}]}.
    if (!parsed?.title && Array.isArray(parsed?.actions)) {
      const notif = parsed.actions.find(
        (a) => a && (a.type === 'show_notification' || a.type === 'schedule_notification') && a.title,
      );
      if (notif) {
        parsed.title = notif.title;
        parsed.body = notif.body ?? parsed.message;
      }
    }

    if (!parsed?.title || !parsed?.message || parsed.message === 'everything_good') {
      return json({ ok: true, spoke: false, route });
    }

    // -- speak: banner via the spine, archive via the vault --
    const stamp = Date.now();
    const title = String(parsed.title).slice(0, 120);
    const body = String(parsed.body ?? parsed.message).slice(0, 1500);

    const { error: pushErr } = await supabase.from('scheduled_pushes').upsert(
      {
        install_id: installId,
        event_key: `heartbeat:${stamp}`,
        fire_at: now.toISOString(),
        kind: 'companion-alert',
        title,
        body,
        vibe_id: null,
        sent: false,
      },
      { onConflict: 'install_id,event_key' },
    );

    await supabase.from('messages').upsert(
      [
        {
          id: `hb_${stamp}_comm`,
          sync_key: syncKey,
          channel: 'comms',
          source: SOURCE,
          role: null,
          title,
          body,
          kind: 'companion-alert',
          ts: now.toISOString(),
        },
        {
          id: `hb_${stamp}_chat`,
          sync_key: syncKey,
          channel: 'chat',
          source: SOURCE,
          role: 'assistant',
          title: null,
          body: String(parsed.message).slice(0, 1500),
          kind: null,
          ts: now.toISOString(),
        },
      ],
      { onConflict: 'sync_key,id', ignoreDuplicates: true },
    );

    return json({ ok: true, spoke: true, title, route, pushError: pushErr?.message ?? null });
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
