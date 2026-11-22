# Database client lifecycle

- Status: PASS
- Last run: 2026-11-22 15:54:45 (UTC+8)
- Environment: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm exec vitest run tests/unit/server/db/client.test.ts`
- Result: 6 passed (105 ms), 0 failed, 0 skipped (298 ms total).

## Verified cases

- Calls reuse the same client in Node runtime rather than constructing a pool per call.
- Reuses `globalThis.daisyDatabase` across module reloads even when `PrismaClient` constructor identity differs across split chunks (same generated `Prisma` schema fingerprint).
- Disconnects and replaces `globalThis.daisyDatabase` automatically when the generated `Prisma` schema fingerprint changes across reloads.
- Changing connection configuration disconnects and replaces the prior client.
- Missing configuration fails before connection setup.
- Isolates `PrismaClient` instances per Cloudflare Worker `ExecutionContext` (`WeakMap` keyed by `Symbol.for("__cloudflare-context__").ctx` when `navigator.userAgent === "Cloudflare-Workers"`) while reusing within a single request.
- Prisma and the adapter are mocked; live database connectivity verified separately via `pnpm db:check` (GMT/UTC).

## Run History

| Run (UTC+8) | Result | Duration |
| --- | --- | --- |
| 2026-11-13 10:47:09 | 3 passed | 511 ms (suite) |

### Neon integration reruns (2026-11-13 11:36:53 UTC+8)
- pnpm test:unit: unchanged database tests passed in the 21-test (467 ms), 21-test (435 ms) and 24-test (505 ms) suites. No failures or skips.

### Formatting verification run
- 2026-11-13 13:53:50 (UTC+8): pnpm test:unit passed after Prettier formatting; 25 passed, 0 failed/skipped across 7 files, 618 ms. Existing test criteria unchanged.

### Prisma client generation verification run
- 2026-11-13 15:43:52 (UTC+8) [Windows, Node 24.20.0, pnpm 12.18.0]: pnpm test:unit passed after `pnpm db:generate`; 3 passed here (188 ms), suite 32 passed, 0 failed/skipped across 8 files in 597 ms. Existing test criteria unchanged.

### Owner sign-in UI verification run
- 2026-11-13 16:07:20 (UTC+8): pnpm test:unit passed after Owner sign-in changes; 3 passed here (236 ms), suite 44 passed, 0 failed/skipped across 10 files in 608 ms. Existing test criteria unchanged.

### Taste UI transition verification run
- 2026-11-13 16:20:19 (UTC+8): pnpm test:unit passed after Frost and slate token and typography updates; 3 passed here (215 ms), suite 44 passed, 0 failed/skipped across 10 files in 546 ms. Existing test criteria unchanged.

### UI primitives redesign verification run
- 2026-11-13 16:36:03 (UTC+8): pnpm test:unit passed after `src/components/ui` redesign; 3 passed here (207 ms), suite 44 passed, 0 failed/skipped across 10 files in 604 ms. Existing test criteria unchanged.

### Airbnb brand color token verification run
- 2026-11-13 16:40:30 (UTC+8): pnpm test:unit passed after Airbnb brand token updates; 3 passed here (213 ms), suite 44 passed, 0 failed/skipped across 10 files in 562 ms. Existing test criteria unchanged.

### Badge dot removal verification run
- 2026-11-13 16:43:20 (UTC+8): pnpm test:unit passed after removing `Badge` dots; 3 passed here (190 ms), suite 44 passed, 0 failed/skipped across 10 files in 491 ms. Existing test criteria unchanged.

### Workspace shell and auth redesign verification run
- 2026-11-13 16:50:09 (UTC+8): pnpm test:unit passed after creating Sidebar/Topbar/EmptyState primitives, empty Dashboard, and redesigned Auth pages; 3 passed here (176 ms), suite 44 passed, 0 failed/skipped across 10 files in 484 ms. Existing test criteria unchanged.

### Sign-out JSON payload fix verification run
- 2026-11-13 16:55:34 (UTC+8): pnpm test:unit passed after normalizing POST `/api/auth/sign-out` to `Content-Type: application/json` `{}`; 3 passed here (201 ms), suite 44 passed, 0 failed/skipped across 10 files in 509 ms. Existing test criteria unchanged.


### Development HMR schema-tag invalidation verification run
- 2026-11-13 22:15:45 (UTC+8): pnpm test:unit passed after adding `PRISMA_CLIENT_SCHEMA_TAG` check in `src/server/db/client.ts`; 3 passed here (285 ms), suite 66 passed across 17 files in 996 ms. Existing test criteria unchanged.

### Cross-chunk pool reuse and disconnect-guard verification run
- 2026-11-16 02:56:56 (UTC+8): `pnpm test:unit tests/unit/server/db/client.test.ts` passed after updating `src/server/db/client.ts` to prefer `globalThis.daisyDatabase` in non-production, accept structurally valid clients across Webpack chunks, and guard against reusing disconnected entries; 4 passed here (301 ms), suite 118 passed across 29 files in 1.67 s. `pnpm db:check` also passed (`connected: true`, `timezone: "GMT"`).

### Cloudflare Worker request isolation verification run
- 2026-11-16 23:52:29 (UTC+8): `pnpm test:unit tests/unit/server/db/client.test.ts tests/unit/server/jobs/cloudflare-cron.test.ts` passed after adding `WeakMap<ExecutionContext, CachedDatabase>` isolation when `navigator.userAgent === "Cloudflare-Workers"`; 5 passed here (445 ms), suite 159 passed across 41 files in 2.93 s. `pnpm cf:build` and `wrangler deploy --dry-run` also passed.

### Automatic schema fingerprint & transaction timeout verification runs
- 2026-11-22 15:54:00 (UTC+8) — **FAIL (5 failed):** `pnpm test:unit tests/unit/server/db/client.test.ts` failed because the Vitest mock for `src/generated/prisma/client` omitted the `Prisma` export read by `computeGeneratedSchemaFingerprint()`. Fix: exported mock `Prisma` (`ModelName` + `OwnerScalarFieldEnum`) in `tests/unit/server/db/client.test.ts` and added a schema-change invalidation test.
- 2026-11-22 15:54:45 (UTC+8) — **PASS (6 passed, 105 ms):** `pnpm exec vitest run tests/unit/server/db/client.test.ts` passed after updating the mock and adding automatic schema-change invalidation coverage.
