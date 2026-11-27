# Business settings validation schemas

- Status: PASS
- Last run: 2026-11-27 18:26:18 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/config/business-config.test.ts tests/unit/features/settings/schemas.test.ts tests/unit/features/sms/schemas.test.ts tests/unit/server/mail/booking-mailer.test.ts`
- Result: 3 passed here (17 ms); suite 220 passed, 0 failed, 0 skipped across 51 files, 3.44 s.
- Target file: [tests/unit/features/settings/schemas.test.ts](../../../../tests/unit/features/settings/schemas.test.ts) -> [src/features/settings/schemas.ts](../../../../src/features/settings/schemas.ts)

## Verified criteria

- Validates the simplified `property` settings module (trimmed boarding house name, optional phone/address/TIN, check-in/out times, and overdue SMS toggle + send time) alongside `hasCompleteFinancialPolicies` and `hasCompleteStaySchedule`.
- Rejects blank business names, invalid 24-hour wall times (`25:00`, `25:99`), and retired settings modules (`profile`, `policies`, `operations`, `sms`, `email`).
- Parses house rules cleanly via `parseHouseRulesList` without implicit default fallbacks (`[]` for `null`/blank) and serializes/validates `house_rules` module updates via `serializeHouseRulesList`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-27 18:26:18 | `pnpm test:unit tests/unit/config/business-config.test.ts tests/unit/features/settings/schemas.test.ts tests/unit/features/sms/schemas.test.ts tests/unit/server/mail/booking-mailer.test.ts` | 3 passed (suite: 220/220 across 51 files) | 17 ms (3.44 s suite) |
| 2026-11-23 13:14:12 | `pnpm test:unit tests/unit/features/settings/schemas.test.ts` | 5 passed (suite: 192/192 across 48 files) | 31 ms (3.54 s suite) |
| 2026-11-23 13:05:35 | `pnpm test:unit tests/unit/features/settings/schemas.test.ts` | 5 passed (suite: 192/192 across 48 files) | 63 ms (3.69 s suite) |
| 2026-11-23 12:38:00 | `pnpm test:unit tests/unit/features/settings/schemas.test.ts` | 5 passed (suite: 192/192 across 48 files) | 35 ms (4.01 s suite) |
| 2026-11-13 23:25:21 | pnpm test:unit | 4 passed (suite: 76/76 across 19 files) | 16 ms (995 ms suite) |
| 2026-11-13 18:30:47 | pnpm test:unit | 3 passed (suite: 55/55 across 13 files) | 12 ms (1.06 s suite) |

