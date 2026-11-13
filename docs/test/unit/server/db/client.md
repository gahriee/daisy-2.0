# Database client lifecycle

- Status: PASS
- Last run: 2026-11-13 22:15:45 (UTC+8)
- Environment: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 3 passed (285 ms), 0 failed, 0 skipped; full suite 66 passed across 17 files in 996 ms.

## Verified cases

- Calls reuse the same client rather than constructing a pool per call.
- Changing connection configuration disconnects and replaces the prior client.
- Missing configuration fails before connection setup.
- Prisma and the adapter are mocked; these tests do not prove a live connection.

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
