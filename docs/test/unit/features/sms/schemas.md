# Overdue SMS schemas and Semaphore client

- Status: PASS
- Last run: 2026-11-27 18:26:18 (UTC+8)
- Runtime: Windows, Node 26.13.1, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/config/business-config.test.ts tests/unit/features/settings/schemas.test.ts tests/unit/features/sms/schemas.test.ts tests/unit/server/mail/booking-mailer.test.ts`
- Result: 3 passed here (61 ms); suite 220 passed, 0 failed, 0 skipped across 51 files, 3.44 s.
- Target file: [tests/unit/features/sms/schemas.test.ts](../../../../tests/unit/features/sms/schemas.test.ts) -> [src/features/sms/schemas.ts](../../../../src/features/sms/schemas.ts), [src/server/sms/semaphore.ts](../../../../src/server/sms/semaphore.ts)

## Verified criteria

- Normalizes Philippine mobile numbers (`09XXXXXXXXX`, `+639XXXXXXXXX`, `639XXXXXXXXX`, `9XXXXXXXXX`) to `09XXXXXXXXX` and rejects landlines/invalid lengths.
- Renders default and custom overdue SMS templates with all supported placeholders and estimates GSM (160 chars) vs. Unicode (70 chars) SMS credit segments.
- Dispatches form-urlencoded `POST https://api.semaphore.co/api/v4/messages` requests with `apikey`, `number`, `message`, and optional `sendername`, and blocks `"TEST"`-prefixed messages.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-27 18:26:18 | `pnpm test:unit tests/unit/config/business-config.test.ts tests/unit/features/settings/schemas.test.ts tests/unit/features/sms/schemas.test.ts tests/unit/server/mail/booking-mailer.test.ts` | 3 passed (suite: 220/220 across 51 files) | 61 ms (3.44 s suite) |
| 2026-11-22 02:22:19 | `pnpm test:unit tests/unit/features/sms/schemas.test.ts tests/unit/server/jobs/cloudflare-cron.test.ts tests/unit/features/settings/schemas.test.ts` | 5 passed (suite: 181/181 across 46 files) | 143 ms (4.82 s suite) |
| 2026-11-22 03:41:23 | `pnpm test:unit tests/unit/features/sms/schemas.test.ts tests/unit/server/jobs/cloudflare-cron.test.ts` | 5 passed (suite: 181/181 across 46 files) | 61 ms (3.03 s suite) |

