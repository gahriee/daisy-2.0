# Booking approval mailer

- Status: PASS
- Last run: 2026-11-22 23:03:57 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/transients/schemas.test.ts tests/unit/server/mail/booking-mailer.test.ts`
- Result: 3 passed here (47 ms); suite 191 passed, 0 failed, 0 skipped across 48 files, 4.40 s.
- Target file: [tests/unit/server/mail/booking-mailer.test.ts](../../../../tests/unit/server/mail/booking-mailer.test.ts) -> [src/server/mail/booking-mailer.ts](../../../../src/server/mail/booking-mailer.ts)

## Verified criteria

- Builds branded HTML and plain-text booking confirmation email content containing reference code, room title, nights, confirmed total, and `/book#track` tracking link.
- Skips cleanly without network calls when `RESEND_API_KEY` or `MAIL_FROM` is not configured.
- Sends via Resend HTTP API and handles non-2xx provider responses without throwing.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-22 23:03:57 | `pnpm test:unit tests/unit/features/transients/schemas.test.ts tests/unit/server/mail/booking-mailer.test.ts` | 3 passed (suite: 191/191 across 48 files) | 47 ms (4.40 s suite) |
