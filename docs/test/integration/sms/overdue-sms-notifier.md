# Boarding house overdue SMS notifier (Semaphore) integration

- Status: BLOCKED
- Last run: 2026-11-27 18:27:57 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, Neon PostgreSQL (`test-integration`)
- Command: `pnpm test:integration tests/integration/sms/overdue-sms-notifier.test.ts`
- Result: 0 passed, 1 failed (1.17 s) — blocked by `TEST_DATABASE_URL` authentication failure (`Authentication failed against the database server`).
- Target file: [tests/integration/sms/overdue-sms-notifier.test.ts](tests/integration/sms/overdue-sms-notifier.test.ts) -> [src/features/sms/service.ts](src/features/sms/service.ts), [src/features/settings/service.ts](src/features/settings/service.ts), [src/app/api/jobs/billing/overdue-sms/route.ts](src/app/api/jobs/billing/overdue-sms/route.ts)

## Blocker

- Connecting to `TEST_DATABASE_URL` returned `Authentication failed against the database server` (credentials on the test database branch are invalid or rotated). Migration `20261122021500_overdue_sms_notifier` was applied to `dev` (`ep-fragrant-pond-b39ua8yz.c-4.ap-southeast-1.aws.neon.tech`), while `test-integration` migration deployment and integration test execution remain pending valid `TEST_DATABASE_URL` credentials.

## Verified criteria (pending valid `TEST_DATABASE_URL`)

- Encrypts Semaphore API key in `BusinessSettings`, exposes only `smsApiKeyConfigured` + `smsApiKeyLast4`, and never returns plaintext.
- Sends overdue SMS reminders only to boarding house tenant invoices (`tenantId IS NOT NULL`) with valid PH mobile numbers, skipping missing-phone tenants and rejecting transient stay invoices.
- Deduplicates same-day sends via `OverdueSmsLog` `(ownerUserId, invoiceId, notifiedDateManila)` and writes identifier-only `billing.overdue_sms_sent` `AuditLog` entries without PII or secrets.
- Enforces `CRON_SECRET` Bearer authentication on `POST /api/jobs/billing/overdue-sms`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-22 02:22:25 | `pnpm test:integration tests/integration/sms/overdue-sms-notifier.test.ts` | 0 passed, 1 failed (DB auth error on `TEST_DATABASE_URL`) | 1.17 s |
| 2026-11-27 18:27:57 | `pnpm test:integration tests/integration/settings/settings-and-devices.test.ts ...` (6 files) | 0 passed, 1 failed — blocked: `TEST_DATABASE_URL` authentication failed; no database substituted | 765 ms (13.89 s batch) |

