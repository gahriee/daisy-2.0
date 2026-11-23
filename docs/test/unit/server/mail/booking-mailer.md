# Booking approval mailer

- Status: PASS
- Last run: 2026-11-23 15:29:37 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/server/mail/booking-mailer.test.ts`
- Result: 5 passed here; suite 194 passed, 0 failed, 0 skipped across 48 files, 3.98 s.
- Target file: [tests/unit/server/mail/booking-mailer.test.ts](../../../../tests/unit/server/mail/booking-mailer.test.ts) -> [src/server/mail/booking-mailer.ts](../../../../src/server/mail/booking-mailer.ts)

## Verified criteria

- Builds branded HTML and plain-text booking confirmation email content containing reference code, room title, nights, confirmed total, Google Maps directions (`Get directions`), Grab booking deep link (`Book Grab`), and `/book#track` tracking link without exposing raw latitude/longitude numbers.
- Skips cleanly without creating a transport when SMTP settings are not configured.
- Sends via Nodemailer SMTP transport and handles transport/auth failures without throwing, always closing the transport.
- Resolves fallback SMTP configuration from environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`).
- Sends verification test emails cleanly via `sendTestSmtpEmailSafe`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-22 23:03:57 | `pnpm test:unit tests/unit/features/transients/schemas.test.ts tests/unit/server/mail/booking-mailer.test.ts` | 3 passed (suite: 191/191 across 48 files) | 47 ms (4.40 s suite) |
| 2026-11-23 13:58:11 | `pnpm test:unit tests/unit/server/mail/booking-mailer.test.ts tests/unit/features/settings/schemas.test.ts` | 5 passed (suite: 194/194 across 48 files) | 16 ms (4.27 s suite) |
| 2026-11-23 14:25:57 | `pnpm test:unit tests/unit/server/mail/booking-mailer.test.ts` | 5 passed (suite: 194/194 across 48 files) | 106 ms (3.55 s suite) |
| 2026-11-23 14:32:51 | `pnpm test:unit tests/unit/server/mail/booking-mailer.test.ts` | 5 passed (suite: 194/194 across 48 files) | 16 ms (2.98 s suite) |
| 2026-11-23 14:56:18 | `pnpm test:unit tests/unit/server/mail/booking-mailer.test.ts tests/unit/features/transients/public-booking-view.test.ts` | 5 passed (suite: 194/194 across 48 files) | 3.39 s suite |
| 2026-11-23 15:08:01 | `pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts tests/unit/server/mail/booking-mailer.test.ts` | 5 passed (suite: 194/194 across 48 files) | 3.76 s suite |
| 2026-11-23 15:26:03 | `pnpm test:unit tests/unit/server/mail/booking-mailer.test.ts` | 5 passed (suite: 194/194 across 48 files) | 16 ms (3.45 s suite) |
| 2026-11-23 15:29:37 | `pnpm test:unit tests/unit/server/mail/booking-mailer.test.ts` | 5 passed (suite: 194/194 across 48 files) | 19 ms (3.98 s suite) |
