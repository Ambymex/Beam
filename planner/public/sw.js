// Service worker — the registration socket for the PWA and the Web Push
// receiver (spec §7). A closed iOS PWA cannot fire its own alerts, so the real
// schedule lives on the server (Supabase, next round) and PUSHES at the right
// moment via VAPID. This worker's job is to RENDER whatever lands.
//
// What we notify on (transitions only, §7): a block starting, an appliance
// cycle ENDING ("dryer's free, go"), and — the load-bearing one — the
// travel-START for an appointment ("time to leave"), never the appointment
// time. We never notify on an undone task; it migrates silently (§5/§13).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// Shape a notification from a transition payload. Kept tiny and shared so the
// real push path and the in-sandbox mock path render identically. This mirrors
// src/lib/notify.ts shapeNotification() (the canonical, unit-tested version) —
// the SW can't import from src, so the logic is duplicated deliberately and
// kept in lockstep.
async function showFromPayload(payload) {
  const data = payload || {};
  const title = data.title || 'Day Ring';

  let theme = 'dark';
  try {
    const cache = await caches.open('radial-planner-theme');
    const resp = await cache.match('/theme');
    if (resp) theme = await resp.text();
  } catch (e) {
    // fallback to dark
  }

  const icon = theme === 'light' ? '/icon-light.svg' : '/icon.svg';

  const options = {
    body: data.body || '',
    tag: data.tag || undefined, // collapse repeats of the same transition
    renotify: Boolean(data.tag),
    icon: icon,
    badge: icon,
    data: { url: data.url || '/', kind: data.kind || 'generic' },
    requireInteraction: false,
  };
  return self.registration.showNotification(title, options);
}

// Real Web Push (server → device). Payload is JSON in the push data.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(showFromPayload(payload));
});

// In-sandbox / local mock path: a page posts a payload to the SW and we render
// it exactly as a real push would. Lets the receive half be tested without a
// push service (which can't exist offline). Same code path, minus the cloud.
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'mock-push') {
    event.waitUntil(showFromPayload(msg.payload));
  }
});

// Tapping a notification focuses an existing window or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
