# Maintenance requests, attachment relay, bed holds & offline sync

- Status: PASS for PostgreSQL, storage adapter mock, notification & sync integration checks.
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore), mocked Object Storage adapter.
- Command: `pnpm test:integration`
- Result: 4 passed here (`74.37 s`); suite 64 passed, 0 failed, 0 skipped across 17 files, `509.94 s`.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261114150000_building_separation_and_tenant_contracts` applied to `test-integration` and `dev`; `production` remains at `20261113060000_recovery_security`.
- Target file: [tests/integration/maintenance/maintenance-and-holds.test.ts](../../../tests/integration/maintenance/maintenance-and-holds.test.ts) -> [src/features/maintenance/service.ts](../../../src/features/maintenance/service.ts), [src/features/maintenance/attachments.ts](../../../src/features/maintenance/attachments.ts), [src/features/maintenance/sync-handler.ts](../../../src/features/maintenance/sync-handler.ts), [src/server/notifications/service.ts](../../../src/server/notifications/service.ts)

## Verified criteria

- Enforces Owner `401` gating on `/api/maintenance` and `/api/maintenance/attachments/*`; reuses upload intents idempotently via `(opId, clientFileId)` with `409` on checksum mismatch, rejects SHA-256 relay mismatches (`400`), binds private S3 objects to maintenance requests, and mints 60-second signed downloads with `private, no-store` headers.
- Enforces unified allocation holds: rejects `WHOLE_ROOM` holds overlapping occupied/reserved beds with `AllocationConflictError`, moves held beds into `MAINTENANCE` (blocking immediate stays with `PreconditionError`), blocks overlapping transient bookings against future scheduled holds with `AllocationConflictError`, and automatically releases active holds and restores `Bed.status` -> `AVAILABLE` when resolving the request or releasing manually.
- Projects PII-free `"Urgent maintenance"` notifications (`/maintenance?requestId=<id>`) without request notes/descriptions while urgent requests remain active, clearing them upon resolution.
- Replays offline queued operations via `applyMaintenanceSyncOperation` (`"applied"`, cached `"duplicate"` even with queued attachment intents, and `"conflict"` / Needs attention on stale `baseVersion`), writing identifier-only `AuditLog` entries (`area: "maintenance"`).
- Loads Owner-scoped `/maintenance/new` (`getMaintenanceCreateContext`, including `building` metadata on selectable `BOARDING`/`TRANSIENT` rooms) and `/maintenance/[requestId]` (`getMaintenanceRequestDetail`), returning `null` for cross-Owner or unknown request IDs.

## Fixture cleanup

Teardown deleted all UUID-prefixed `SecurityRateLimit`, `NotificationRead`, `AuditLog`, `ChangeFeed`, `SyncOperationOutcome`, `SyncHead`, `MaintenanceAttachment`, `MaintenanceAttachmentIntent`, `MaintenanceUpdate`, `Allocation`, `TransientReservation`, `TransientGuest`, `MaintenanceRequest`, `Bed`, `Room`, `RoomType`, `Device`, `SecurityEvent`, `BusinessSettings`, and `Owner` fixtures and asserted zero remaining `MaintenanceRequest`, `Allocation`, and `Owner` rows before disconnecting. Verified zero leftover `maint-test-%` / `notices-test-%` rows in `test-integration`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-14 00:47:58 | pnpm test:integration tests/integration/maintenance/maintenance-and-holds.test.ts tests/integration/notices/notices-lifecycle.test.ts tests/integration/allocations/allocation-engine.test.ts | 3 passed (targeted 6/6 across 3 files) | 65.73 s (99.40 s targeted) |
| 2026-11-14 04:11:35 | pnpm test:integration tests/integration/rooms/inventory-and-archival.test.ts tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/settings/settings-and-devices.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 3 passed (targeted 20/20 across 6 files) | 73.44 s (263.82 s targeted) |
| 2026-11-14 11:59:05 | pnpm test:integration tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/rooms/inventory-and-archival.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 4 passed (targeted 23/23 across 5 files) | 82.09 s (314.33 s targeted) |
| 2026-11-15 20:24:10 | pnpm test:integration | 4 passed (suite: 56/56 across 13 files) | 63.48 s (434.42 s suite) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 4 passed (suite: 64/64 across 17 files) | 74.37 s (509.94 s suite) |
| 2026-11-27 18:27:57 | `pnpm test:integration tests/integration/settings/settings-and-devices.test.ts ...` (6 files) | 0 passed, 4 failed — blocked: `TEST_DATABASE_URL` authentication failed; no database substituted | 1.15 s (13.89 s batch) |

