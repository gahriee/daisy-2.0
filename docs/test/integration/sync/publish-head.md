# SyncHead monotonic publication lock

- Status: PASS
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration`
- Result: 2 passed here (3.95 s); suite 64 passed, 0 failed, 0 skipped across 17 files, 509.94 s.
- Target: explicitly opted-in expiring schema-only branch `test-integration` via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261114150000_building_separation_and_tenant_contracts` applied to `test-integration` and `dev`; `production` remains at `20261113060000_recovery_security`.

## Verified criteria

- 5 concurrent transactions calling `allocateSyncSequence` + `appendChangeFeed` + `writeAuditEntry` serialize cleanly via `SyncHead` `SELECT ... FOR UPDATE` and produce contiguous strictly monotonic sequences `[1, 2, 3, 4, 5]` in `ChangeFeed`.
- Aborting an enclosing transaction after `allocateSyncSequence` rolls back the `SyncHead` increment cleanly so the next committed allocation starts at `1` with zero sequence gaps.

## Fixture cleanup

Teardown deleted all UUID-prefixed `AuditLog`, `ChangeFeed`, `SyncHead`, and `Owner` test rows and asserted zero remaining `ChangeFeed` and `SyncHead` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 18:30:47 | pnpm test:integration | 2 passed (suite: 23/23 across 3 files) | 3.88 s (29.03 s suite) |
| 2026-11-13 22:04:52 | pnpm test:integration | 2 passed (suite: 30/30 across 7 files) | 4.28 s (81.07 s suite) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 2 passed (suite: 64/64 across 17 files) | 3.95 s (509.94 s suite) |

