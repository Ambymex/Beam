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
self.addEventListener('activate', (e) =>
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      // drop shell caches from older SW versions (bump SHELL_CACHE to retire)
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('radial-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))),
      ),
    ]),
  ),
);

// ---- App-shell caching --------------------------------------------------
// The phone reaches this app through a tunnel to a laptop that is sometimes
// asleep, busy, or offline. Without a cached shell, every cold launch
// re-streams the whole bundle through that tunnel — the "long black screen,
// long white screen" boot. Strategy:
//   • navigations: network-first with a short timeout, cached shell as the
//     fallback — fresh HTML when the tunnel is healthy, instant boot when not
//   • built assets (hashed, immutable): cache-first with quiet revalidation
//   • Vite DEV paths are excluded entirely so HMR and module serving are
//     untouched — this layer only truly pays off when serving a build
//     (`npm run phone`).
// The push/notification logic above is unrelated and unchanged (landmine 17
// lockstep applies to notification shaping only).
const SHELL_CACHE = 'radial-shell-v1';
const SHELL_MAX_ENTRIES = 80;
const NAV_TIMEOUT_MS = 3500;
const DEV_PATHS = /\/(@vite|@fs|@id|src|node_modules)\/|__vite|hot-update/;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (DEV_PATHS.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(shellNetworkFirst(req));
    return;
  }
  const isStatic =
    url.pathname.startsWith('/assets/') ||
    /\.(js|css|svg|png|ico|woff2?)$/.test(url.pathname) ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/manifest.json';
  if (isStatic) {
    event.respondWith(shellCacheFirst(req));
  }
});

async function shellNetworkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), NAV_TIMEOUT_MS);
    const fresh = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const hit = (await cache.match(req)) || (await cache.match('/'));
    if (hit) return hit;
    return new Response('The planner is unreachable and no cached copy exists yet. Check the tunnel/server and reload.', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });
  }
}

async function shellCacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  if (hit) {
    // hashed assets never change content under the same URL, but revalidate
    // quietly anyway so unhashed statics (icons, manifest) stay current
    fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res);
      })
      .catch(() => {});
    return hit;
  }
  const res = await fetch(req);
  if (res && res.ok) {
    await cache.put(req, res.clone());
    trimShellCache(cache).catch(() => {});
  }
  return res;
}

async function trimShellCache(cache) {
  const keys = await cache.keys();
  // keys() is insertion-ordered in practice; drop oldest past the cap so
  // successive builds' hashed assets don't accumulate forever
  for (let i = 0; i < keys.length - SHELL_MAX_ENTRIES; i++) {
    await cache.delete(keys[i]);
  }
}

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

// Tapping a notification focuses an existing window or opens one. An existing
// window is an SPA that must not be reloaded, so the target url travels by
// postMessage and the page routes itself (App.svelte listens); a fresh window
// gets the url directly and reads it from the query string on boot.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
