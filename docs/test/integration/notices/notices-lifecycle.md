# Notices lifecycle, audience targeting & constraints

- Status: PASS for PostgreSQL integration checks.
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration`
- Result: 1 passed here (8.47 s); suite 64 passed, 0 failed, 0 skipped across 17 files, 509.94 s.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261114150000_building_separation_and_tenant_contracts` applied to `test-integration` and `dev`; `production` remains at `20261113060000_recovery_security`.
- Target file: [tests/integration/notices/notices-lifecycle.test.ts](../../../tests/integration/notices/notices-lifecycle.test.ts) -> [src/features/notices/service.ts](../../../src/features/notices/service.ts), [src/app/api/notices/route.ts](../../../src/app/api/notices/route.ts)

## Verified criteria

- Enforces Owner `401` gating on `GET /api/notices` and derives `ACTIVE`, `SCHEDULED`, `EXPIRED`, and `ARCHIVED` states in `Asia/Manila` across `EVERYONE`, `ROOM`, and `TENANT` audiences.
- Enforces optimistic concurrency (`ConflictError` on stale `expectedVersion`), missing-target rejection (`NotFoundError`), soft-archive/restore `ChangeFeed` `tombstone` and `upsert` publication, SQL `Notice_audience_target_check` (`23514`) protection, and identifier-only `AuditLog` (`area: "notices"`, zero notice text or tenant names).

## Fixture cleanup

Teardown deleted all UUID-prefixed `AuditLog`, `ChangeFeed`, `SyncHead`, `Notice`, `Tenant`, `Room`, `RoomType`, and `Owner` fixtures and asserted zero remaining `Notice` and `Owner` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-14 00:47:58 | pnpm test:integration tests/integration/maintenance/maintenance-and-holds.test.ts tests/integration/notices/notices-lifecycle.test.ts tests/integration/allocations/allocation-engine.test.ts | 1 passed (targeted 6/6 across 3 files) | 16.06 s (99.40 s targeted) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 1 passed (suite: 64/64 across 17 files) | 8.47 s (509.94 s suite) |

