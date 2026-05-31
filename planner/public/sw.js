// Minimal service worker — the registration socket for the PWA.
// The real spine (server-scheduled Web Push via VAPID, because a closed iOS
// PWA cannot fire its own alerts — spec §7) lands in build step 7.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
