# Business settings, devices, notifications and auth limits

- Status: PASS for backend and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-17 01:00:38 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration tests/integration/settings/settings-and-devices.test.ts`
- Result: 5 passed here (`8.63 s` targeted).
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261117010000_notification_dismissals` applied to `test-integration` and `dev`; `production` remains at `20261113060000_recovery_security`.

## Verified criteria

- Initial `getBusinessSettings` returns `version: 0`, `policiesComplete: false`, `stayScheduleComplete: false`, and `null` financial policy fields; `updateBusinessSettings` increments `version` to `1`, rejects stale `expectedVersion` with `ConflictError`, and records an identifier-only `settings.updated` `AuditLog` row.
- `updateBusinessSettingsModule` persists `policies`, `operations`, and `profile` independently without overwriting sibling module columns and reports `policiesComplete` vs `stayScheduleComplete` separately.
- `/api/devices` and `/api/devices/**` fail closed for unauthenticated callers (`401`) and foreign origins (`403`); `POST /api/devices/register` issues a 256-bit `HttpOnly; SameSite=Strict` `daisy_device` cookie (`201`), reuses an active registered cookie (`200`, `reused: true`), omits `tokenHash` from `GET /api/devices`, handles concurrent `POST /api/devices/[deviceId]/revoke` calls idempotently (`200`), returns `404` for unknown/foreign IDs, and causes `lockActiveDeviceForShare` to reject revoked devices with `ForbiddenError`.
- Concurrent `consumeAuthLimit(..., "login")` calls in PostgreSQL atomically permit 10 attempts and throttle 2 of 12 with non-zero `Retry-After`.
- `GET /api/notifications` projects independent `settings:financial-policy-incomplete` (`/settings/policies`), `settings:stay-schedule-incomplete` (`/settings/operations`), and `SecurityEvent` (`RESET_COMPLETED`) notifications per Owner, `POST /api/notifications/read` persists `NotificationRead` rows so subsequent reads reflect `read: true`, `POST /api/notifications/unread` deletes `NotificationRead` rows so subsequent reads revert to `read: false`, and `POST /api/notifications/delete` persists `NotificationDismissal` rows (clearing matching `NotificationRead` rows) so dismissed alerts are omitted from subsequent reads without altering underlying records.

## Fixture cleanup

Teardown deleted all UUID-prefixed `NotificationDismissal`, `NotificationRead`, `AuditLog`, `ChangeFeed`, `SyncOperationOutcome`, `SyncHead`, `Device`, `BusinessSettings`, `Owner`, `SecurityEvent`, and `SecurityRateLimit` test rows and asserted zero remaining `Owner`, `SecurityEvent`, and `SecurityRateLimit` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-17 01:00:38 | `pnpm test:integration tests/integration/settings/settings-and-devices.test.ts` | 5 passed (targeted) | 8.63 s |
| 2026-11-13 18:30:47 | pnpm test:integration | 4 passed (suite: 23/23 across 3 files) | 6.51 s (29.03 s suite) |
| 2026-11-13 22:04:52 | pnpm test:integration | 4 passed (suite: 30/30 across 7 files) | 4.71 s (81.07 s suite) |
| 2026-11-13 23:25:23 | pnpm test:integration tests/integration/settings/settings-and-devices.test.ts | 5 passed (targeted) | 7.87 s |
| 2026-11-14 04:11:35 | pnpm test:integration tests/integration/rooms/inventory-and-archival.test.ts tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/settings/settings-and-devices.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 5 passed (targeted 20/20 across 6 files) | 9.35 s (263.82 s targeted) |
| 2026-11-14 11:23:32 | pnpm test:integration tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/settings/settings-and-devices.test.ts | 5 passed (targeted 8/8 across 2 files) | 6.44 s (50.87 s targeted) |
| 2026-11-16 23:31:26 | `pnpm test:integration` | 5 passed (suite: 64/64 across 17 files) | 5.67 s (509.94 s suite) |

