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
    });
    unreadComms.update((n) => n + 1);
  } catch (err) {
    console.error('[Comms] Failed to archive message:', err);
  }
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
