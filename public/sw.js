// Service worker for offline play
// Caches: app shell, sprites, sounds, font, prompts JSON, playlist JSON
// Does NOT cache: music files (too big — they stream)

const CACHE_VERSION = "v1";
const APP_CACHE = `matijamon-app-${CACHE_VERSION}`;
const ASSETS_CACHE = `matijamon-assets-${CACHE_VERSION}`;

// Static assets to pre-cache for offline play
const ASSETS_TO_CACHE = [
  "/fonts/PressStart2P-Regular.ttf",
  // Sprites
  "/sprites/matija1.png", "/sprites/matija2.png",
  "/sprites/pasko1.png", "/sprites/pasko2.png",
  "/sprites/sandro1.png", "/sprites/sandro2.png",
  "/sprites/bliki1.png", "/sprites/bliki2.png",
  "/sprites/fixx1.png", "/sprites/fixx2.png",
  "/sprites/covic1.png", "/sprites/covic2.png",
  "/sprites/denis1.png", "/sprites/denis2.png",
  "/sprites/stipe1.png", "/sprites/stipe2.png",
  "/sprites/goran1.png", "/sprites/goran2.png",
  "/sprites/rukavina1.png", "/sprites/rukavina2.png",
  "/sprites/sina1.png", "/sprites/sina2.png",
  "/sprites/mislav1.png", "/sprites/mislav2.png",
  "/sprites/braovic1.png", "/sprites/braovic2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(ASSETS_CACHE).then(async (cache) => {
      // Cache assets in parallel, ignore individual failures
      await Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          fetch(url).then(res => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== APP_CACHE && k !== ASSETS_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Don't cache music files (too big)
  if (url.pathname.startsWith("/music/")) return;

  // Don't cache Supabase requests
  if (url.host.includes("supabase")) return;

  // Cache-first for static assets
  if (
    url.pathname.startsWith("/sprites/") ||
    url.pathname.startsWith("/sounds/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(ASSETS_CACHE).then(c => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first for HTML pages, fallback to cache
  if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(APP_CACHE).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then(c => c || caches.match("/")))
    );
  }
});
