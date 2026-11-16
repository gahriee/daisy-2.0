# Signed tenant contract storage, scanner pages & Owner isolation

- Status: PASS for backend, mocked Object Storage adapter, and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore), mocked Object Storage adapter.
- Command: `pnpm test:integration`
- Result: 1 passed here (11.51 s file / 9.87 s test); suite 64 passed, 0 failed, 0 skipped across 17 files, 509.94 s.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261114150000_building_separation_and_tenant_contracts` applied to `test-integration` and `dev`; `production` remains at `20261113060000_recovery_security`.
- Target file: [tests/integration/tenants/tenant-contracts.test.ts](../../../../tests/integration/tenants/tenant-contracts.test.ts) -> [src/features/tenants/contracts.ts](../../../../src/features/tenants/contracts.ts), [src/app/api/tenants/contracts/intent/route.ts](../../../../src/app/api/tenants/contracts/intent/route.ts), [src/app/api/tenants/contracts/intents/[intentId]/route.ts](../../../../src/app/api/tenants/contracts/intents/[intentId]/route.ts), [src/app/api/tenants/contracts/pages/[pageId]/route.ts](../../../../src/app/api/tenants/contracts/pages/[pageId]/route.ts)

## Verified criteria

- Enforces Owner `401` unauthenticated and `403` cross-origin gating on `POST /api/tenants/contracts/intent`, rejects forged non-PDF/image magic-byte payloads (`ValidationError`), and isolates intents and reads strictly to `ownerUserId` (`NotFoundError` / `404`).
- Uploads scanned JPEG (`MAGIC_WHITE`) and PDF (`ORIGINAL`) pages through the proxy intent flow (`201` intent + `200` `PUT`), links multi-page contracts to an active `TenantAssignment`, rejects intent reuse (`ConflictError`), and reflects contracts in `getTenantDetail` and `getTenantContractDetail`.
- Serves Owner-only contract page bytes from `GET /api/tenants/contracts/pages/[pageId]` (`200`, matching MIME type, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`) while returning `404` for foreign Owners.
- Enforces optimistic `expectedVersion` locking on `archiveTenantContract` (`ConflictError` on stale version), records identifier-only `AuditLog` entries (`tenant_contract.created`, `tenant_contract.archived`) free of title/note text, and publishes `ChangeFeed` `upsert`/`tombstone` entries under `SyncHead` lock.

## Fixture cleanup

Teardown deleted all UUID-prefixed `SecurityRateLimit` (`tenant-contract-upload:*`), `TenantContractPage`, `TenantContract`, `TenantContractIntent`, `AuditLog`, `ChangeFeed`, `SyncHead`, `TenantAssignment`, `Allocation`, `Tenant`, `Bed`, `Room`, `RoomType`, and `Owner` fixtures and asserted zero remaining `TenantContractPage`, `TenantContract`, `TenantContractIntent`, and `Owner` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-15 20:16:10 | pnpm test:integration tests/integration/tenants/tenant-contracts.test.ts | 1 passed | 11.71 s (12.00 s command; 9.81 s test) |
| 2026-11-15 20:24:10 | pnpm test:integration | 1 passed (suite: 56/56 across 13 files) | 11.71 s (434.42 s suite; 10.07 s test) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 1 passed (suite: 64/64 across 17 files) | 11.51 s (509.94 s suite; 9.87 s test) |

