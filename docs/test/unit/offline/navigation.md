# Offline in-memory navigation

- Status: PASS
- Last run: 2026-11-23 23:45:37 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm exec vitest run tests/unit/offline/navigation.test.ts`
- Result: 6 passed, 0 failed, 0 skipped across 1 file, 267 ms (8 ms test time).
- Target file: [tests/unit/offline/navigation.test.ts](../../../../tests/unit/offline/navigation.test.ts) -> [src/offline/navigation.ts](../../../../src/offline/navigation.ts), [src/components/features/offline/offline-route-fallback.tsx](../../../../src/components/features/offline/offline-route-fallback.tsx), [src/components/layout/workspace-shell.tsx](../../../../src/components/layout/workspace-shell.tsx), [src/components/features/payments/payment-create-form.tsx](../../../../src/components/features/payments/payment-create-form.tsx), [src/components/features/maintenance/maintenance-create-form.tsx](../../../../src/components/features/maintenance/maintenance-create-form.tsx)

## Verified criteria

- Intercepts same-origin workspace and offline route links (`/tenants`, `/payments/new?tenantId=abc`, `/offline`, `/reports`, `target="_self"`) cleanly into normalized in-memory URLs.
- Refuses to intercept excluded API, auth, and public booking paths (`/api/*`, `/auth/*`, `/book*`), cross-origin URLs, non-HTTP schemes (`mailto:`, `tel:`, `javascript:`), and same-page anchor jumps (`#main-content`, `/tenants#top`).
- Refuses to intercept already-prevented clicks, non-primary mouse buttons, modifier-key clicks (Ctrl/Meta/Shift/Alt), `target="_blank"`, and `download` links.
- Updates `window.history.pushState`, scrolls to top on pathname change, and notifies `subscribeOfflineLocation` listeners on both `daisy:offline-navigate` and browser `popstate`.
- Intercepts clicks in the capture phase while `!navigator.onLine` (setting `defaultPrevented` so Next.js `<Link>` skips failed RSC fetches and hard reloads) and stops intercepting as soon as `navigator.onLine` returns to `true`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-23 23:45:37 | `pnpm exec vitest run tests/unit/offline/navigation.test.ts` | 6 passed, 0 failed, 0 skipped (1 file) | 267 ms (8 ms tests) |

