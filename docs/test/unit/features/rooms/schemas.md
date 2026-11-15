# Rooms, room types & beds validation schemas

- Status: PASS
- Last run: 2026-11-15 20:16:55 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 6 passed here (61 ms); suite 113 passed, 0 failed, 0 skipped across 28 files, 1.70 s.
- Target file: [tests/unit/features/rooms/schemas.test.ts](../../../../tests/unit/features/rooms/schemas.test.ts) -> [src/features/rooms/schemas.ts](../../../../src/features/rooms/schemas.ts)

## Verified criteria

- Validates `CreateRoomTypeSchema` and `UpdateRoomTypeSchema` per building (`BOARDING` monthly rates only; `TRANSIENT` daily rates only), trimming names/descriptions, normalizing two-decimal peso rates, rejecting cross-building rate fields, and rejecting empty names or `expectedVersion < 1`.
- Normalizes building-specific room pricing (`BOARDING` `baseMonthlyRate`; `TRANSIENT` `transientDailyRate`), rejects cross-building rate combinations, and allows omitted rate fields on both `CreateRoomSchema` and `UpdateRoomSchema` for server-side `RoomType` rate inheritance.
- Rejects zero/out-of-range room capacities, non-UUID `roomTypeId`, negative peso rates, and invalid `expectedVersion < 1`.
- Validates bed creation payloads, normalizes empty optional daily rates to `null`, and restricts `UpdateBedSchema.status` to `AVAILABLE` or `MAINTENANCE` (disallowing manual `OCCUPIED`).
- Validates `CreateRoomPhotoIntentSchema` (`image/jpeg`, `image/png`, `image/webp`, 64-hex SHA-256, `<= 25 MiB`) and `RoomPhotoManifestSchema` (up to 8 gallery photos, `<= 160` char trimmed captions, preview photo + gallery intent/existing variants).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 22:01:22 | pnpm test:unit | 3 passed (suite: 66/66 across 17 files) | 16 ms (982 ms suite) |
| 2026-11-13 22:39:18 | pnpm test:unit | 4 passed (suite: 67/67 across 17 files) | 19 ms (805 ms suite) |
| 2026-11-14 04:31:35 | pnpm test:unit | 6 passed (suite: 108/108 across 27 files) | 51 ms (2.32 s suite) |
| 2026-11-15 20:16:55 | pnpm test:unit | 6 passed (suite: 113/113 across 28 files) | 61 ms (1.70 s suite) |
