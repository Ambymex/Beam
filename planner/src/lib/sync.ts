// Client → server sync for the push spine (§7). Uploads the push subscription
// and the upcoming transition events to Supabase, so a cron Edge Function can
// fire them when the app is CLOSED (the whole reason this is server-side).
//
// Degrades gracefully: with no Supabase env configured, every call is a no-op
// and the app works exactly as before. No hard dependency on the backend.
//
// We deliberately use plain fetch against Supabase's REST + Functions endpoints
// rather than the supabase-js SDK — keeps the bundle tiny and avoids a dep for
// what is two POSTs.

import { get, writable } from 'svelte/store';
import { days } from './days';
import { upcomingEvents } from './events';
import { subscribe as ensurePushSub } from './push';

const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const syncConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON);
export const lastSyncError = writable<string>('');

// A stable per-install id so the server can replace this device's events/sub
// without a login. Not personal — just a random handle in localStorage.
function installId(): string {
  try {
    if (typeof localStorage === 'undefined') return 'anon';
    let id = localStorage.getItem('radial-planner-install-id');
    if (!id) {
      id = 'inst_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('radial-planner-install-id', id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

function headers(): Record<string, string> {
  return {
    'content-type': 'application/json',
    apikey: SUPABASE_ANON,
    authorization: `Bearer ${SUPABASE_ANON}`,
  };
}

// Push the subscription so the server can address this device.
async function uploadSubscription(): Promise<boolean> {
  const sub = await ensurePushSub();
  if (!sub) {
    lastSyncError.set('Failed to obtain push subscription from browser.');
    return false;
  }
  const json = sub.toJSON();
  if (!json.keys || !json.keys.p256dh || !json.keys.auth) {
    lastSyncError.set('Push subscription is missing crypto keys.');
    return false;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: { ...headers(), prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        install_id: installId(),
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      lastSyncError.set(`DB subscription upload failed: ${res.status} ${text}`);
      return false;
    }
    return true;
  } catch (err) {
    lastSyncError.set(`Network error uploading subscription: ${String(err)}`);
    throw err;
  }
}

// Replace this install's scheduled events with the current upcoming set. The
// Edge Function (replace-events) deletes this install's future rows then
// inserts the new ones, so editing the ring stays in sync server-side.
async function uploadEvents(): Promise<boolean> {
  const evs = upcomingEvents(get(days), new Date());
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/replace-events`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ install_id: installId(), events: evs }),
    });
    if (!res.ok) {
      const text = await res.text();
      lastSyncError.set(`replace-events failed: ${res.status} ${text}`);
      return false;
    }
    return true;
  } catch (err) {
    lastSyncError.set(`Network error syncing events: ${String(err)}`);
    throw err;
  }
}

// Full sync: subscription + events. Safe to call often; no-ops if unconfigured
// or push isn't granted yet. Returns whether anything was uploaded.
export async function syncToServer(): Promise<boolean> {
  if (!syncConfigured) {
    lastSyncError.set('Supabase URL or Anon key is missing in build env.');
    return false;
  }
  try {
    lastSyncError.set('');
    const subbed = await uploadSubscription();
    if (!subbed) return false; // no point uploading events with nowhere to send
    const eventsOk = await uploadEvents();
    return eventsOk;
  } catch (err) {
    console.error('syncToServer error:', err);
    lastSyncError.set(String(err));
    return false; // offline / server down — the app is unaffected
  }
}

// Re-sync whenever the schedule changes (debounced), once configured + granted.
let timer: ReturnType<typeof setTimeout> | null = null;
export function scheduleResync() {
  if (!syncConfigured) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncToServer(), 1500);
}
