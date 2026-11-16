# GET /api/audit dynamic filtering

- Status: PASS for backend and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration`
- Result: 2 passed here (1.14 s); suite 64 passed, 0 failed, 0 skipped across 17 files, 509.94 s.
- Target: explicitly opted-in expiring schema-only branch `test-integration` via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Target file: [tests/integration/audit/audit-route.test.ts](tests/integration/audit/audit-route.test.ts) -> [src/app/api/audit/route.ts](src/app/api/audit/route.ts)

## Verified criteria

- Fails closed for unauthenticated callers (`401`) and rejects impossible Manila calendar dates (`400`, e.g., `2026-02-29`).
- Filters PostgreSQL `AuditLog` rows by `area` and multi-field `query` (`action`, `entityType`, `entityId`, `actorType`), sets `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`, and creates zero additional `AuditLog` entries on read.

## Fixture cleanup

Teardown deleted all UUID-prefixed `AuditLog` and `Owner` fixtures and asserted zero remaining `AuditLog` and `Owner` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 18:43:12 | pnpm test:integration | 2 passed (suite: 25/25 across 4 files) | 655 ms (30.11 s suite) |
| 2026-11-13 22:04:52 | pnpm test:integration | 2 passed (suite: 30/30 across 7 files) | 623 ms (81.07 s suite) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 2 passed (suite: 64/64 across 17 files) | 1.14 s (509.94 s suite) |

