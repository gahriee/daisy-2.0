/// <reference lib="webworker" />

import {
  classifySwRequest,
  extractOfflineShellAssetUrls,
  OFFLINE_SHELL_PATH,
  SW_CACHE_VERSION,
  SW_PRECACHE_URLS,
} from "./offline/sw-policy";

declare const self: ServiceWorkerGlobalScope;

/**
 * Daisy Service Worker (`src/sw.ts` mirrored to `public/sw.js`):
 * - Precaches strictly PII-free static shell, `/offline` bootstrap document,
 *   and the hashed `/_next/static/*` bundles `/offline` needs to hydrate.
 * - Never intercepts or caches `/api/*`, authenticated HTML/RSC responses, `/book`
 *   live routes, private attachments/contracts/proofs, or CSV exports.
 * - Supports explicit SKIP_WAITING activation once pending edits settle.
 */
async function precacheOfflineShell(cache: Cache): Promise<void> {
  const staticUrls = SW_PRECACHE_URLS.filter(
    (url) => url !== OFFLINE_SHELL_PATH,
  );
  await Promise.allSettled(staticUrls.map((url) => cache.add(url)));

  const shellResponse = await fetch(OFFLINE_SHELL_PATH, { cache: "reload" });
  if (!shellResponse.ok) {
    throw new Error("Could not precache /offline shell.");
  }
  const html = await shellResponse.clone().text();
  await cache.put(OFFLINE_SHELL_PATH, shellResponse);

  const assetUrls = extractOfflineShellAssetUrls(html);
  await Promise.allSettled(
    assetUrls.map(async (assetUrl) => {
      const existing = await cache.match(assetUrl);
      if (existing) return;
      const res = await fetch(assetUrl);
      const cacheControl = res.headers.get("cache-control") ?? "";
      if (
        res.ok &&
        res.type === "basic" &&
        !/(no-store|no-cache)/i.test(cacheControl)
      ) {
        await cache.put(assetUrl, res);
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SW_CACHE_VERSION).then((cache) => precacheOfflineShell(cache)),
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
      const fallback = await cache.match(OFFLINE_SHELL_PATH, {
        ignoreSearch: true,
      });
      if (fallback) return fallback;
      return new Response("Offline shell unavailable. Connect to reload.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }),
  );
});

self.addEventListener("push", (event) => {
  let title = "Daisy alert";
  let body = "Open Daisy to review your latest alert.";
  let url = "/notifications";
  let tag = "daisy-alert";

  if (event.data) {
    try {
      const parsed = event.data.json() as {
        title?: unknown;
        body?: unknown;
        url?: unknown;
        tag?: unknown;
      };
      if (typeof parsed.title === "string" && parsed.title.trim()) {
        title = parsed.title.trim();
      }
      if (typeof parsed.body === "string" && parsed.body.trim()) {
        body = parsed.body.trim();
      }
      if (typeof parsed.url === "string" && parsed.url.startsWith("/")) {
        url = parsed.url;
      }
      if (typeof parsed.tag === "string" && parsed.tag.trim()) {
        tag = parsed.tag.trim();
      }
    } catch {
      const text = event.data.text();
      if (text.trim()) {
        body = text.trim();
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/brand/daisy-icon-light.png",
      badge: "/icon.svg",
      tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data as { url?: unknown } | undefined)
    ?.url;
  const targetPath =
    typeof rawUrl === "string" && rawUrl.startsWith("/")
      ? rawUrl
      : "/notifications";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin)) {
            await client.focus();
            if ("navigate" in client && typeof client.navigate === "function") {
              await client.navigate(targetUrl);
            }
            return;
          }
        }
        await self.clients.openWindow(targetUrl);
      }),
  );
});
