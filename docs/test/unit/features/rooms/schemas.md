# Rooms, room types & beds validation schemas

- Status: PASS
- Last run: 2026-11-13 22:39:18 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 4 passed here (19 ms); suite 67 passed, 0 failed, 0 skipped across 17 files, 805 ms.
- Target file: [tests/unit/features/rooms/schemas.test.ts](tests/unit/features/rooms/schemas.test.ts) -> [src/features/rooms/schemas.ts](src/features/rooms/schemas.ts)

## Verified criteria

- Validates `CreateRoomTypeSchema` and `UpdateRoomTypeSchema`, trimming names/descriptions and normalizing two-decimal peso rates while rejecting empty names or `expectedVersion < 1`.
- Normalizes room inputs and two-decimal non-negative peso amounts (`4500.00`, `650.50`) and allows omitted `baseMonthlyRate` / `transientDailyRate` on room creation for server-side inheritance from `RoomType`.
- Rejects zero/out-of-range room capacities, non-UUID `roomTypeId`, negative peso rates, and invalid `expectedVersion < 1`.
- Validates bed creation payloads, normalizes empty optional daily rates to `null`, and restricts `UpdateBedSchema.status` to `AVAILABLE` or `MAINTENANCE` (disallowing manual `OCCUPIED`).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 22:01:22 | pnpm test:unit | 3 passed (suite: 66/66 across 17 files) | 16 ms (982 ms suite) |
| 2026-11-13 22:39:18 | pnpm test:unit | 4 passed (suite: 67/67 across 17 files) | 19 ms (805 ms suite) |

