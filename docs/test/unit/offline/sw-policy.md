# Service Worker caching and navigation policy

- Status: PASS
- Last run: 2026-11-23 22:42:33 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm exec vitest run tests/unit/offline/sw-policy.test.ts`
- Result: 4 passed, 0 failed, 0 skipped across 1 file, 242 ms (7 ms test time).
- Target file: [tests/unit/offline/sw-policy.test.ts](../../../../tests/unit/offline/sw-policy.test.ts) -> [src/offline/sw-policy.ts](../../../../src/offline/sw-policy.ts), [src/sw.ts](../../../../src/sw.ts), [public/sw.js](../../../../public/sw.js)

## Verified criteria

- Keeps `/api/*`, `/auth/*`, `/book`, `/book/[roomId]`, `/book/[roomId]/request`, Next.js RSC requests (including on `/settings`, `/audit`, `/reports`, `/notifications`), and non-GET writes strictly `network-only`.
- Routes browser `navigate` requests for both supported offline modules and online-only workspace screens (`/settings/*`, `/audit`, `/reports`, `/notifications`) to `navigation-offline-fallback` (never caching their authenticated HTML/RSC responses; serving the PII-free `/offline` shell only if the network fails offline).
- Extracts deduplicated hashed `/_next/static/*` JS/CSS asset URLs from `/offline` HTML via `extractOfflineShellAssetUrls` while skipping unhashed `next dev` chunks and external origins so `precacheOfflineShell` caches all hydration bundles on install (`daisy-shell-v4`).
- Keeps unhashed `next dev` static chunks/CSS `network-only` while preserving cache-first behavior for hashed production bundles and stays aligned with `public/sw.js`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-23 22:42:33 | `pnpm exec vitest run tests/unit/offline/sw-policy.test.ts` | 4 passed, 0 failed, 0 skipped (1 file) | 242 ms (7 ms tests) |
| 2026-11-22 04:10:05 | `pnpm test:unit tests/unit/server/notifications/web-push.test.ts tests/unit/offline/sw-policy.test.ts` | 2 passed (suite: 183/183 across 47 files) | 6 ms (2.89 s suite) |
| 2026-11-17 00:44:38 | `pnpm test:unit tests/unit/features/notifications/schemas.test.ts tests/unit/offline/sw-policy.test.ts` | 2 passed (suite: 162/162 across 42 files) | 8 ms (3.06 s suite) |
| 2026-11-16 17:14:01 | `pnpm test:unit tests/unit/offline/sw-policy.test.ts` | 2 passed (suite: 146/146 across 39 files) | 8 ms (4.63 s suite) |
| 2026-11-16 14:08:23 | `pnpm test:unit` | 2 passed (suite: 138/138 across 37 files) | 7 ms (2.88 s suite) |
