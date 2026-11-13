# Rooms, room types, beds, soft archival & Owner isolation

- Status: PASS for backend and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-13 22:52:06 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: pnpm test:integration
- Result: 2 passed here (14.60 s: `4.69 s` room types/pricing/archival + `9.40 s` room/bed capacity & allocation blockers); suite 31 passed, 0 failed, 0 skipped across 7 files, 80.17 s.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261113150000_room_types_with_pricing` applied to `test-integration` and `dev`; `production` untouched.
- Target file: [tests/integration/rooms/inventory-and-archival.test.ts](tests/integration/rooms/inventory-and-archival.test.ts) -> [src/features/rooms/service.ts](src/features/rooms/service.ts), [src/app/api/rooms/route.ts](src/app/api/rooms/route.ts)

## Verified criteria

- `GET /api/rooms` fails closed (`401`) for unauthenticated requests and returns `200` with `roomTypes`, `rooms`, and `summary` when Owner-authenticated.
- Enforces case-insensitive partial unique active `RoomType` names (`RoomType_ownerUserId_name_active_key` -> `ConflictError`), rate normalization, soft archival (`tombstone` feed entry + blocking new room creation with `PreconditionError`), and restoration.
- `createRoom` automatically inherits `monthlyRate` and `dailyRate` from the selected `RoomType` when rates are omitted.
- Enforces case-insensitive partial unique active room/bed numbers (`23505` -> `ConflictError`), room `capacity` ceiling on bed creation (`PreconditionError`), and atomic `expectedVersion` checks (`ConflictError`).
- Blocks soft archival of both `Bed` and parent `Room` while active or upcoming allocations exist (`ConflictError`), permits archive after cancellation, emits `tombstone` entries in `ChangeFeed`, and restores room and bed availability cleanly.
- Isolates room type and room mutations strictly to `ownerUserId` (`NotFoundError` for foreign Owners).

## Fixture cleanup

Teardown deleted all UUID-prefixed `AuditLog`, `ChangeFeed`, `SyncHead`, `Allocation`, `Bed`, `Room`, `RoomType`, and `Owner` fixtures and asserted zero remaining `Room`, `RoomType`, and `Owner` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 22:04:52 | pnpm test:integration | 1 passed (suite: 30/30 across 7 files) | 9.56 s (81.07 s suite) |
| 2026-11-13 22:39:25 | pnpm test:integration | 1 passed (suite: 30/30 across 7 files) | 13.10 s (86.49 s suite) |
| 2026-11-13 22:52:06 | pnpm test:integration | 2 passed (suite: 31/31 across 7 files) | 14.60 s (80.17 s suite) |

