# Booking approval & pending-request mailer

- Status: PASS
- Last run: 2026-11-23 21:29:03 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm exec vitest run tests/unit/server/mail/booking-mailer.test.ts`
- Result: 7 passed, 0 failed, 0 skipped across 1 file, 505 ms (12 ms test time).
- Target file: [tests/unit/server/mail/booking-mailer.test.ts](../../../../tests/unit/server/mail/booking-mailer.test.ts) -> [src/server/mail/booking-mailer.ts](../../../../src/server/mail/booking-mailer.ts)

## Verified criteria

- Builds branded HTML and plain-text booking confirmation email content as a check-in pass containing `Check-in pass` reference, room title, nights, 12-hour AM/PM check-in/out times (normalizing 24-hour `14:00`/`12:00` inputs), confirmed total, `Getting here` card with Google Maps directions (`Get directions`) and Grab booking deep link (`Book Grab`), inline CID brand/Grab icons, and arrival reminders — with no `Track booking status` button or tracking link and without exposing raw latitude/longitude numbers.
- Builds branded HTML and plain-text pending-request email content (`Pending review` badge, amber `Request reference` callout with `not a confirmed booking yet`, `Track booking status` CTA, compact `Requested stay` card with 12-hour AM/PM times and `Estimated total`, `What happens next` 2-step guide, inline CID Daisy brand icon) without `Confirmed total`, `Getting here`, or `Book Grab`.
- Skips cleanly without creating a transport when SMTP settings are not configured for both approved and pending-request mailers.
- Sends via Nodemailer SMTP transport and handles transport/auth failures without throwing, always closing the transport, for both approved and pending-request mailers.
- Resolves fallback SMTP configuration from environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`).
- Sends verification test emails cleanly via `sendTestSmtpEmailSafe` for both `"approved"` (default) and `"pending"` templates.

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
| 2026-11-23 21:15:31 | `pnpm exec vitest run tests/unit/server/mail/booking-mailer.test.ts` | 7 passed, 0 failed, 0 skipped (1 file) | 565 ms (14 ms tests) |
| 2026-11-23 21:19:47 | `pnpm exec vitest run tests/unit/server/mail/booking-mailer.test.ts` | 7 passed, 0 failed, 0 skipped (1 file) | 593 ms (16 ms tests) |
| 2026-11-23 21:24:56 | `pnpm exec vitest run tests/unit/server/mail/booking-mailer.test.ts` | 7 passed, 0 failed, 0 skipped (1 file) | 513 ms (12 ms tests) |
| 2026-11-23 21:29:03 | `pnpm exec vitest run tests/unit/server/mail/booking-mailer.test.ts` | 7 passed, 0 failed, 0 skipped (1 file) | 505 ms (12 ms tests) |
