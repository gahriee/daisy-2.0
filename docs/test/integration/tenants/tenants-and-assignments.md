# Tenants CRUD/sync & online-only TenantAssignment

- Status: PASS for backend and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-13 22:52:06 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: pnpm test:integration
- Result: 2 passed here (23.38 s); suite 31 passed, 0 failed, 0 skipped across 7 files, 80.17 s.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261113150000_room_types_with_pricing` applied to `test-integration` and `dev`; `production` untouched.
- Target file: [tests/integration/tenants/tenants-and-assignments.test.ts](tests/integration/tenants/tenants-and-assignments.test.ts) -> [src/features/tenants/service.ts](src/features/tenants/service.ts), [src/features/tenants/sync-handler.ts](src/features/tenants/sync-handler.ts), [src/app/api/tenants/route.ts](src/app/api/tenants/route.ts)

## Verified criteria

- `GET /api/tenants` fails closed (`401`) when unauthenticated; client-generated tenant UUIDs persist with `version: 1`, increment on updates, tombstone on archive, and republish on restore.
- Online-only `assignTenantToBed` creates linked `Allocation` + `TenantAssignment` and transitions `Bed.status` (`AVAILABLE -> OCCUPIED`) atomically, enforces at most one `ACTIVE` assignment per tenant (`ConflictError`), blocks tenant archival while assigned, and projects ending-soon Owner notifications (`assignment:ending:...` -> `/tenants/<tenantId>`).
- `moveOutTenantAssignment` supports both stay completion (truncating `Allocation`, setting `actualMoveOutDate`, restoring `Bed` to `AVAILABLE`) and pre-start cancellation (`CANCELLED`).
- `AuditLog` entries for `tenants` omit tenant PII (name, phone, email).
- `applyTenantSyncOperation` enforces device token + row-share lock (`ForbiddenError` on revoked device), `opId` replay idempotency (`duplicate` vs `ConflictError` on payload mismatch), stale `baseVersion` conflict outcomes (`conflict`), and predecessor failure chaining (`blocked`).

## Fixture cleanup

Teardown deleted all UUID-prefixed `NotificationRead`, `SecurityEvent`, `AuditLog`, `ChangeFeed`, `SyncOperationOutcome`, `SyncHead`, `Device`, `TenantAssignment`, `Allocation`, `Tenant`, `Bed`, `Room`, `RoomType`, and `Owner` fixtures and asserted zero remaining `Tenant`, `TenantAssignment`, and `Owner` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 22:04:52 | pnpm test:integration | 2 passed (suite: 30/30 across 7 files) | 27.18 s (81.07 s suite) |
| 2026-11-13 22:39:25 | pnpm test:integration | 2 passed (suite: 30/30 across 7 files) | 28.56 s (86.49 s suite) |
| 2026-11-13 22:52:06 | pnpm test:integration | 2 passed (suite: 31/31 across 7 files) | 23.38 s (80.17 s suite) |

