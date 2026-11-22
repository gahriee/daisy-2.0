# Reports overview & CSV export integration

- Status: PASS for backend and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-18 19:57:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration tests/integration/reports/reports-and-exports.test.ts`
- Result: 2 passed, 0 failed, 0 skipped, 12.61 s (suite 11.75 s).
- Target: explicitly opted-in expiring schema-only branch `test-integration` via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Target file: [tests/integration/reports/reports-and-exports.test.ts](tests/integration/reports/reports-and-exports.test.ts) -> [src/features/reports/service.ts](src/features/reports/service.ts), [src/app/api/reports/route.ts](src/app/api/reports/route.ts), [src/app/api/reports/export/route.ts](src/app/api/reports/export/route.ts)

## Verified criteria

- Fails closed on `GET /api/reports` and `GET /api/reports/export` when unauthenticated (`401`) with `Cache-Control: private, no-store`.
- Computes historical receivables aging accurately as of `asOfDate` across invoice issuances and `Payment.paidAt` reversal dates (`2026-10-31` shows `0.00` open vs `2026-11-15` after a `2026-11-05` reversal restores `5000.00` into `31_60` past due).
- Computes `RepeatableRead` occupancy (plus `byBuilding` / `byRoomType` comparisons), rent roll (plus `byRoomType`, `leaseExpiries`, `averageMonthlyRent`, `openBalanceToRentPercent`), collections including reversals (`byMethod`, `byScope`, `dailyTrend`), transient revenue (`byStatus`, `byRoomType`, `averageDailyRate`), maintenance (`byCategory`, `byPriority`, `byBuilding`), Owner isolation, and zero `AuditLog` writes on report reads.
- Records an identifier-only `report.exported` `AuditLog` (zero PII) on CSV, Excel (`.xlsx`), Word (`.docx`), and PDF (`.pdf`) exports, returns matching MIME types, magic signatures, attachment + `no-referrer` + `nosniff` headers, rejects unsupported `format` values (`400`), and enforces DB-backed `SecurityRateLimit` (`429` + `Retry-After` after threshold).

## Fixture cleanup

Teardown deleted all `reports-test-*` records across `SecurityRateLimit`, `PaymentAllocation`, `Payment` (reversals first), `InvoiceAdjustment`, `Invoice`, `TenantAssignment`, `Allocation`, `MaintenanceRequest`, `TransientReservation`, `TransientGuest`, `Tenant`, `Bed`, `Room`, `RoomType`, `AuditLog`, and `Owner` in FK order and asserted zero remaining `Owner`, `AuditLog`, and `SecurityRateLimit` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 03:08:54 | `pnpm test:integration tests/integration/reports/reports-and-exports.test.ts` | 1 passed, 1 failed (`Bed_rates_check` missing fixture rates) | 2.79 s (3.30 s suite) |
| 2026-11-16 03:09:17 | `pnpm test:integration tests/integration/reports/reports-and-exports.test.ts` | 2 passed, 0 failed | 13.19 s (13.70 s suite) |
| 2026-11-16 14:55:09 | `pnpm test:integration tests/integration/dashboard/dashboard-snapshot.test.ts tests/integration/reports/reports-and-exports.test.ts` | 2 passed here (4/4 targeted files) | 14.63 s (28.04 s total) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 2 passed (suite: 64/64 across 17 files) | 6.39 s (509.94 s suite) |
| 2026-11-18 19:57:26 | `pnpm test:integration tests/integration/reports/reports-and-exports.test.ts` | 2 passed, 0 failed | 11.75 s (12.61 s total) |

