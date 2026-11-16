# Sync transport request contracts

- Status: PASS
- Last run: 2026-11-16 13:57:11 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit` (covers `tests/unit/features/sync/contracts.test.ts`)
- Result: 2 passed here (7 ms); suite 129 passed, 0 failed, 0 skipped across 33 files, 1.70 s.
- Target file: [tests/unit/features/sync/contracts.test.ts](tests/unit/features/sync/contracts.test.ts) -> [src/features/sync/contracts.ts](src/features/sync/contracts.ts)

## Verified criteria

- Enforces push batch bounds of 1 to 50 operations (`SyncPushRequestSchema`).
- Enforces pull cursor presence and 100-record maximum page bounds (`SyncPullQuerySchema`, `SyncBootstrapRequestSchema`).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 13:57:11 | `pnpm test:unit` | 2 passed (suite: 129/129 across 33 files) | 7 ms (1.70 s suite) |

