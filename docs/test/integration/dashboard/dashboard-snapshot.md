# Dashboard operational snapshot integration

- Status: PASS for backend and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration`
- Result: 2 passed here (11.47 s); suite 64 passed, 0 failed, 0 skipped across 17 files, 509.94 s.
- Target: explicitly opted-in expiring schema-only branch `test-integration` via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Target file: [tests/integration/dashboard/dashboard-snapshot.test.ts](tests/integration/dashboard/dashboard-snapshot.test.ts) -> [src/features/dashboard/service.ts](src/features/dashboard/service.ts), [src/app/api/dashboard/route.ts](src/app/api/dashboard/route.ts)

## Verified criteria

- Fails closed on `GET /api/dashboard` when unauthenticated (`401`) and returns `Cache-Control: private, no-store` plus `Referrer-Policy: no-referrer` when authenticated.
- Returns `null` boarding and transient occupancy percentages when an Owner has zero active rooms while keeping `"0.00"` financial totals and `configuration.policiesConfigured === false` / `stayScheduleConfigured === false`.
- Aggregates one `RepeatableRead` Owner-scoped snapshot across boarding/transient room occupancy, open and overdue invoice balances, draft count, current vs. previous month net collections (`collectedThisMonth`, `collectedPreviousMonth`), pending public booking request previews (`pendingBookingRequestsList`), today's transient check-ins/check-outs, boarding move-ins and ending-soon stays, open/urgent maintenance with active holds, active notices, and identifier-only recent `AuditLog` entries.
- Isolates foreign Owner records completely and writes zero extra `AuditLog` entries on dashboard reads.

## Fixture cleanup

Teardown deleted all `dashboard-test-*` records across `Notice`, `BookingRequest`, `Payment` (reversals first), `Invoice`, `TenantAssignment`, `Allocation`, `MaintenanceRequest`, `TransientReservation`, `TransientGuest`, `Tenant`, `Bed`, `Room`, `RoomType`, `BusinessSettings`, `AuditLog`, and `Owner` in foreign-key order and asserted zero remaining `Owner` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 02:24:55 | `pnpm test:integration tests/integration/dashboard/dashboard-snapshot.test.ts` | 1 passed, 1 failed (`Bed_rates_check` missing rate on test fixture) | 4.83 s |
| 2026-11-16 02:25:12 | `pnpm test:integration tests/integration/dashboard/dashboard-snapshot.test.ts` | 1 passed, 1 failed (`Invoice_payer_check` & teardown FK order in test fixture) | 2.98 s |
| 2026-11-16 02:25:54 | `pnpm test:integration tests/integration/dashboard/dashboard-snapshot.test.ts` | 2 passed | 10.92 s (11.36 s suite) |
| 2026-11-16 14:55:09 | `pnpm test:integration tests/integration/dashboard/dashboard-snapshot.test.ts tests/integration/reports/reports-and-exports.test.ts` | 2 passed here (4/4 targeted files) | 12.28 s (28.04 s total) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 2 passed (suite: 64/64 across 17 files) | 11.47 s (509.94 s suite) |

