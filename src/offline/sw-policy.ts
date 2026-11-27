/**
 * Pure cache & navigation classification policy shared between Daisy's service
 * worker (`public/sw.js` / `src/sw.ts`) and unit tests.
 *
 * Security invariants (Rule 9.2):
 * - Cache ONLY public static assets and the PII-free `/offline` shell.
 * - NEVER cache `/api/*`, authenticated HTML/RSC routes, exports, or `/book` live data.
 */

export const SW_CACHE_VERSION = "daisy-shell-v4";
export const OFFLINE_SHELL_PATH = "/offline";

export const SW_PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icon.svg",
  "/brand/daisy-icon-light.png",
  "/brand/daisy-icon-light.svg",
  "/brand/daisy-lockup-light.svg",
  "/illustrations/sweet-home.svg",
] as const;

export const OFFLINE_NAVIGABLE_PREFIXES = [
  "/",
  "/tenants",
  "/transients",
  "/payments",
  "/maintenance",
  "/rooms",
  "/billing",
  "/notices",
  "/offline",
] as const;

/**
 * Authenticated workspace sections that require an online connection to run.
 * Their HTML/RSC responses are NEVER cached; when a full browser navigation
 * fails offline, the Service Worker serves the PII-free `/offline` shell so
 * Daisy renders an in-app "only available while online" guidance screen with
 * shortcuts to offline modules instead of a browser network-error page.
 */
export const ONLINE_ONLY_WORKSPACE_PREFIXES = [
  "/settings",
  "/audit",
  "/notifications",
] as const;

const NEVER_INTERCEPT_PREFIXES = ["/api/", "/auth/", "/book"] as const;

const STATIC_PUBLIC_PREFIXES = [
  "/_next/static/",
  "/brand/",
  "/illustrations/",
] as const;

const DEV_ENTRY_CHUNK_PATTERN =
  /^\/_next\/static\/chunks\/(?:main-app|webpack|polyfills|app-pages-internals)\.js$/i;
const HASHED_ASSET_SUFFIX = /-[0-9a-f]{8,}\.(?:js|css)$/i;
const OFFLINE_HTML_ASSET_PATTERN =
  /(?:src|href)=["'](\/_next\/static\/[^"'?#\s]+)["']|["'](\/_next\/static\/(?:chunks|css)\/[^"'\\?#\s]+\.(?:js|css))["']/gi;

/**
 * Next.js dev server serves unhashed route chunks and HMR manifests under
 * `/_next/static/` with `no-store`. Keep them network-only so dev edits are
 * never frozen in Cache Storage while hashed production assets remain cacheable.
 */
export function isNextDevStaticAsset(pathname: string): boolean {
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

/**
 * Extracts deduplicated, cache-safe `/_next/static/*` JS/CSS URLs referenced by
 * the PII-free `/offline` HTML shell so the Service Worker can precache every
 * bundle required to hydrate `/offline` on iOS/Android even if the user never
 * visited `/offline` while online.
 */
export function extractOfflineShellAssetUrls(html: string): string[] {
  const assets = new Set<string>();
  OFFLINE_HTML_ASSET_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = null;
  while ((match = OFFLINE_HTML_ASSET_PATTERN.exec(html)) !== null) {
    const candidate = match[1] ?? match[2] ?? "";
    if (!candidate.startsWith("/_next/static/")) continue;
    if (isNextDevStaticAsset(candidate)) continue;
    assets.add(candidate);
  }
  return Array.from(assets);
}

export type SwFetchAction =
  "network-only" | "navigation-offline-fallback" | "cache-first-static";

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      prefix !== "/" &&
      (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

/**
 * Classifies how the Service Worker handles an incoming HTTP request URL.
 */
export function classifySwRequest(input: {
  method: string;
  pathname: string;
  mode?: string;
  hasRscHeader?: boolean;
  sameOrigin: boolean;
}): SwFetchAction {
  if (!input.sameOrigin || input.method !== "GET") {
    return "network-only";
  }

  // Next.js RSC payloads carry dynamic server data and must never hit Cache Storage.
  if (input.hasRscHeader) {
    return "network-only";
  }

  if (
    NEVER_INTERCEPT_PREFIXES.some(
      (prefix) =>
        input.pathname === prefix || input.pathname.startsWith(prefix),
    ) ||
    isNextDevStaticAsset(input.pathname)
  ) {
    return "network-only";
  }

  if (
    STATIC_PUBLIC_PREFIXES.some((prefix) =>
      input.pathname.startsWith(prefix),
    ) ||
    SW_PRECACHE_URLS.includes(
      input.pathname as (typeof SW_PRECACHE_URLS)[number],
    )
  ) {
    // `/offline` is precached as navigation fallback; fetch `/offline` via fallback logic when navigating.
    if (input.mode === "navigate" && input.pathname === OFFLINE_SHELL_PATH) {
      return "navigation-offline-fallback";
    }
    return "cache-first-static";
  }

  if (input.mode === "navigate") {
    const supported =
      input.pathname === "/" ||
      matchesPrefix(input.pathname, OFFLINE_NAVIGABLE_PREFIXES) ||
      matchesPrefix(input.pathname, ONLINE_ONLY_WORKSPACE_PREFIXES);
    return supported ? "navigation-offline-fallback" : "network-only";
  }

  return "network-only";
}
