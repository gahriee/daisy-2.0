# Billing & Invoicing lifecycle integration

- Status: PASS for backend and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration`
- Result: 6 passed here (`74.45 s`); suite 64 passed, 0 failed, 0 skipped across 17 files, `509.94 s`.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261114150000_building_separation_and_tenant_contracts` applied to `test-integration` and `dev`; `production` remains at `20261113060000_recovery_security`.
- Target file: [tests/integration/billing/invoicing-and-lifecycle.test.ts](../../../../tests/integration/billing/invoicing-and-lifecycle.test.ts) -> [src/features/billing/service.ts](../../../../src/features/billing/service.ts), [src/app/api/billing/route.ts](../../../../src/app/api/billing/route.ts), [src/app/api/jobs/billing/generate/route.ts](../../../../src/app/api/jobs/billing/generate/route.ts)

## Verified criteria

- Refuses period generation with `PreconditionError` when `BusinessSettings` billing policies are incomplete (`null`).
- Generates prorated period invoices + initial security deposit idempotently by `(ownerUserId, tenantId, billingPeriod)` and skips duplicate non-voided period runs.
- Enforces `ConflictError` on stale `expectedVersion` during `issueDraftInvoice`, assigns atomic sequential `INV-YYYY-000001` numbers via `DocumentSequence` under `SyncHead`, freezes context snapshots, updates tenant `derivedBalance`, and writes identifier-only `AuditLog` + `ChangeFeed` entries.
- Supports linked `CREDIT` / `CHARGE` adjustments (`addInvoiceAdjustment`), rejects credits reducing total below `0`, retains history on `voidInvoice`, permits re-generation for a period after voiding, and blocks voiding when `paidAmount > 0`.
- Projects PII-free `"Overdue invoice"` alerts to `listOwnerNotifications` (`/billing?invoiceId=<id>`) and verifies `401` / `private, no-store` `200` on `GET /api/billing` and `CRON_SECRET` Bearer auth on `POST /api/jobs/billing/generate`.
- Loads `/billing/new` create context (`getBillingCreateContext`) and Owner-scoped `/billing/[invoiceId]` detail (`getInvoiceDetail`), returning `null` for cross-Owner or unknown invoice IDs.

## Fixture cleanup

Teardown deleted all UUID-prefixed `InvoiceAdjustment`, `InvoiceItem`, `Invoice`, `DocumentSequence`, `NotificationRead`, `AuditLog`, `ChangeFeed`, `SyncOperationOutcome`, `SyncHead`, `TenantAssignment`, `Allocation`, `Tenant`, `Bed`, `Room`, `RoomType`, `BusinessSettings`, and `Owner` rows and asserted `0` remaining `Invoice` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 23:06:24 | pnpm vitest run --config vitest.integration.config.mts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/tenants/tenants-and-assignments.test.ts | 5 passed (targeted 7/7 across 2 files) | 40.14 s (68.25 s targeted) |
| 2026-11-13 23:43:51 | pnpm test:integration tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/tenants/tenants-and-assignments.test.ts | 5 passed here | 32.56 s |
| 2026-11-14 00:21:56 | pnpm test:integration tests/integration/transients/transients-and-public-booking.test.ts tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/allocations/allocation-engine.test.ts | 5 passed (targeted 14/14 across 4 files) | 54.36 s (206.38 s targeted) |
| 2026-11-14 04:11:35 | pnpm test:integration tests/integration/rooms/inventory-and-archival.test.ts tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/settings/settings-and-devices.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 5 passed (targeted 20/20 across 6 files) | 51.88 s (263.82 s targeted) |
| 2026-11-14 11:59:05 | pnpm test:integration tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/rooms/inventory-and-archival.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 6 passed (targeted 23/23 across 5 files) | 59.32 s (314.33 s targeted) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 6 passed (suite: 64/64 across 17 files) | 74.45 s (509.94 s suite) |
| 2026-11-27 18:27:57 | `pnpm test:integration tests/integration/settings/settings-and-devices.test.ts ...` (6 files) | 0 passed, 6 failed — blocked: `TEST_DATABASE_URL` authentication failed; no database substituted | 2.30 s (13.89 s batch) |

