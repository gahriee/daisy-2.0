# Rooms, room types, beds, soft archival & Owner isolation

- Status: PASS for backend and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-16 23:31:26 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration`
- Result: 4 passed here (`37.30 s`); suite 64 passed, 0 failed, 0 skipped across 17 files, `509.94 s`.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261114150000_building_separation_and_tenant_contracts` applied to `test-integration` and `dev`; `production` remains at `20261113060000_recovery_security`.
- Target file: [tests/integration/rooms/inventory-and-archival.test.ts](../../../../tests/integration/rooms/inventory-and-archival.test.ts) -> [src/features/rooms/service.ts](../../../../src/features/rooms/service.ts), [src/features/rooms/photos.ts](../../../../src/features/rooms/photos.ts), [src/app/api/rooms/route.ts](../../../../src/app/api/rooms/route.ts), [src/app/api/rooms/photos/[photoId]/route.ts](../../../../src/app/api/rooms/photos/[photoId]/route.ts), [src/app/api/public/room-photos/[photoId]/route.ts](../../../../src/app/api/public/room-photos/[photoId]/route.ts)

## Verified criteria

- `GET /api/rooms` fails closed (`401`) for unauthenticated requests and returns `200` with building-filtered (`?building=TRANSIENT` vs `BOARDING`) `roomTypes`, `rooms`, and `summary` when Owner-authenticated.
- Enforces building-scoped case-insensitive partial unique active `RoomType` names (`RoomType_ownerUserId_building_name_active_key` -> `ConflictError`), rate separation (`BOARDING` monthly vs `TRANSIENT` daily), soft archival (`tombstone` feed entry + blocking new room creation with `PreconditionError`), and restoration.
- `createRoom` and `updateRoom` inherit `baseMonthlyRate` (`BOARDING`) or `transientDailyRate` (`TRANSIENT`) from the selected `RoomType` when rates are omitted, while rejecting cross-building `roomTypeId` references (`PreconditionError`).
- Enforces building-scoped case-insensitive partial unique active room/bed numbers (allowing shared room numbers across `BOARDING` and `TRANSIENT`, and rejecting same-building duplicates `23505` -> `ConflictError`), room `capacity` ceiling on bed creation (`PreconditionError`), and atomic `expectedVersion` checks (`ConflictError`).
- Blocks soft archival of both `Bed` and parent `Room` while active or upcoming allocations exist (`ConflictError`), permits archive after cancellation, emits `tombstone` entries in `ChangeFeed`, and restores room and bed availability cleanly.
- Rejects forged MIME magic-byte photo uploads (`ValidationError`), persists 1 `PREVIEW` photo (`RoomPhoto_room_preview_unique`) plus reordered/edited captioned `GALLERY` photos, restricts unpublished/foreign-Owner access (`404`), and serves published preview + captioned gallery bytes via `GET /api/public/room-photos/[photoId]` (`no-store`, `nosniff`) reflected in `getPublicPublishedAvailability`.
- Isolates room type, room, and room photo mutations/reads strictly to `ownerUserId` (`NotFoundError` / `404` for foreign Owners), and loads Owner-scoped `/rooms/new` (`getRoomCreateContext`) and `/rooms/[roomId]` (`getRoomDetail`, `null` for foreign/unknown IDs).

## Fixture cleanup

Teardown deleted all UUID-prefixed `SecurityRateLimit` (`room-photo-upload:*`), `AuditLog`, `ChangeFeed`, `SyncHead`, `RoomPhoto`, `RoomPhotoIntent`, `Allocation`, `Bed`, `Room`, `RoomType`, `BusinessSettings`, and `Owner` fixtures and asserted zero remaining `RoomPhoto`, `Room`, `RoomType`, and `Owner` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 22:04:52 | pnpm test:integration | 1 passed (suite: 30/30 across 7 files) | 9.56 s (81.07 s suite) |
| 2026-11-13 22:39:25 | pnpm test:integration | 1 passed (suite: 30/30 across 7 files) | 13.10 s (86.49 s suite) |
| 2026-11-13 22:52:06 | pnpm test:integration | 2 passed (suite: 31/31 across 7 files) | 14.60 s (80.17 s suite) |
| 2026-11-14 04:11:35 | pnpm test:integration tests/integration/rooms/inventory-and-archival.test.ts tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/settings/settings-and-devices.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 2 passed (targeted 20/20 across 6 files) | 14.25 s (263.82 s targeted) |
| 2026-11-14 04:33:54 | pnpm test:integration tests/integration/rooms/inventory-and-archival.test.ts tests/integration/transients/transients-and-public-booking.test.ts | 3 passed (targeted 6/6 across 2 files) | 32.99 s (114.48 s targeted) |
| 2026-11-14 11:59:05 | pnpm test:integration tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/rooms/inventory-and-archival.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 4 passed (targeted 23/23 across 5 files) | 47.79 s (314.33 s targeted) |
| 2026-11-15 20:24:10 | pnpm test:integration | 4 passed (suite: 56/56 across 13 files) | 42.73 s (434.42 s suite) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 4 passed (suite: 64/64 across 17 files) | 37.30 s (509.94 s suite) |

