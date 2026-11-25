/**
 * Client-side in-memory navigation helpers for Daisy's precached `/offline`
 * shell. Keeps the unlocked AES-GCM key inside `VaultKeyCustody` across
 * offline page switches by updating `window.history` in place instead of
 * letting failed Next.js RSC fetches trigger full-document reloads.
 */

export const DAISY_OFFLINE_NAVIGATE_EVENT = "daisy:offline-navigate";

const EXCLUDED_OFFLINE_PREFIXES = ["/api", "/auth", "/book"] as const;

export type OfflineNavigationCheckInput = {
  href: string | null | undefined;
  currentOrigin: string;
  currentPathname: string;
  currentSearch?: string;
  targetAttr?: string | null;
  hasDownloadAttr?: boolean;
  isDefaultPrevented?: boolean;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

export type OfflineNavigationDecision =
  { intercept: false } | { intercept: true; url: string; pathname: string };

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_OFFLINE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Pure decision function determining whether an anchor click or programmatic
 * navigation can be handled in-memory by the offline shell without reloading.
 */
export function resolveOfflineClientNavigation(
  input: OfflineNavigationCheckInput,
): OfflineNavigationDecision {
  if (input.isDefaultPrevented) {
    return { intercept: false };
  }
  if (input.button !== undefined && input.button !== 0) {
    return { intercept: false };
  }
  if (input.metaKey || input.ctrlKey || input.shiftKey || input.altKey) {
    return { intercept: false };
  }
  if (input.hasDownloadAttr) {
    return { intercept: false };
  }
  const normalizedTarget = input.targetAttr?.trim().toLowerCase() ?? "";
  if (normalizedTarget && normalizedTarget !== "_self") {
    return { intercept: false };
  }

  const rawHref = input.href?.trim() ?? "";
  if (!rawHref || rawHref.startsWith("#")) {
    return { intercept: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(
      rawHref,
      `${input.currentOrigin}${input.currentPathname}${input.currentSearch ?? ""}`,
    );
  } catch {
    return { intercept: false };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { intercept: false };
  }
  if (parsed.origin !== input.currentOrigin) {
    return { intercept: false };
  }
  if (isExcludedPath(parsed.pathname)) {
    return { intercept: false };
  }

  // Keep same-document hash jumps (e.g. "Skip to content") on native behavior.
  if (
    parsed.pathname === input.currentPathname &&
    parsed.search === (input.currentSearch ?? "") &&
    parsed.hash !== ""
  ) {
    return { intercept: false };
  }

  return {
    intercept: true,
    url: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    pathname: parsed.pathname,
  };
}

export function getOfflinePathname(fallback = "/offline"): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  return window.location.pathname || fallback;
}

export function subscribeOfflineLocation(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("popstate", callback);
  window.addEventListener(DAISY_OFFLINE_NAVIGATE_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(DAISY_OFFLINE_NAVIGATE_EVENT, callback);
  };
}

/**
 * Transitions the active URL inside the offline shell without reloading the
 * page or clearing the in-memory `VaultKeyCustody` key.
 */
export function navigateOfflineInMemory(href: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const decision = resolveOfflineClientNavigation({
    href,
    currentOrigin: window.location.origin,
    currentPathname: window.location.pathname || "/",
    currentSearch: window.location.search,
  });

  if (!decision.intercept) {
    return false;
  }

  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const pathnameChanged = decision.pathname !== window.location.pathname;

  if (decision.url !== currentUrl) {
    window.history.pushState(null, "", decision.url);
  }
  if (pathnameChanged && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  window.dispatchEvent(new Event(DAISY_OFFLINE_NAVIGATE_EVENT));
  return true;
}

/**
 * Intercepts same-origin anchor clicks in the capture phase while offline so
 * Next.js `<Link>` sees `event.defaultPrevented === true` (skipping failed RSC
 * fetches and hard-reload fallbacks) while React `onClick` handlers such as
 * mobile drawer dismissal still execute normally.
 */
export function attachOfflineShellLinkInterceptor(options?: {
  shouldIntercept?: () => boolean;
}): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return () => {};
  }

  const shouldIntercept =
    options?.shouldIntercept ??
    (() => typeof navigator !== "undefined" && !navigator.onLine);

  function handleDocumentClick(event: MouseEvent) {
    if (!shouldIntercept()) {
      return;
    }

    const target = event.target;
    if (!target || typeof (target as Element).closest !== "function") {
      return;
    }

    const anchor = (target as Element).closest("a[href]");
    if (!anchor) {
      return;
    }

    const decision = resolveOfflineClientNavigation({
      href: anchor.getAttribute("href"),
      currentOrigin: window.location.origin,
      currentPathname: window.location.pathname || "/",
      currentSearch: window.location.search,
      targetAttr: anchor.getAttribute("target"),
      hasDownloadAttr: anchor.hasAttribute("download"),
      isDefaultPrevented: event.defaultPrevented,
      button: event.button,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    });

    if (!decision.intercept) {
      return;
    }

    event.preventDefault();
    navigateOfflineInMemory(decision.url);
  }

  document.addEventListener("click", handleDocumentClick, true);
  return () => {
    document.removeEventListener("click", handleDocumentClick, true);
  };
}
