# Maintenance Zod validation & sync envelope contracts

- Status: PASS
- Last run: 2026-11-28 02:40:40 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 5 passed here (95 ms); suite 219 passed, 0 failed, 0 skipped across 51 files, 4.93 s.
- Target file: [tests/unit/features/maintenance/schemas.test.ts](../../../../tests/unit/features/maintenance/schemas.test.ts) -> [src/features/maintenance/schemas.ts](../../../../src/features/maintenance/schemas.ts), [src/features/maintenance/sync-contracts.ts](../../../../src/features/maintenance/sync-contracts.ts)

## Verified criteria

- Trims and normalizes optional `bedId` and request fields and rejects duplicate `attachmentIntentIds` on `CreateMaintenanceRequestSchema`.
- Requires a non-empty progress note or a target status transition on `AddMaintenanceUpdateSchema`.
- Validates `BED` vs. `WHOLE_ROOM` bed-selection exclusivity and strict `endDateManila > startDateManila` ordering on `PlaceMaintenanceHoldSchema`.
- Enforces 64-character hex `sha256` digests and paired `(opId, clientFileId)` keys on `CreateMaintenanceAttachmentIntentSchema`.
- Produces deterministic canonical SHA-256 sync fingerprints regardless of payload property order on `MaintenanceSyncOperationSchema`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-14 00:39:59 | pnpm test:unit | 5 passed (suite: 98/98 across 25 files) | 25 ms (1.38 s suite) |
| 2026-11-28 02:27:18 | pnpm exec vitest run tests/unit/features/maintenance/schemas.test.ts | 5 passed | 843 ms |
| 2026-11-28 02:40:40 | pnpm test:unit | 5 passed (suite: 219/219 across 51 files) | 95 ms (4.93 s suite) |

