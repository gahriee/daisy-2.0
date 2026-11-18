# Transients, reservations, public booking, billing bridge & sync integration

- Status: PASS for backend and PostgreSQL integration checks; Owner & public UI/device verification PENDING.
- Last run: 2026-11-18 04:06:45 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration tests/integration/transients/transients-and-public-booking.test.ts`
- Result: 5 passed, 0 failed, 0 skipped (`130.82 s`).
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261117210500_booking_request_guest_details` applied to `test-integration` and `dev`; `production` remains unmodified and awaits Owner authorization.
- Target file: [tests/integration/transients/transients-and-public-booking.test.ts](../../../../tests/integration/transients/transients-and-public-booking.test.ts) -> [src/features/transients/service.ts](../../../../src/features/transients/service.ts), [src/features/transients/public-service.ts](../../../../src/features/transients/public-service.ts), [src/features/transients/sync-handler.ts](../../../../src/features/transients/sync-handler.ts), [src/app/api/transients/route.ts](../../../../src/app/api/transients/route.ts), [src/app/api/public/availability/route.ts](../../../../src/app/api/public/availability/route.ts), [src/app/api/public/booking-requests/route.ts](../../../../src/app/api/public/booking-requests/route.ts)

## Verified criteria

- Filters `GET /api/public/availability` (`no-store`) strictly to published `TRANSIENT` rooms without leaking unpublished/boarding rooms or internal notes, rejects unauthenticated owner route (`401`), enforces origin (`403`), DB-backed `SecurityRateLimit` throttling (`429` + `Retry-After`), replays matching `(ownerUserId, idempotencyKey)` payloads cleanly while returning `409` on payload changes, writes identifier-only `AuditLog` (`actorType: "public_visitor"`), and projects PII-free `"New booking request"` notifications (`/transients/requests/<id>`).
- Enforces `ConflictError` when room daily rates changed without Owner confirmation, rolls back cleanly (`PENDING`, zero orphaned guest/reservation) on `AllocationConflictError` during concurrent/occupied bed approval, releases beds immediately via `[startDate, endDate)` allocation truncation on check-out so abutting stays book immediately, issues standard `INV-YYYY-XXXXXX` stay invoices, and settles them through `recordPayment` (`TRANSIENT`, `OR-YYYY-XXXXXX`).
- Processes offline `transient_guest.create` and tentative `transient_reservation.create` via `applyTransientSyncOperation`: preserves exact `opId` replay idempotency (`duplicate`) and surfaces overlapping bed allocations as `"conflict"` (`Needs attention`) rather than silently overwriting confirmed server state.
- Loads Owner-scoped `/transients/listings/[roomId]` detail (`getTransientRoomListingDetail`), returns `null` for cross-Owner or unknown room IDs, rejects transient publishing and booking attempts against `BOARDING` rooms (`PreconditionError`), and permits extended transient stays beyond 60 nights (verified 90-night booking).
- Persists `guestAge`, `guestSex`, `guestAddress`, `adultsCount`, and `childrenCount` via `POST /api/public/booking-requests`, exposes them on `PublicBookingAckDto` and Owner `BookingRequestDto`, rejects same-key `guestAddress` changes with `409`, keeps demographic PII out of `AuditLog`, transfers an `Age / Sex / Address` summary to `TransientGuest.notes` on approval, and scopes `getPublicPublishedRoomAvailability` strictly to unarchived published transient rooms (`null` for unpublished rooms or invalid UUIDs).

## Fixture cleanup

Teardown deleted all UUID-prefixed `NotificationRead`, `SecurityEvent`, `AuditLog`, `ChangeFeed`, `SyncOperationOutcome`, `SyncHead`, `PaymentProof`, `PaymentProofIntent`, `PaymentAllocation`, `Payment`, `InvoiceAdjustment`, `InvoiceItem`, `Invoice`, `Allocation`, `BookingRequest`, `TransientReservation`, `TransientGuest`, `DocumentSequence`, `Bed`, `Room`, `RoomType`, `Device`, `BusinessSettings`, `Owner`, and `SecurityRateLimit` (`auth:` + `public-booking:`) rows and asserted `0` remaining `BookingRequest`, `TransientReservation`, and `Owner` rows for the prefix before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-18 04:06:45 | `pnpm test:integration tests/integration/transients/transients-and-public-booking.test.ts` | 5 passed, 0 failed, 0 skipped | 130.82 s |
| 2026-11-17 21:24:44 | `pnpm test:integration tests/integration/transients/transients-and-public-booking.test.ts` | 5 passed, 0 failed, 0 skipped | 139.05 s |
| 2026-11-14 00:16:18 | pnpm test:integration tests/integration/transients/transients-and-public-booking.test.ts | 3 passed, 0 failed, 0 skipped | 80.38 s |
| 2026-11-14 00:21:56 | pnpm test:integration tests/integration/transients/transients-and-public-booking.test.ts tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/allocations/allocation-engine.test.ts | 3 passed (targeted 14/14 across 4 files) | 78.93 s (206.38 s targeted) |
| 2026-11-14 04:11:35 | pnpm test:integration tests/integration/rooms/inventory-and-archival.test.ts tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/settings/settings-and-devices.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 3 passed (targeted 20/20 across 6 files) | 85.19 s (263.82 s targeted) |
| 2026-11-14 04:33:54 | pnpm test:integration tests/integration/rooms/inventory-and-archival.test.ts tests/integration/transients/transients-and-public-booking.test.ts | 3 passed (targeted 6/6 across 2 files) | 80.18 s (114.48 s targeted) |
| 2026-11-14 11:59:05 | pnpm test:integration tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/payments/payments-proofs-and-sync.test.ts tests/integration/rooms/inventory-and-archival.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 4 passed (targeted 23/23 across 5 files) | 75.06 s (314.33 s targeted) |
| 2026-11-15 20:24:10 | pnpm test:integration | 4 passed (suite: 56/56 across 13 files) | 105.76 s (434.42 s suite) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 4 passed (suite: 64/64 across 17 files) | 106.84 s (509.94 s suite) |

