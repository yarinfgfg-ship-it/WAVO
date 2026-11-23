/* WAVO service worker — caches the app shell for offline use. */
const CACHE = "wavo-shell-v2";
const ASSETS = [
  "/", "/index.html",
  "/wavo/app.html", "/wavo/style.css", "/wavo/extras.css", "/wavo/polish.css",
  "/wavo/fresh.css", "/wavo/mobile.css", "/wavo/ios.css",
  "/wavo/songs.js", "/wavo/channels.js", "/wavo/providers.js", "/wavo/script.js",
  "/wavo/extras.js", "/wavo/mobile.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // network-first for API and cross-origin (YouTube, etc.)
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // network-first for pages and HTML (always fresh when online)
  const isHTML = req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname === "";
  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }
  // stale-while-revalidate for static assets
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
