# Tenants, assignments & sync contract validation schemas

- Status: PASS
- Last run: 2026-11-13 22:01:22 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 4 passed here (19 ms); suite 66 passed, 0 failed, 0 skipped across 17 files, 982 ms.
- Target file: [tests/unit/features/tenants/schemas.test.ts](tests/unit/features/tenants/schemas.test.ts) -> [src/features/tenants/schemas.ts](src/features/tenants/schemas.ts), [src/features/tenants/sync-contracts.ts](src/features/tenants/sync-contracts.ts)

## Verified criteria

- Validates optional client-generated UUIDs and optional tenant contact fields while normalizing blank optional strings to `null`.
- Enforces `endDateManila > startDateManila` and two-decimal peso normalization on `CreateTenantAssignmentSchema`.
- Distinguishes move-out `complete` (requires valid `actualMoveOutDateManila`) from pre-start `cancel`.
- Canonicalizes JSON payloads deterministically independent of object key order and validates `TenantSyncOperationSchema` envelopes.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 22:01:22 | pnpm test:unit | 4 passed (suite: 66/66 across 17 files) | 19 ms (982 ms suite) |

