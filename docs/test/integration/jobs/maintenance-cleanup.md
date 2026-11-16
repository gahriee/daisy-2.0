# Scheduled maintenance & orphan storage cleanup integration

- Status: PASS
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration`
- Result: 2 passed here (2.90 s); suite 64 passed, 0 failed, 0 skipped across 17 files, 509.94 s.
- Target: explicitly opted-in expiring schema-only branch `test-integration` via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Target file: [tests/integration/jobs/maintenance-cleanup.test.ts](tests/integration/jobs/maintenance-cleanup.test.ts) -> [src/server/jobs/cleanup.ts](src/server/jobs/cleanup.ts), [src/app/api/jobs/maintenance/cleanup/route.ts](src/app/api/jobs/maintenance/cleanup/route.ts)

## Verified criteria

- Fails closed (`401`, `Cache-Control: private, no-store`) when `CRON_SECRET` bearer auth is absent or wrong.
- Supports `dryRun: true` inspection without modifying database rows or deleting storage objects.
- Claims expired unattached `PENDING_UPLOAD` intents beyond `graceHours` (`24` hours default) across `RoomPhotoIntent`, `TenantContractIntent`, `PaymentProofIntent`, and `MaintenanceAttachmentIntent`, deletes corresponding private S3 objects outside the transaction (mocked S3 adapter), deletes expired `SecurityRateLimit` keys (`resetsAt < now - 1h`), records an identifier-only `maintenance.cleanup_completed` `AuditLog`, and re-runs idempotently with zero work.
- Protects active `PENDING_UPLOAD` intents within grace window, `ATTACHED` intents with child records, and active rate-limit windows while leaving `ChangeFeed` and `SyncOperationOutcome` untouched.

## Fixture cleanup

Teardown deleted all `jobs-cleanup-test-*` records across `SecurityRateLimit`, `RoomPhoto`, `RoomPhotoIntent`, `TenantContractPage`, `TenantContractIntent`, `PaymentProof`, `PaymentProofIntent`, `MaintenanceAttachment`, `MaintenanceAttachmentIntent`, `Room`, `RoomType`, `AuditLog`, and `Owner` in FK order and asserted zero remaining `Owner`, `AuditLog`, and `SecurityRateLimit` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 14:13:59 | `pnpm test:integration tests/integration/jobs/maintenance-cleanup.test.ts` | 2 passed (`declaredByteSize` TS fix prior run) | 6.96 s (7.46 s suite) |
| 2026-11-16 14:14:11 | `pnpm test:integration tests/integration/jobs/maintenance-cleanup.test.ts` | 2 passed, 0 failed | 4.15 s (4.68 s suite) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 2 passed (suite: 64/64 across 17 files) | 2.90 s (509.94 s suite) |
