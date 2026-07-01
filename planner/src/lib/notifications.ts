import { db } from './db';
import { todayKey } from './days';

/**
 * Schedules a new notification in the database.
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
      if (isNotificationGranted) {
        const payload = {
          title: item.title,
          body: item.body,
          tag: item.id,
          kind: 'scheduled-alert',
          url: '/'
        };

        if (reg.active) {
          reg.active.postMessage({ type: 'mock-push', payload });
        } else {
          await reg.showNotification(item.title, { body: item.body, icon: '/icon.svg' });
        }
      } else {
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
