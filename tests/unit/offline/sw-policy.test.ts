import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifySwRequest,
  SW_CACHE_VERSION,
  SW_PRECACHE_URLS,
} from "../../../src/offline/sw-policy";

describe("Service Worker cache policy", () => {
  it("never caches API, auth, public booking, settings, audit, reports, or RSC payloads", () => {
    const networkOnlyPaths = [
      "/api/sync/pull?cursor=abc",
      "/api/payments/proofs/p1/download",
      "/api/reports/export?reportType=occupancy",
      "/auth/sign-in",
      "/book",
      "/settings/devices",
      "/audit",
      "/reports",
    ];

    for (const pathname of networkOnlyPaths) {
      expect(
        classifySwRequest({
          method: "GET",
          pathname,
          mode: "navigate",
          sameOrigin: true,
        }),
      ).toBe("network-only");
    }

    expect(
      classifySwRequest({
        method: "GET",
        pathname: "/tenants",
        hasRscHeader: true,
        sameOrigin: true,
      }),
    ).toBe("network-only");

    expect(
      classifySwRequest({
        method: "POST",
        pathname: "/offline",
        sameOrigin: true,
      }),
    ).toBe("network-only");
  });

  it("precaches static shell assets and provides /offline fallback for supported workspace routes", () => {
    expect(
      classifySwRequest({
        method: "GET",
        pathname: "/_next/static/chunks/app.js",
        sameOrigin: true,
      }),
    ).toBe("cache-first-static");

    expect(
      classifySwRequest({
        method: "GET",
        pathname: "/_next/static/chunks/app/page-88fb1f541e73a0a3.js",
        sameOrigin: true,
      }),
    ).toBe("cache-first-static");

    const devPaths = [
      "/_next/static/chunks/app/reports/page.js",
      "/_next/static/chunks/app/page.js",
      "/_next/static/chunks/main-app.js",
      "/_next/static/chunks/_app-pages-browser_node_modules_apexcharts.js",
      "/_next/static/css/app/layout.css",
      "/_next/static/webpack/abc.hot-update.js",
      "/_next/static/development/_buildManifest.js",
    ];
    for (const devPath of devPaths) {
      expect(
        classifySwRequest({
          method: "GET",
          pathname: devPath,
          sameOrigin: true,
        }),
      ).toBe("network-only");
    }

    expect(
      classifySwRequest({
        method: "GET",
        pathname: "/tenants",
        mode: "navigate",
        sameOrigin: true,
      }),
    ).toBe("navigation-offline-fallback");

    // Verify public/sw.js aligns cache version and precache list with sw-policy
    const swSource = readFileSync("public/sw.js", "utf8");
    expect(swSource).toContain(SW_CACHE_VERSION);
    for (const url of SW_PRECACHE_URLS) {
      expect(swSource).toContain(url);
    }
  });
});
