/**
 * LectureScribe service worker.
 *
 * Scope note: transcription and search both need the network, so this worker
 * does not pretend the app works offline. What it does do:
 *
 *   - cache-first for fingerprinted static assets (JS/CSS/fonts/icons), which
 *     is the difference between a usable and a spinner app on 2G/3G;
 *   - network-first for navigations, falling back to the cached shell and then
 *     to /offline so a dropped connection never shows a browser error page;
 *   - never touch /api/. Those responses are per-user and mostly POST, so
 *     caching them would risk serving one student's lecture to another.
 *
 * Precaching is runtime rather than build-time because Next.js emits hashed
 * asset filenames that a static file cannot know ahead of time. If the shell
 * grows enough for that to matter, move to Serwist's compile-time manifest.
 */

const VERSION = "v1";
const SHELL_CACHE = `lecturescribe-shell-${VERSION}`;
const ASSET_CACHE = `lecturescribe-assets-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];

const OFFLINE_URL = "/offline";

/** Known-stable URLs worth having before the first online render finishes. */
const PRECACHE_URLS = [
  "/",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one 404 cannot fail the whole install.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            /* offline during install — runtime caching will fill this in */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("lecturescribe-"))
          .filter((name) => !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

/** Hashed build output — safe to serve from cache indefinitely. */
function isFingerprintedAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isCacheableIcon(url) {
  return url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Per-user API traffic: always straight to the network, never cached.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: fresh HTML when possible, cached shell when not.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(request)) ??
            (await cache.match("/")) ??
            (await cache.match(OFFLINE_URL)) ??
            Response.error()
          );
        }
      })()
    );
    return;
  }

  if (isFingerprintedAsset(url) || isCacheableIcon(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone()).catch(() => {});
          return response;
        } catch {
          return cached ?? Response.error();
        }
      })()
    );
  }
});

// Let the page trigger an immediate update instead of waiting for all tabs
// to close, which is the usual reason users get stuck on a stale build.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
