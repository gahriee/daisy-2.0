// Executable Service Worker matching src/sw.ts & src/offline/sw-policy.ts.
// Precaches strictly the PII-free public /offline shell and static shell assets.

const SW_CACHE_VERSION = "daisy-shell-v3";
const OFFLINE_SHELL_PATH = "/offline";
const SW_PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icon.svg",
  "/brand/daisy-icon-light.png",
  "/brand/daisy-icon-light.svg",
  "/brand/daisy-lockup-light.svg",
  "/illustrations/sweet-home.svg",
];

const OFFLINE_NAVIGABLE_PREFIXES = [
  "/",
  "/tenants",
  "/transients",
  "/payments",
  "/maintenance",
  "/rooms",
  "/billing",
  "/notices",
  "/offline",
];

const NEVER_CACHE_PREFIXES = [
  "/api/",
  "/auth/",
  "/book",
  "/settings",
  "/audit",
  "/reports",
  "/notifications",
];

const STATIC_PUBLIC_PREFIXES = [
  "/_next/static/",
  "/brand/",
  "/illustrations/",
];

const DEV_ENTRY_CHUNK_PATTERN =
  /^\/_next\/static\/chunks\/(?:main-app|webpack|polyfills|app-pages-internals)\.js$/i;
const HASHED_ASSET_SUFFIX = /-[0-9a-f]{8,}\.(?:js|css)$/i;

function isNextDevStaticAsset(pathname) {
  if (
    pathname.startsWith("/_next/static/webpack/") ||
    pathname.startsWith("/_next/static/development/") ||
    pathname.startsWith("/_next/static/chunks/_app-pages-browser_")
  ) {
    return true;
  }
  if (DEV_ENTRY_CHUNK_PATTERN.test(pathname)) {
    return true;
  }
  if (
    pathname.startsWith("/_next/static/chunks/app/") &&
    !HASHED_ASSET_SUFFIX.test(pathname)
  ) {
    return true;
  }
  if (
    pathname.startsWith("/_next/static/css/app/") &&
    !HASHED_ASSET_SUFFIX.test(pathname)
  ) {
    return true;
  }
  return false;
}

function classifyRequest(request, url) {
  if (url.origin !== self.location.origin || request.method !== "GET") {
    return "network-only";
  }
  if (request.headers.has("rsc")) {
    return "network-only";
  }
  if (
    NEVER_CACHE_PREFIXES.some(
      (prefix) => url.pathname === prefix || url.pathname.startsWith(prefix),
    ) ||
    isNextDevStaticAsset(url.pathname)
  ) {
    return "network-only";
  }
  if (
    STATIC_PUBLIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
    SW_PRECACHE_URLS.includes(url.pathname)
  ) {
    if (request.mode === "navigate" && url.pathname === OFFLINE_SHELL_PATH) {
      return "navigation-offline-fallback";
    }
    return "cache-first-static";
  }
  if (request.mode === "navigate") {
    const supported =
      url.pathname === "/" ||
      OFFLINE_NAVIGABLE_PREFIXES.some(
        (prefix) =>
          prefix !== "/" &&
          (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)),
      );
    return supported ? "navigation-offline-fallback" : "network-only";
  }
  return "network-only";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SW_CACHE_VERSION).then(async (cache) => {
      await cache.addAll(SW_PRECACHE_URLS);
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
    event.data.type === "DAISY_SKIP_WAITING"
  ) {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const action = classifyRequest(request, url);

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

self.addEventListener("push", (event) => {
  let title = "Daisy alert";
  let body = "Open Daisy to review your latest alert.";
  let url = "/notifications";
  let tag = "daisy-alert";

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed.title === "string" && parsed.title.trim()) {
        title = parsed.title.trim();
      }
      if (parsed && typeof parsed.body === "string" && parsed.body.trim()) {
        body = parsed.body.trim();
      }
      if (parsed && typeof parsed.url === "string" && parsed.url.startsWith("/")) {
        url = parsed.url;
      }
      if (parsed && typeof parsed.tag === "string" && parsed.tag.trim()) {
        tag = parsed.tag.trim();
      }
    } catch {
      const text = event.data.text();
      if (text && text.trim()) {
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
  const rawUrl =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/notifications";
  const targetPath = rawUrl.startsWith("/") ? rawUrl : "/notifications";
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

