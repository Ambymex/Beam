import { db } from './db';
import { todayKey } from './days';
import { logComm } from './comms';
import { scheduleServerPush } from './sync';

/**
 * Schedules a new notification in the database, and mirrors it into the
 * server push spine so it can fire as a real web push when the app is closed.
 * The local Dexie row remains the source of truth (it feeds the Comms
 * archive); the server row is the delivery vehicle.
 */
export async function scheduleNotification(
  date: string,
  timeHours: number,
  title: string,
  body: string
): Promise<string> {
  const id = crypto.randomUUID();
  await db.notifications.put({
    id,
    date,
    timeHours,
    title,
    body,
    sent: 0
  });
  // date + decimal local hours → absolute instant for the server cron.
  // If the mirror lands, the SERVER owns banner delivery and the local
  // checker archives silently — one message, one banner (the app-open +
  // app-closed overlap double-delivered otherwise, since renotify re-buzzes
  // even on a matching tag).
  const [y, m, d] = date.split('-').map(Number);
  const fireAt = new Date(y, m - 1, d, 0, Math.round(timeHours * 60));
  scheduleServerPush(id, fireAt.toISOString(), title, body)
    .then((mirrored) => {
      if (mirrored) return db.notifications.update(id, { mirrored: 1 });
    })
    .catch(() => {});
  console.log(`[Scheduler] Notification scheduled: "${title}" at ${timeHours}h on ${date}.`);
  return id;
}

/**
 * Checks for any pending scheduled notifications that are due, fires them, and marks them as sent.
 */
export async function checkPendingNotifications(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const today = todayKey();
    const now = new Date();
    const currentHours = now.getHours() + now.getMinutes() / 60;

    // Get unsent notifications for today or past days
    const pending = await db.notifications
      .where('sent')
      .equals(0)
      .toArray();

    const due = pending.filter((n) => {
      // If it's a past day, it's immediately due.
      if (n.date < today) return true;
      // If it's today, check if the current time is past the scheduled time.
      if (n.date === today && currentHours >= n.timeHours) return true;
      return false;
    });

    if (due.length === 0) return;

    if (!('serviceWorker' in navigator)) {
      console.warn('[Scheduler] Service Worker not supported, cannot show notifications.');
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const isNotificationGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';

    for (const item of due) {
      // Archive the full text in the comms channel BEFORE attempting the
      // banner: the banner truncates and can be denied, the archive can't.
      await logComm(item.title, item.body, 'scheduled-alert');

      // Server-mirrored rows: the spine delivers the banner (app open or
      // closed) — the local checker only archives. Unmirrored rows keep the
      // local banner, but only near due time: a stale banner ("leave at 6!"
      // at 8pm) is worse than none — archive only.
      const serverOwnsDelivery = (item as { mirrored?: number }).mirrored === 1;
      const minutesLate =
        item.date < today
          ? Infinity
          : (currentHours - item.timeHours) * 60;
      const freshEnough = minutesLate <= 5;

      if (isNotificationGranted && freshEnough && !serverOwnsDelivery) {
        const payload = {
          title: item.title,
          body: item.body,
          // same tag the server push uses, so if both deliver within the
          // window the OS collapses them into one banner
          tag: `companion:${item.id}`,
          kind: 'scheduled-alert',
          url: '/?comms=1'
        };

        if (reg.active) {
          reg.active.postMessage({ type: 'mock-push', payload });
        } else {
          await reg.showNotification(item.title, { body: item.body, icon: '/icon.svg' });
        }
      } else if (!isNotificationGranted) {
        console.warn(`[Scheduler] Alert "${item.title}" is due, but notification permission is not granted.`);
      }

      // Mark as sent
      await db.notifications.update(item.id, { sent: 1 });
      console.log(`[Scheduler] Fired scheduled notification: "${item.title}"`);
    }
  } catch (err) {
    console.error('[Scheduler] Error checking pending notifications:', err);
  }
}
