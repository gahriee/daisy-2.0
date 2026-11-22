# Service Worker caching and navigation policy

- Status: PASS
- Last run: 2026-11-22 04:10:05 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/server/notifications/web-push.test.ts tests/unit/offline/sw-policy.test.ts` (note: Vitest configuration ran all `tests/unit` + targeted files)
- Result: 2 passed here (6 ms); suite 183 passed, 0 failed, 0 skipped across 47 files, 2.89 s.
- Target file: [tests/unit/offline/sw-policy.test.ts](../../../../tests/unit/offline/sw-policy.test.ts) -> [src/offline/sw-policy.ts](../../../../src/offline/sw-policy.ts), [src/sw.ts](../../../../src/sw.ts), [public/sw.js](../../../../public/sw.js)

## Verified criteria

- Keeps `/api/*`, `/auth/*`, `/book`, `/book/[roomId]`, `/book/[roomId]/request`, `/settings`, `/audit`, `/reports`, `/notifications`, Next.js RSC requests, and non-GET writes strictly `network-only`.
- Keeps unhashed `next dev` static chunks/CSS (`/webpack/`, `/development/`, entry bundles, `_app-pages-browser_*`, unhashed `/chunks/app/*` & `/css/app/*`) `network-only` while preserving cache-first behavior for hashed production bundles (`daisy-shell-v3`).
- Serves static shell assets cache-first (skipping `no-store`/`no-cache` responses in runtime cache writes) and falls back supported workspace navigations offline to the PII-free `/offline` shell matching `public/sw.js`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-22 04:10:05 | `pnpm test:unit tests/unit/server/notifications/web-push.test.ts tests/unit/offline/sw-policy.test.ts` | 2 passed (suite: 183/183 across 47 files) | 6 ms (2.89 s suite) |
| 2026-11-17 00:44:38 | `pnpm test:unit tests/unit/features/notifications/schemas.test.ts tests/unit/offline/sw-policy.test.ts` | 2 passed (suite: 162/162 across 42 files) | 8 ms (3.06 s suite) |
| 2026-11-16 17:14:01 | `pnpm test:unit tests/unit/offline/sw-policy.test.ts` | 2 passed (suite: 146/146 across 39 files) | 8 ms (4.63 s suite) |
| 2026-11-16 14:08:23 | `pnpm test:unit` | 2 passed (suite: 138/138 across 37 files) | 7 ms (2.88 s suite) |
