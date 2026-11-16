# Tenants CRUD/sync & online-only TenantAssignment

- Status: PASS for backend and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration`
- Result: 3 passed here (`42.33 s`); suite 64 passed, 0 failed, 0 skipped across 17 files, `509.94 s`.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261114150000_building_separation_and_tenant_contracts` applied to `test-integration` and `dev`; `production` remains at `20261113060000_recovery_security`.
- Target file: [tests/integration/tenants/tenants-and-assignments.test.ts](../../../../tests/integration/tenants/tenants-and-assignments.test.ts) -> [src/features/tenants/service.ts](../../../../src/features/tenants/service.ts), [src/features/tenants/sync-handler.ts](../../../../src/features/tenants/sync-handler.ts), [src/app/api/tenants/route.ts](../../../../src/app/api/tenants/route.ts)

## Verified criteria

- `GET /api/tenants` fails closed (`401`) when unauthenticated; client-generated tenant UUIDs persist with `version: 1`, increment on updates, tombstone on archive, and republish on restore.
- Separate `TenantNote` records (`createTenantNote` / `deleteTenantNote`) list newest-first in `listTenantsOverview` and `getTenantDetail`, isolate across Owners (`NotFoundError`), block mutations while archived (`ConflictError`), preserve legacy `Tenant.notes` when omitted on profile update, write identifier-only `AuditLog` entries (`tenant_note.created` / `tenant_note.deleted` without note content), and publish `ChangeFeed` `upsert`/`tombstone` entries under `SyncHead` lock.
- Online-only `assignTenantToBed` excludes `TRANSIENT` beds from `assignableBeds`, rejects `TRANSIENT` beds (`PreconditionError`), creates linked `Allocation` + `TenantAssignment`, and transitions `Bed.status` (`AVAILABLE -> OCCUPIED`) atomically, enforces at most one `ACTIVE` assignment per tenant (`ConflictError`), blocks tenant archival while assigned, and projects ending-soon Owner notifications (`assignment:ending:...` -> `/tenants/<tenantId>`).
- `moveOutTenantAssignment` supports both stay completion (truncating `Allocation`, setting `actualMoveOutDate`, restoring `Bed` to `AVAILABLE`) and pre-start cancellation (`CANCELLED`).
- `AuditLog` entries for `tenants` omit tenant PII (name, phone, email) and note content.
- `applyTenantSyncOperation` enforces device token + row-share lock (`ForbiddenError` on revoked device), `opId` replay idempotency (`duplicate` vs `ConflictError` on payload mismatch), stale `baseVersion` conflict outcomes (`conflict`), and predecessor failure chaining (`blocked`).

## Fixture cleanup

Teardown deleted all UUID-prefixed `NotificationRead`, `SecurityEvent`, `AuditLog`, `ChangeFeed`, `SyncOperationOutcome`, `SyncHead`, `Device`, `TenantAssignment`, `Allocation`, `TenantNote`, `Tenant`, `Bed`, `Room`, `RoomType`, and `Owner` fixtures and asserted zero remaining `TenantNote`, `Tenant`, `TenantAssignment`, and `Owner` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 22:04:52 | pnpm test:integration | 2 passed (suite: 30/30 across 7 files) | 27.18 s (81.07 s suite) |
| 2026-11-13 22:39:25 | pnpm test:integration | 2 passed (suite: 30/30 across 7 files) | 28.56 s (86.49 s suite) |
| 2026-11-13 22:52:06 | pnpm test:integration | 2 passed (suite: 31/31 across 7 files) | 23.38 s (80.17 s suite) |
| 2026-11-13 23:06:24 | pnpm vitest run --config vitest.integration.config.mts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/tenants/tenants-and-assignments.test.ts | 2 passed (targeted: 7/7 across 2 files) | 26.81 s (68.25 s targeted) |
| 2026-11-13 23:43:51 | pnpm test:integration tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/tenants/tenants-and-assignments.test.ts | 2 passed here | 32.94 s |
| 2026-11-14 04:11:35 | pnpm test:integration tests/integration/rooms/inventory-and-archival.test.ts tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/settings/settings-and-devices.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 2 passed (targeted 20/20 across 6 files) | 26.32 s (263.82 s targeted) |
| 2026-11-14 11:23:32 | pnpm test:integration tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/settings/settings-and-devices.test.ts | 3 passed (targeted 8/8 across 2 files) | 43.02 s (50.87 s targeted) |
| 2026-11-15 20:24:10 | pnpm test:integration | 3 passed (suite: 56/56 across 13 files) | 42.17 s (434.42 s suite) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 3 passed (suite: 64/64 across 17 files) | 42.33 s (509.94 s suite) |

