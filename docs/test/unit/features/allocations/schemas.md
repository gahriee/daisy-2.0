# Allocation interval validation schemas

- Status: PASS
- Last run: 2026-11-13 22:01:22 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 1 passed here (10 ms); suite 66 passed, 0 failed, 0 skipped across 17 files, 982 ms.
- Target file: [tests/unit/features/allocations/schemas.test.ts](tests/unit/features/allocations/schemas.test.ts) -> [src/features/allocations/schemas.ts](src/features/allocations/schemas.ts)

## Verified criteria

- Rejects equal or reversed intervals (`endDate <= startDate`) for unified allocation payloads.
- Requires `bedId` for `BED` allocation scope while allowing `WHOLE_ROOM` allocations without a single bed ID.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 22:01:22 | pnpm test:unit | 1 passed (suite: 66/66 across 17 files) | 10 ms (982 ms suite) |

