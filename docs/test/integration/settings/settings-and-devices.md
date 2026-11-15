# Business settings, devices, notifications and auth limits

- Status: PASS for backend and PostgreSQL integration checks; Owner UI/device verification PENDING.
- Last run: 2026-11-14 11:23:32 (UTC+8)
- Runtime: Windows, Vitest 5.1.0, Neon PostgreSQL (Singapore).
- Command: `pnpm test:integration tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/settings/settings-and-devices.test.ts`
- Result: 5 passed here (`6.44 s`); targeted 8 passed, 0 failed, 0 skipped across 2 files, `50.87 s`.
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`ep-super-paper-b3f9xatn`) via ignored `.env.test.local` (`TEST_DATABASE_URL`). Never production.
- Migration: `20261114111500_tenant_notes` applied to `test-integration` and `dev`; `production` untouched.

## Verified criteria

- Initial `getBusinessSettings` returns `version: 0`, `policiesComplete: false`, `stayScheduleComplete: false`, and `null` financial policy fields; `updateBusinessSettings` increments `version` to `1`, rejects stale `expectedVersion` with `ConflictError`, and records an identifier-only `settings.updated` `AuditLog` row.
- `updateBusinessSettingsModule` persists `policies`, `operations`, and `profile` independently without overwriting sibling module columns and reports `policiesComplete` vs `stayScheduleComplete` separately.
- `/api/devices` and `/api/devices/**` fail closed for unauthenticated callers (`401`) and foreign origins (`403`); `POST /api/devices/register` issues a 256-bit `HttpOnly; SameSite=Strict` `daisy_device` cookie (`201`), reuses an active registered cookie (`200`, `reused: true`), omits `tokenHash` from `GET /api/devices`, handles concurrent `POST /api/devices/[deviceId]/revoke` calls idempotently (`200`), returns `404` for unknown/foreign IDs, and causes `lockActiveDeviceForShare` to reject revoked devices with `ForbiddenError`.
- Concurrent `consumeAuthLimit(..., "login")` calls in PostgreSQL atomically permit 10 attempts and throttle 2 of 12 with non-zero `Retry-After`.
- `GET /api/notifications` projects independent `settings:financial-policy-incomplete` (`/settings/policies`), `settings:stay-schedule-incomplete` (`/settings/operations`), and `SecurityEvent` (`RESET_COMPLETED`) notifications per Owner, and `POST /api/notifications/read` persists `NotificationRead` rows so subsequent reads reflect `read: true`.

## Fixture cleanup

Teardown deleted all UUID-prefixed `NotificationRead`, `AuditLog`, `ChangeFeed`, `SyncOperationOutcome`, `SyncHead`, `Device`, `BusinessSettings`, `Owner`, `SecurityEvent`, and `SecurityRateLimit` test rows and asserted zero remaining `Owner`, `SecurityEvent`, and `SecurityRateLimit` rows before disconnecting.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 18:30:47 | pnpm test:integration | 4 passed (suite: 23/23 across 3 files) | 6.51 s (29.03 s suite) |
| 2026-11-13 22:04:52 | pnpm test:integration | 4 passed (suite: 30/30 across 7 files) | 4.71 s (81.07 s suite) |
| 2026-11-13 23:25:23 | pnpm test:integration tests/integration/settings/settings-and-devices.test.ts | 5 passed (targeted) | 7.87 s |
| 2026-11-14 04:11:35 | pnpm test:integration tests/integration/rooms/inventory-and-archival.test.ts tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/billing/invoicing-and-lifecycle.test.ts tests/integration/settings/settings-and-devices.test.ts tests/integration/transients/transients-and-public-booking.test.ts tests/integration/maintenance/maintenance-and-holds.test.ts | 5 passed (targeted 20/20 across 6 files) | 9.35 s (263.82 s targeted) |
| 2026-11-14 11:23:32 | pnpm test:integration tests/integration/tenants/tenants-and-assignments.test.ts tests/integration/settings/settings-and-devices.test.ts | 5 passed (targeted 8/8 across 2 files) | 6.44 s (50.87 s targeted) |

