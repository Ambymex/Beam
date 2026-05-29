// Beam service worker — offline-first for the app shell, network-first for
// the glucose API (which must stay live). Bump CACHE to invalidate.
const CACHE = "beam-v7";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./glucose.js",
  "./app.js",
  "./foods.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache live data endpoints.
  if (url.pathname.startsWith("/glucose") || url.pathname === "/config") {
    e.respondWith(fetch(e.request).catch(() => new Response("{}", { status: 503 })));
    return;
  }
  // Cache-first for the shell, falling back to network and caching new GETs.
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (e.request.method === "GET" && res.ok && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
    )
  );
});
