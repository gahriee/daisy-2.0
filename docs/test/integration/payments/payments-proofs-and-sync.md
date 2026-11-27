# Payments, proofs, credit carry-forward, reversals & sync integration

- Status: PASS for backend and PostgreSQL integration checks (with mocked S3 storage adapter); Owner UI/device verification and live S3 object relay verification PENDING.
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration`
- Result: 5 passed here (`65.74 s`); suite 64 passed, 0 failed, 0 skipped across 17 files, `509.94 s`.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261114150000_building_separation_and_tenant_contracts` applied to `test-integration` and `dev`; `production` remains at `20261113060000_recovery_security`.
- Target file: [tests/integration/payments/payments-proofs-and-sync.test.ts](../../../../tests/integration/payments/payments-proofs-and-sync.test.ts) -> [src/features/payments/service.ts](../../../../src/features/payments/service.ts), [src/features/payments/proofs.ts](../../../../src/features/payments/proofs.ts), [src/features/payments/sync-handler.ts](../../../../src/features/payments/sync-handler.ts), [src/app/api/payments/route.ts](../../../../src/app/api/payments/route.ts), [src/app/api/payments/proofs/intent/route.ts](../../../../src/app/api/payments/proofs/intent/route.ts), [src/app/api/payments/proofs/intents/[intentId]/route.ts](../../../../src/app/api/payments/proofs/intents/[intentId]/route.ts), [src/app/api/payments/proofs/[proofId]/download/route.ts](../../../../src/app/api/payments/proofs/[proofId]/download/route.ts)

## Verified criteria

- Blocks payment recording with `PreconditionError` when `overpaymentPolicy` or `receiptPrefix` is unconfigured, enforces `REJECT_OVERPAYMENT`, settles multiple invoices atomically across concurrent calls under `SyncHead`, assigns consecutive `OR-YYYY-000001`/`000002` numbers via `DocumentSequence`, updates tenant `derivedBalance`, and records identifier-only `AuditLog` rows (excluding tenant name and reference strings).
- Carries excess payment as `unallocatedAmount` under `CREDIT_NEXT_INVOICE`, auto-applies FIFO credit on `issueDraftInvoice`, applies credit manually via `applyTenantCredit`, reverses `POSTED` payments into linked immutable `REVERSAL` entries restoring invoice balances and enabling `voidInvoice`, blocks duplicate/reversal-of-reversal operations, and verifies SQL partial unique constraint rejection of raw double-reversal inserts.
- Enforces `401` when unauthenticated and `403` on foreign write origin for proof routes, caches proof upload intent reuse by `(opId, clientFileId)`, rejects tampered SHA-256 byte payloads during relay upload, verifies proof metadata outside DB transactions before payment attachment, and returns `307` / `?format=json` 60-second signed downloads.
- Processes `payment.record` offline sync operations via `applyPaymentSyncOperation`: validates active device share lock, handles exact `opId` replay idempotently (`duplicate`), throws `ConflictError` on `opId` payload tampering, converts stale/voided invoice targets to `"conflict"` (`Needs attention`) while reserving no official receipt, and rejects revoked devices with `ForbiddenError`.
- Loads `/payments/new` create context (`getPaymentCreateContext`) and Owner-scoped `/payments/[paymentId]` detail (`getPaymentDetail`), returning `null` for cross-Owner or unknown payment IDs.

## Fixture cleanup

Teardown deleted all UUID-prefixed `SecurityRateLimit` (`proof-upload:*`), `NotificationRead`, `AuditLog`, `ChangeFeed`, `SyncOperationOutcome`, `SyncHead`, `PaymentProof`, `PaymentProofIntent`, `PaymentAllocation`, `Payment`, `InvoiceAdjustment`, `InvoiceItem`, `Invoice`, `DocumentSequence`, `Tenant`, `Device`, `BusinessSettings`, and `Owner` rows and verified `0` remaining `Payment` and `Owner` rows for the prefix before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 23:46:51 | pnpm test:integration tests/integration/payments/payments-proofs-and-sync.test.ts | 4 passed, 0 failed, 0 skipped | 65.52 s |
| 2026-11-14 00:21:56 | pnpm test:integration tests/integration/transients/transients-and-public-booking.test.ts tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/allocations/allocation-engine.test.ts | 4 passed (targeted 14/14 across 4 files) | 58.70 s (206.38 s targeted) |
| 2026-11-14 11:59:05 | pnpm test:integration tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/rooms/inventory-and-archival.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 5 passed (targeted 23/23 across 5 files) | 47.19 s (314.33 s targeted) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 5 passed (suite: 64/64 across 17 files) | 65.74 s (509.94 s suite) |
| 2026-11-27 18:27:57 | `pnpm test:integration tests/integration/settings/settings-and-devices.test.ts ...` (6 files) | 0 passed, 5 failed — blocked: `TEST_DATABASE_URL` authentication failed; no database substituted | 1.46 s (13.89 s batch) |

