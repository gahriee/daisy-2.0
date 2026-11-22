# Rooms, room types & beds validation schemas

- Status: PASS
- Last run: 2026-11-18 23:49:25 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/rooms/schemas.test.ts tests/unit/offline/snapshot-selectors.test.ts` (`vitest run tests/unit ...`)
- Result: 7 passed here (58 ms); suite 176 passed, 0 failed, 0 skipped across 45 files, 3.23 s.
- Target file: [tests/unit/features/rooms/schemas.test.ts](../../../../tests/unit/features/rooms/schemas.test.ts) -> [src/features/rooms/schemas.ts](../../../../src/features/rooms/schemas.ts)

## Verified criteria

- Validates `CreateRoomTypeSchema` and `UpdateRoomTypeSchema` per building (`BOARDING` monthly rates only; `TRANSIENT` daily rates only), trimming names/descriptions, normalizing two-decimal peso rates, rejecting cross-building rate fields, and rejecting empty names or `expectedVersion < 1`.
- Normalizes building-specific room pricing (`BOARDING` `baseMonthlyRate`; `TRANSIENT` `transientDailyRate`), rejects cross-building rate combinations, and allows omitted rate fields on both `CreateRoomSchema` and `UpdateRoomSchema` for server-side `RoomType` rate inheritance.
- Rejects zero/out-of-range room capacities, non-UUID `roomTypeId`, negative peso rates, and invalid `expectedVersion < 1`.
- Validates bed creation payloads, normalizes empty optional daily rates to `null`, and restricts `UpdateBedSchema.status` to `AVAILABLE` or `MAINTENANCE` (disallowing manual `OCCUPIED`).
- Validates `CreateRoomPhotoIntentSchema` (`image/jpeg`, `image/png`, `image/webp`, 64-hex SHA-256, `<= 25 MiB`), `ROOM_PHOTO_OUTPUT_WIDTH`/`HEIGHT` (`1200 x 900`, `4:3`), `RoomPhotoManifestSchema` (unlimited gallery shots with `<= 160` char trimmed captions), and rejection of non-empty `photos` on `BOARDING` rooms in `CreateRoomSchema` and `UpdateRoomSchema`.
- Validates public `/book` listing options (`isTransientPublished`, trimmed `transientTitle <= 120`, trimmed `transientDescription <= 600`) on `TRANSIENT` rooms, rejects public publishing or listing text on `BOARDING` rooms, and preserves `undefined` optional fields on partial `UpdateRoomSchema` updates while clearing blank strings to `null`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-18 23:49:25 | pnpm test:unit | 7 passed (suite: 176/176 across 45 files) | 58 ms (3.23 s suite) |
| 2026-11-18 04:05:33 | pnpm test:unit | 6 passed (suite: 172/172 across 44 files) | 81 ms (2.57 s suite) |
| 2026-11-13 22:01:22 | pnpm test:unit | 3 passed (suite: 66/66 across 17 files) | 16 ms (982 ms suite) |
| 2026-11-13 22:39:18 | pnpm test:unit | 4 passed (suite: 67/67 across 17 files) | 19 ms (805 ms suite) |
| 2026-11-14 04:31:35 | pnpm test:unit | 6 passed (suite: 108/108 across 27 files) | 51 ms (2.32 s suite) |
| 2026-11-15 20:16:55 | pnpm test:unit | 6 passed (suite: 113/113 across 28 files) | 61 ms (1.70 s suite) |
