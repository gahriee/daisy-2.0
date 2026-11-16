/// <reference lib="webworker" />

import {
  classifySwRequest,
  OFFLINE_SHELL_PATH,
  SW_CACHE_VERSION,
  SW_PRECACHE_URLS,
} from "./offline/sw-policy";

declare const self: ServiceWorkerGlobalScope;

/**
 * Daisy Service Worker (`src/sw.ts` mirrored to `public/sw.js`):
 * - Precaches strictly PII-free static shell & `/offline` bootstrap document.
 * - Never intercepts or caches `/api/*`, authenticated HTML/RSC responses, `/book`
 *   live routes, private attachments/contracts/proofs, or CSV exports.
 * - Supports explicit SKIP_WAITING activation once pending edits settle.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SW_CACHE_VERSION).then(async (cache) => {
      await cache.addAll([...SW_PRECACHE_URLS]);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SW_CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (
    event.data &&
    typeof event.data === "object" &&
    "type" in event.data &&
    event.data.type === "DAISY_SKIP_WAITING"
  ) {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const action = classifySwRequest({
    method: request.method,
    pathname: url.pathname,
    mode: request.mode,
    hasRscHeader: request.headers.has("rsc"),
    sameOrigin: url.origin === self.location.origin,
  });

  if (action === "network-only") {
    return;
  }

  if (action === "cache-first-static") {
    event.respondWith(
      caches.open(SW_CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        const cacheControl = response.headers.get("cache-control") ?? "";
        if (
          response.ok &&
          response.type === "basic" &&
          !/(no-store|no-cache)/i.test(cacheControl)
        ) {
          void cache.put(request, response.clone());
        }
        return response;
      }),
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(SW_CACHE_VERSION);
      const fallback = await cache.match(OFFLINE_SHELL_PATH);
      if (fallback) return fallback;
      return new Response("Offline shell unavailable. Connect to reload.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }),
  );
});
