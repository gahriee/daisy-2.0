# Server business environment configuration

- Status: PASS
- Last run: 2026-11-27 18:26:18 (UTC+8)
- Runtime: Windows, Node 26.13.1, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/config/business-config.test.ts tests/unit/features/settings/schemas.test.ts tests/unit/features/sms/schemas.test.ts tests/unit/server/mail/booking-mailer.test.ts`
- Result: 3 passed here (15 ms); suite 220 passed, 0 failed, 0 skipped across 51 files, 3.44 s.
- Target file: [tests/unit/config/business-config.test.ts](../../../tests/unit/config/business-config.test.ts) -> [src/config/business-config.ts](../../../src/config/business-config.ts)

## Verified criteria

- Resolves documented Philippine boarding-house defaults when env vars are unset (`BILLING_DAY_OF_MONTH=1`, `BILLING_GRACE_PERIOD_DAYS=5`, `DAILY_EXACT`, `HOLD_SEPARATE`, `CREDIT_NEXT_INVOICE`, `INV-`, `RCP-`, `OFFLINE_UNLOCK_MAX_DAYS=7`, `PROOF_MAX_MB=5`, `PROOF_MAX_FILES_PER_RECORD=5`, `14:00`/`12:00`, unconfigured SMS/SMTP).
- Parses and normalizes valid env overrides for billing policies, operational limits, Semaphore SMS credentials/template/frequency, and SMTP credentials including `MAIL_FROM_NAME`.
- Rejects invalid non-empty env values (`BILLING_DAY_OF_MONTH`, `BILLING_PRORATION_POLICY`, `INVOICE_PREFIX`, `DEFAULT_CHECK_IN_TIME`, `PROOF_MAX_MB`, `SEMAPHORE_SENDER_NAME`, `SEMAPHORE_OVERDUE_TEMPLATE` starting with `TEST`, `SEMAPHORE_OVERDUE_FREQUENCY_DAYS`) with clear configuration errors naming the offending variable.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-27 18:26:18 | `pnpm test:unit tests/unit/config/business-config.test.ts tests/unit/features/settings/schemas.test.ts tests/unit/features/sms/schemas.test.ts tests/unit/server/mail/booking-mailer.test.ts` | 3 passed (suite: 220/220 across 51 files) | 15 ms (3.44 s suite) |

