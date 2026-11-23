# Sync transport endpoints integration

- Status: PASS
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration`
- Result: 2 passed, 0 failed, 0 skipped, 11.56 s (suite: 64/64 across 17 files, 509.94 s).
- Target: explicitly opted-in expiring schema-only branch `test-integration` via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Target file: [tests/integration/sync/sync-transport.test.ts](tests/integration/sync/sync-transport.test.ts) -> [src/server/sync/service.ts](src/server/sync/service.ts), [src/app/api/sync/bootstrap/route.ts](src/app/api/sync/bootstrap/route.ts), [src/app/api/sync/push/route.ts](src/app/api/sync/push/route.ts), [src/app/api/sync/pull/route.ts](src/app/api/sync/pull/route.ts)

## Verified criteria

- Fails closed on unauthenticated (`401`), cross-origin writes (`403`), and unregistered or revoked `daisy_device` credentials (`403`) with `Cache-Control: private, no-store`.
- Reconstructs fixed-watermark snapshots in `POST /api/sync/bootstrap` from immutable `ChangeFeed` history (`DISTINCT ON` + native UUID keyset pagination), keeping archived/tombstone records and excluding concurrent writes committed after page 1 started while catching them on subsequent `/api/sync/pull`.
- Routes `POST /api/sync/push` batches through per-operation transactions under active device `FOR SHARE` and `SyncHead` `FOR UPDATE` locks: missing dependencies return retryable `"retry"` with zero terminal `SyncOperationOutcome`, duplicate submissions return `"duplicate"`, tampered `opId` replays return `"rejected"`, stale `baseVersion` edits return `"conflict"` and propagate `"blocked"` to dependents, and `SecurityRateLimit` enforces `429` + `Retry-After`.
- Rejects tampered cursors, expired cursors, and stale/ahead cursors (`seq > SyncHead.lastSequence`) on `GET /api/sync/pull` with `HTTP 410` (`code: "rebootstrap_required"`).

## Fixture cleanup

Teardown deleted all `sync-test-*` records across `SecurityRateLimit`, `MaintenanceUpdate`, `MaintenanceRequest`, `Tenant`, `Bed`, `Room`, `RoomType`, `ChangeFeed`, `SyncOperationOutcome`, `SyncHead`, `AuditLog`, `SecurityEvent`, `Device`, and `Owner` in FK order and asserted zero remaining `Owner`, `ChangeFeed`, and `SyncOperationOutcome` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 13:57:13 | `pnpm test:integration tests/integration/sync/sync-transport.test.ts` | 1 passed, 1 failed (missing `cookie: deviceCookie` on `pullRoute` test calls) | 15.50 s (16.31 s suite) |
| 2026-11-16 13:58:06 | `pnpm test:integration tests/integration/sync/sync-transport.test.ts` | 1 passed, 1 failed (`minSeq` check conflicted with normal `allocateSyncSequence` lock holes) | 7.69 s (8.56 s suite) |
| 2026-11-16 13:59:43 | `pnpm test:integration tests/integration/sync/sync-transport.test.ts` | 2 passed, 0 failed | 12.46 s (13.36 s suite) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 2 passed (suite: 64/64 across 17 files) | 11.56 s (509.94 s suite) |
| 2026-11-23 22:32:47 | `pnpm test:integration tests/integration/sync/sync-transport.test.ts tests/integration/settings/settings-and-devices.test.ts` | 0 passed, 2 failed — blocked: `.env.test.local` `TEST_DATABASE_URL` branch credentials expired/invalid (`Authentication failed against the database server`); no database substituted | 891 ms |
