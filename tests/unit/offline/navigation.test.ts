import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachOfflineShellLinkInterceptor,
  DAISY_OFFLINE_NAVIGATE_EVENT,
  getOfflinePathname,
  navigateOfflineInMemory,
  resolveOfflineClientNavigation,
  subscribeOfflineLocation,
} from "@/offline/navigation";

describe("resolveOfflineClientNavigation", () => {
  const origin = "https://daisy.example.com";

  it("intercepts same-origin workspace and offline routes", () => {
    expect(
      resolveOfflineClientNavigation({
        href: "/tenants",
        currentOrigin: origin,
        currentPathname: "/",
      }),
    ).toEqual({
      intercept: true,
      url: "/tenants",
      pathname: "/tenants",
    });

    expect(
      resolveOfflineClientNavigation({
        href: "/payments/new?tenantId=abc",
        currentOrigin: origin,
        currentPathname: "/payments",
      }),
    ).toEqual({
      intercept: true,
      url: "/payments/new?tenantId=abc",
      pathname: "/payments/new",
    });

    expect(
      resolveOfflineClientNavigation({
        href: "/offline",
        currentOrigin: origin,
        currentPathname: "/maintenance/req-1",
      }),
    ).toEqual({
      intercept: true,
      url: "/offline",
      pathname: "/offline",
    });

    expect(
      resolveOfflineClientNavigation({
        href: "/audit",
        currentOrigin: origin,
        currentPathname: "/tenants",
      }),
    ).toEqual({
      intercept: true,
      url: "/audit",
      pathname: "/audit",
    });
  });

  it("does not intercept excluded API, auth, or public booking routes", () => {
    for (const href of [
      "/api/sync/pull",
      "/api",
      "/auth/sign-in",
      "/auth",
      "/book",
      "/book/room-1",
    ]) {
      expect(
        resolveOfflineClientNavigation({
          href,
          currentOrigin: origin,
          currentPathname: "/tenants",
        }),
      ).toEqual({ intercept: false });
    }
  });

  it("does not intercept external origins, non-http schemes, or same-page anchors", () => {
    for (const href of [
      "https://other.example.com/tenants",
      "mailto:owner@example.com",
      "tel:+639171234567",
      "javascript:void(0)",
      "#main-content",
      "/tenants#top",
      "",
    ]) {
      expect(
        resolveOfflineClientNavigation({
          href,
          currentOrigin: origin,
          currentPathname: "/tenants",
        }),
      ).toEqual({ intercept: false });
    }
  });

  it("does not intercept modified clicks, non-primary buttons, new-tab targets, downloads, or prevented events", () => {
    const base = {
      href: "/payments",
      currentOrigin: origin,
      currentPathname: "/tenants",
    };

    expect(
      resolveOfflineClientNavigation({ ...base, isDefaultPrevented: true }),
    ).toEqual({ intercept: false });
    expect(resolveOfflineClientNavigation({ ...base, button: 1 })).toEqual({
      intercept: false,
    });
    expect(resolveOfflineClientNavigation({ ...base, ctrlKey: true })).toEqual({
      intercept: false,
    });
    expect(resolveOfflineClientNavigation({ ...base, metaKey: true })).toEqual({
      intercept: false,
    });
    expect(resolveOfflineClientNavigation({ ...base, shiftKey: true })).toEqual(
      { intercept: false },
    );
    expect(resolveOfflineClientNavigation({ ...base, altKey: true })).toEqual({
      intercept: false,
    });
    expect(
      resolveOfflineClientNavigation({ ...base, targetAttr: "_blank" }),
    ).toEqual({ intercept: false });
    expect(
      resolveOfflineClientNavigation({ ...base, hasDownloadAttr: true }),
    ).toEqual({ intercept: false });

    expect(
      resolveOfflineClientNavigation({ ...base, targetAttr: "_self" }),
    ).toEqual({
      intercept: true,
      url: "/payments",
      pathname: "/payments",
    });
  });
});

describe("in-memory offline navigation runtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function installMockBrowser(initialPath = "/tenants", online = false) {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    let currentUrl = new URL(initialPath, "https://daisy.example.com");

    const pushState = vi.fn((_state: unknown, _title: string, url?: string) => {
      if (url) {
        currentUrl = new URL(url, currentUrl.origin);
      }
    });
    const scrollTo = vi.fn();

    const mockWindow = {
      location: {
        get origin() {
          return currentUrl.origin;
        },
        get pathname() {
          return currentUrl.pathname;
        },
        get search() {
          return currentUrl.search;
        },
        get hash() {
          return currentUrl.hash;
        },
      },
      history: { pushState },
      scrollTo,
      addEventListener: windowTarget.addEventListener.bind(windowTarget),
      removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
      dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget),
    };

    let onlineFlag = online;
    const mockNavigator = {
      get onLine() {
        return onlineFlag;
      },
      set onLine(value: boolean) {
        onlineFlag = value;
      },
    };

    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("navigator", mockNavigator);

    return {
      mockWindow,
      documentTarget,
      mockNavigator,
      pushState,
      scrollTo,
    };
  }

  it("pushes history state, scrolls to top, and notifies subscribers on in-memory navigation", () => {
    const { mockWindow, pushState, scrollTo } = installMockBrowser(
      "/tenants",
      false,
    );

    const listener = vi.fn();
    const unsubscribe = subscribeOfflineLocation(listener);

    expect(getOfflinePathname()).toBe("/tenants");
    expect(navigateOfflineInMemory("/payments")).toBe(true);
    expect(pushState).toHaveBeenCalledWith(null, "", "/payments");
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    expect(getOfflinePathname()).toBe("/payments");
    expect(listener).toHaveBeenCalledTimes(1);

    mockWindow.dispatchEvent(new Event("popstate"));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    mockWindow.dispatchEvent(new Event(DAISY_OFFLINE_NAVIGATE_EVENT));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("intercepts clicks while offline without preventing online navigation", () => {
    const { documentTarget, mockNavigator, pushState } = installMockBrowser(
      "/tenants",
      false,
    );
    const detach = attachOfflineShellLinkInterceptor();

    const makeAnchor = (
      href: string,
      extraAttrs: Record<string, string> = {},
    ) => {
      const anchor = {
        getAttribute: (name: string) =>
          name === "href" ? href : (extraAttrs[name] ?? null),
        hasAttribute: (name: string) => name in extraAttrs,
        closest: (selector: string) => (selector === "a[href]" ? anchor : null),
      };
      return anchor;
    };

    const offlineClick = new Event("click", {
      cancelable: true,
      bubbles: true,
    }) as MouseEvent;
    Object.defineProperty(offlineClick, "target", {
      value: makeAnchor("/rooms"),
    });
    Object.defineProperty(offlineClick, "button", { value: 0 });
    documentTarget.dispatchEvent(offlineClick);

    expect(offlineClick.defaultPrevented).toBe(true);
    expect(pushState).toHaveBeenCalledWith(null, "", "/rooms");
    expect(getOfflinePathname()).toBe("/rooms");

    // Once online again, clicks are not intercepted so normal Next.js navigation resumes.
    mockNavigator.onLine = true;
    const onlineClick = new Event("click", {
      cancelable: true,
      bubbles: true,
    }) as MouseEvent;
    Object.defineProperty(onlineClick, "target", {
      value: makeAnchor("/billing"),
    });
    Object.defineProperty(onlineClick, "button", { value: 0 });
    documentTarget.dispatchEvent(onlineClick);

    expect(onlineClick.defaultPrevented).toBe(false);
    expect(pushState).toHaveBeenCalledTimes(1);

    detach();
  });
});
