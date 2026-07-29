import { writable } from 'svelte/store';
import { db } from './db';

// The comms channel: a permanent, untruncated archive of every notification
// the companion sends. The OS banner clips his messages after a line or two;
// this is where the full text actually lands. Messages are logged at SEND
// time, unconditionally — even when notification permission is missing, so
// nothing he says is ever lost to a denied prompt.

export interface CommMessage {
  id: string;
  ts: number;
  title: string;
  body: string;
  kind: string; // 'companion-alert' | 'scheduled-alert'
  read: number; // 0 = unread, 1 = read
  synced?: number; // 0/absent = not yet uploaded to the cloud vault (msgSync.ts)
}

// Unread count for the header chip badge. Seeded from the db once it opens;
// kept current by logComm / markAllCommsRead (all writers live in-page).
export const unreadComms = writable(0);

if (typeof window !== 'undefined') {
  db.comms
    .where('read')
    .equals(0)
    .count()
    .then((n) => unreadComms.set(n))
    .catch(() => {});
}

export async function logComm(title: string, body: string, kind: string): Promise<void> {
  try {
    await db.comms.put({
      id: crypto.randomUUID(),
      ts: Date.now(),
      title,
      body,
      kind,
      read: 0,
      synced: 0,
    });
    unreadComms.update((n) => n + 1);
  } catch (err) {
    console.error('[Comms] Failed to archive message:', err);
  }
}

// ----- cloud vault plumbing (called by msgSync.ts; no imports back the other
// way, so the module graph stays acyclic) -----

// JS filter, not the synced index: rows written before the field existed have
// no index entry but still need their first upload.
export async function getUnsyncedComms(): Promise<CommMessage[]> {
  const all = await db.comms.toArray();
  return all.filter((c) => !c.synced);
}

export async function markCommsSynced(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.comms.where('id').anyOf(ids).modify({ synced: 1 });
}

// Messages another app dropped in the vault: land as unread, already synced
// (they came FROM the cloud — pushing them back would be an echo).
export async function insertRemoteComms(
  rows: Array<{ id: string; title: string | null; body: string; kind: string | null; ts: string }>
): Promise<void> {
  let added = 0;
  for (const r of rows) {
    const exists = await db.comms.get(r.id);
    if (exists) continue;
    await db.comms.put({
      id: r.id,
      ts: Date.parse(r.ts) || Date.now(),
      title: r.title || 'Message',
      body: r.body || '',
      kind: r.kind || 'companion-alert',
      read: 0,
      synced: 1,
    });
    added++;
  }
  if (added) unreadComms.update((n) => n + added);
}

// Most recent timestamp of HIS voice reaching her, ANY source — heartbeat
// check-ins ('companion-alert') and his fired future reminders
// ('scheduled-alert') both count; local sends and rows pulled in by msgSync
// both count. The client heartbeat uses this to yield when he already had
// her attention (the server-side twin lives in the heartbeat edge function)
// — one voice per half hour, never a fresh riff on a reminder that just
// fired. Ring-transition kinds are deliberately NOT counted: mechanical
// pings aren't him speaking.
export async function lastCompanionAlertTs(): Promise<number> {
  const recent = await db.comms.orderBy('ts').reverse().limit(25).toArray();
  const hit = recent.find((c) => c.kind === 'companion-alert' || c.kind === 'scheduled-alert');
  return hit?.ts ?? 0;
}

export async function loadComms(limit = 200): Promise<CommMessage[]> {
  return db.comms.orderBy('ts').reverse().limit(limit).toArray();
}

export async function markAllCommsRead(): Promise<void> {
  try {
    await db.comms.where('read').equals(0).modify({ read: 1 });
    unreadComms.set(0);
  } catch (err) {
    console.error('[Comms] Failed to mark messages read:', err);
  }
}

export async function clearComms(): Promise<void> {
  await db.comms.clear();
  unreadComms.set(0);
}
