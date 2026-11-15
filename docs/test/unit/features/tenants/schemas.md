# Tenants, assignments, notes, contracts & sync contract validation schemas

- Status: PASS
- Last run: 2026-11-15 20:16:55 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 6 passed here (29 ms); suite 113 passed, 0 failed, 0 skipped across 28 files, 1.70 s.
- Target file: [tests/unit/features/tenants/schemas.test.ts](../../../../tests/unit/features/tenants/schemas.test.ts) -> [src/features/tenants/schemas.ts](../../../../src/features/tenants/schemas.ts), [src/features/tenants/sync-contracts.ts](../../../../src/features/tenants/sync-contracts.ts)

## Verified criteria

- Validates optional client-generated UUIDs and optional tenant contact fields while normalizing blank optional strings to `null`.
- Validates `CreateTenantNoteSchema` (`1–1000` trimmed chars, valid `tenantId` UUID) and `DeleteTenantNoteSchema` UUID fields, and verifies omitted `notes` defaults to `null` on `CreateTenantSchema` vs `undefined` (preserve-on-omit) on `UpdateTenantSchema`.
- Validates `CreateTenantContractIntentSchema` (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `<= CONTRACT_MAX_FILE_BYTES`, 64-hex SHA-256) and `CreateTenantContractSchema` (`MAGIC_WHITE`/`BW_SCAN`/`ORIGINAL` filter modes, `<= CONTRACT_MAX_PAGES`, rejecting duplicate `intentId` entries).
- Enforces `endDateManila > startDateManila` and two-decimal peso normalization on `CreateTenantAssignmentSchema`.
- Distinguishes move-out `complete` (requires valid `actualMoveOutDateManila`) from pre-start `cancel`.
- Canonicalizes JSON payloads deterministically independent of object key order and validates `TenantSyncOperationSchema` envelopes.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 22:01:22 | pnpm test:unit | 4 passed (suite: 66/66 across 17 files) | 19 ms (982 ms suite) |
| 2026-11-14 11:23:30 | pnpm test:unit | 5 passed (suite: 109/109 across 27 files) | 26 ms (1.50 s suite) |
| 2026-11-15 20:16:55 | pnpm test:unit | 6 passed (suite: 113/113 across 28 files) | 29 ms (1.70 s suite) |
