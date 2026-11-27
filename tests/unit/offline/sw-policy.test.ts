import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifySwRequest,
  extractOfflineShellAssetUrls,
  SW_CACHE_VERSION,
  SW_PRECACHE_URLS,
} from "../../../src/offline/sw-policy";

describe("Service Worker cache policy", () => {
  it("never intercepts API, auth, public booking, non-GET writes, or RSC payloads", () => {
    const networkOnlyPaths = [
      "/api/sync/pull?cursor=abc",
      "/api/payments/proofs/p1/download",
      "/auth/sign-in",
      "/book",
      "/book/11111111-1111-4111-8111-111111111111",
      "/book/11111111-1111-4111-8111-111111111111/request",
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

    for (const pathname of [
      "/tenants",
      "/settings/devices",
      "/audit",
      "/notifications",
    ]) {
      expect(
        classifySwRequest({
          method: "GET",
          pathname,
          hasRscHeader: true,
          sameOrigin: true,
        }),
      ).toBe("network-only");
    }

    expect(
      classifySwRequest({
        method: "POST",
        pathname: "/offline",
        sameOrigin: true,
      }),
    ).toBe("network-only");
  });

  it("falls back workspace navigations (including online-only workspace screens) to the PII-free /offline shell", () => {
    for (const pathname of [
      "/",
      "/tenants",
      "/rooms",
      "/payments/new",
      "/maintenance",
      "/settings/devices",
      "/audit",
      "/notifications",
    ]) {
      expect(
        classifySwRequest({
          method: "GET",
          pathname,
          mode: "navigate",
          sameOrigin: true,
        }),
      ).toBe("navigation-offline-fallback");
    }
  });

  it("extracts hashed /_next/static assets from /offline HTML while skipping dev chunks", () => {
    const sampleHtml = `
      <!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="/_next/static/css/9f1e2d3c4b5a6789.css" />
          <link rel="stylesheet" href="/_next/static/css/app/layout.css" />
          <script src="/_next/static/chunks/webpack-a1b2c3d4e5f60718.js"></script>
          <script src="/_next/static/chunks/main-app.js"></script>
          <script src="/_next/static/chunks/app/offline/page-0123456789abcdef.js"></script>
          <script src="/_next/static/chunks/app/offline/page-0123456789abcdef.js"></script>
          <script src="https://cdn.example.com/_next/static/chunks/external.js"></script>
        </head>
        <body>
          <script>self.__next_f.push([1,"/_next/static/chunks/842-fedcba9876543210.js"])</script>
        </body>
      </html>
    `;

    expect(extractOfflineShellAssetUrls(sampleHtml)).toEqual([
      "/_next/static/css/9f1e2d3c4b5a6789.css",
      "/_next/static/chunks/webpack-a1b2c3d4e5f60718.js",
      "/_next/static/chunks/app/offline/page-0123456789abcdef.js",
      "/_next/static/chunks/842-fedcba9876543210.js",
    ]);
  });

  it("precaches static shell assets, skips dev bundles, and stays aligned with public/sw.js", () => {
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
      "/_next/static/chunks/app/tenants/page.js",
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

    // Verify public/sw.js aligns cache version, precache list, and chunk precacher with sw-policy
    const swSource = readFileSync("public/sw.js", "utf8");
    expect(swSource).toContain(SW_CACHE_VERSION);
    expect(swSource).toContain("extractOfflineShellAssetUrls");
    expect(swSource).toContain("precacheOfflineShell");
    for (const url of SW_PRECACHE_URLS) {
      expect(swSource).toContain(url);
    }
  });
});
