// Cross-app message sync: mirrors the companion's chat + comms archive to the
// Supabase message vault, and pulls in anything other apps have written under
// the same sync key (two-way — "one continuous him across apps").
//
// Same degrade-gracefully contract as sync.ts: no Supabase env or no sync key
// configured → every call is a no-op and the app is exactly as before. Plain
// fetch, no SDK, one round trip per sync (push + pull share a call).
//
// Chat storage stays owned by ChatCompanion (it's always mounted since the
// heartbeat change); it registers an adapter here rather than this module
// reaching into its localStorage behind its back.

import { writable } from 'svelte/store';
import { getUnsyncedComms, markCommsSynced, insertRemoteComms } from './comms';

const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const KEY_STORAGE = 'radial-planner-sync-key';
const CURSOR_STORAGE = 'radial-planner-msgsync-cursor';
const SOURCE = 'planner';

export const msgSyncConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON);
// One-line status for the settings panel ("Synced 14:02" / the last error).
export const msgSyncStatus = writable<string>('');

export function getSyncKey(): string {
  try {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(KEY_STORAGE) ?? ''
      : '';
  } catch {
    return '';
  }
}

export function setSyncKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
    else localStorage.removeItem(KEY_STORAGE);
    // A fresh key means a fresh bucket: restart the pull from the beginning
    // so an existing vault's history arrives on this device.
    localStorage.removeItem(CURSOR_STORAGE);
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
  if (key.trim()) scheduleMsgSync(500);
}

export function generateSyncKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // ~5 bits per char × 24 — plenty for a private bucket id
  return 'sync_' + Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

// ----- the chat adapter: ChatCompanion plugs its message list in here -----

export interface ChatSyncMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO
  source?: string;
}

export interface ChatAdapter {
  getUnsynced(): ChatSyncMessage[];
  markSynced(ids: string[]): void;
  mergeRemote(msgs: ChatSyncMessage[]): void;
}

let chatAdapter: ChatAdapter | null = null;
export function registerChatAdapter(adapter: ChatAdapter): void {
  chatAdapter = adapter;
}

// ----- the sync itself -----

interface RemoteMessage {
  id: string;
  channel: string;
  source: string;
  role: string | null;
  title: string | null;
  body: string;
  kind: string | null;
  ts: string;
  created_at: string;
}

let syncing = false;

export async function syncMessages(): Promise<boolean> {
  const key = getSyncKey();
  if (!msgSyncConfigured || !key || syncing) return false;
  syncing = true;
  try {
    const chatOut = chatAdapter?.getUnsynced() ?? [];
    const commsOut = await getUnsyncedComms();

    const push = [
      ...chatOut.map((m) => ({
        id: m.id,
        channel: 'chat',
        role: m.role,
        body: m.content,
        ts: m.timestamp,
      })),
      ...commsOut.map((c) => ({
        id: c.id,
        channel: 'comms',
        title: c.title,
        body: c.body,
        kind: c.kind,
        ts: new Date(c.ts).toISOString(),
      })),
    ];

    const since = localStorage.getItem(CURSOR_STORAGE) || null;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/messages-sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SUPABASE_ANON,
        authorization: `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ sync_key: key, source: SOURCE, push, since }),
    });
    if (!res.ok) throw new Error(`messages-sync ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // The server cap is 200 rows/call; it upserts what it takes, so only mark
    // what was actually accepted and resend the remainder next round.
    const accepted = new Set(push.slice(0, data.pushed ?? push.length).map((p) => p.id));
    const chatDone = chatOut.filter((m) => accepted.has(m.id)).map((m) => m.id);
    const commsDone = commsOut.filter((c) => accepted.has(c.id)).map((c) => c.id);
    if (chatDone.length) chatAdapter?.markSynced(chatDone);
    await markCommsSynced(commsDone);

    const pulled: RemoteMessage[] = data.pulled ?? [];
    const chatIn = pulled
      .filter((p) => p.channel === 'chat')
      .map((p) => ({
        id: p.id,
        role: p.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: p.body,
        timestamp: p.ts,
        source: p.source,
      }));
    // Own comms come back on the pull too (cursor catches up past our pushes);
    // insertRemoteComms dedupes by id, but skipping our source saves the reads.
    const commsIn = pulled.filter((p) => p.channel === 'comms' && p.source !== SOURCE);
    if (chatIn.length) chatAdapter?.mergeRemote(chatIn);
    if (commsIn.length) await insertRemoteComms(commsIn);

    if (data.cursor) localStorage.setItem(CURSOR_STORAGE, data.cursor);
    msgSyncStatus.set(
      `Synced ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    );
    if (data.more || push.length > (data.pushed ?? 0)) scheduleMsgSync(800); // drain the backlog
    return true;
  } catch (err) {
    console.warn('[MsgSync] sync failed:', err);
    msgSyncStatus.set(`Sync error: ${String(err).slice(0, 140)}`);
    return false;
  } finally {
    syncing = false;
  }
}

// Debounced trigger for "something just happened" call sites (saveChat).
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleMsgSync(ms = 2000): void {
  if (!msgSyncConfigured || !getSyncKey()) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void syncMessages(), ms);
}

// Steady background cadence so messages from other apps arrive without the
// user doing anything here. Started from App.svelte alongside the other
// engines (env theme, glucose).
let interval: ReturnType<typeof setInterval> | null = null;
export function startMsgSync(): void {
  scheduleMsgSync(3000);
  interval = setInterval(() => void syncMessages(), 90000);
}

export function stopMsgSync(): void {
  if (interval) clearInterval(interval);
  if (debounceTimer) clearTimeout(debounceTimer);
}
