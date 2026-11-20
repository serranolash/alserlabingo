// Service Worker — offline-ready shell + cache de assets estáticos.
// Estrategia: cache-first para assets, network-first para navegación,
// stale-while-revalidate para la API de estado (mejor esfuerzo offline).
const CACHE = "bingo75-v1";
const SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Navegación: network-first, fallback a / cacheado (offline shell).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Assets estáticos (mismo origen): cache-first.
  if (url.origin === self.location.origin && /\.(png|svg|js|css|ico|json)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached)),
    );
    return;
  }

  // API: network, sin cache (datos sensibles / en tiempo real).
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Default: network, fallback a cache.
  event.respondWith(
    fetch(req).catch(() => caches.match(req)),
  );
});
