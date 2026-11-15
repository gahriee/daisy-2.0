# Unified allocation engine & btree_gist exclusion

- Status: PASS for PostgreSQL & engine integration checks.
- Last run: 2026-11-14 00:47:58 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration tests/integration/maintenance/maintenance-and-holds.test.ts tests/integration/notices/notices-lifecycle.test.ts tests/integration/allocations/allocation-engine.test.ts`
- Result: 2 passed here (16.22 s); targeted 6/6 across 3 files, 99.40 s.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261114020000_maintenance_and_notices` applied to `test-integration` and `dev`; `production` untouched.
- Target file: [tests/integration/allocations/allocation-engine.test.ts](tests/integration/allocations/allocation-engine.test.ts) -> [src/features/allocations/service.ts](src/features/allocations/service.ts)

## Verified criteria

- Permits exact abutting half-open `[startDate, endDate)` intervals (`[Dec 1, Dec 15)` followed by `[Dec 15, Jan 1)`) and rejects overlaps via `AllocationConflictError` in service code and directly at PostgreSQL `Allocation_active_bed_interval_excl` (`23P01`) when bypassing service prechecks.
- Releases intervals cleanly on `cancelAllocationInTx` (allowing subsequent bookings) and truncates `endDate` on `completeAllocationInTx`.
- Claims all active beds atomically with shared `allocationGroupId` on `WHOLE_ROOM` bookings, blocks competing single-bed claims and overlapping new bed additions (`ConflictError`), and allows only one winner under concurrent `Promise.allSettled` bookings for the same bed and interval.

## Fixture cleanup

Teardown deleted all UUID-prefixed `AuditLog`, `ChangeFeed`, `SyncHead`, `Allocation`, `Bed`, `Room`, `RoomType`, and `Owner` fixtures and asserted zero remaining `Allocation` and `Owner` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 22:04:52 | pnpm test:integration | 2 passed (suite: 30/30 across 7 files) | 15.05 s (81.07 s suite) |
| 2026-11-13 22:39:25 | pnpm test:integration | 2 passed (suite: 30/30 across 7 files) | 13.01 s (86.49 s suite) |
| 2026-11-13 22:52:06 | pnpm test:integration | 2 passed (suite: 31/31 across 7 files) | 12.77 s (80.17 s suite) |
| 2026-11-14 00:21:56 | pnpm test:integration tests/integration/transients/transients-and-public-booking.test.ts tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/allocations/allocation-engine.test.ts | 2 passed (targeted 14/14 across 4 files) | 12.35 s (206.38 s targeted) |
| 2026-11-14 00:47:58 | pnpm test:integration tests/integration/maintenance/maintenance-and-holds.test.ts tests/integration/notices/notices-lifecycle.test.ts tests/integration/allocations/allocation-engine.test.ts | 2 passed (targeted 6/6 across 3 files) | 16.22 s (99.40 s targeted) |

