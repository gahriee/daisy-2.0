# Owner password recovery

- Status: PASS for isolated backend tests and production activation; live email/device checks PENDING.
- Last run: 2026-11-13 22:04:52 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0, Prisma 7.10.1, Neon PostgreSQL (Singapore).
- Command: pnpm test:integration
- Final metrics: 17 passed, 0 failed, 0 skipped (17.19 s here; 30/30 suite across 7 files, 81.07 s).
- Target: explicitly opted-in expiring schema-only branch `test-integration` (`br-broad-river-b30q4qrw`), never production. Ignored .env.test.local supplies TEST_DATABASE_URL; config refuses runtime host/database (including pooled aliases).
- Migration: 20261113060000_recovery_security applied only to the test branch; no provider auth table modified. Generated schema validated and client generated successfully.

## Verified criteria

- Route reaches managed SDK only after origin, JSON/body-size, schema and Owner/email checks.
- Bound Owner request emits identifier-only request audit and correct OTP provider path.
- Concurrent send requests atomically allow 3 and reject 5 of 8 with Retry-After.
- Confirmed reset records attempt/completion and projects an allowlisted Owner-scoped notification.
- Foreign email is acknowledged generically without provider invocation, and cannot spend the Owner's per-address quota.
- Email bucket keys are HMACs; plaintext emails and passwords absent from audit/counters.
- Invalid origin, short password, oversized stream, malformed JSON and raw provider endpoints fail closed.
- Provider failures and throttling do not expose tokens, response bodies or cookies.
- Missing Owner binding and failed durable attempt audit prevent provider invocation.
- Lost acknowledgements, malformed success and completion-audit failure preserve uncertain-outcome recovery.
- Expired counters renew using database time; provider-rejected replay adds no second completion.
- Actual provider-table lookup returns false for run-owned nonexistent identities; no provider records created.

## Fixture cleanup

Every suite run deleted only its UUID-prefixed SecurityEvent and SecurityRateLimit fixtures.
Teardown queried counts and verified zero remaining rows before disconnecting. No cleanup failures.
External Auth is mocked, so no real code, email, password change or sessions were created.
The isolated branch has a three-hour expiry and its credentials remain in ignored .env.test.local.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 14:38 | pnpm test:integration | 9 passed | 4.55s |
| 2026-11-13 14:58 | pnpm test:integration | 14 passed | 5.78s |
| 2026-11-13 15:00 | pnpm test:integration | 14 passed after quota isolation | 14.18s |
| 2026-11-13 15:02 | pnpm test:integration | 17 passed final | 21.48s |
| 2026-11-13 18:19 | pnpm test:integration | 17 passed (`test-integration` schema-only branch) | 18.42s |
| 2026-11-13 22:04:52 | pnpm test:integration | 17 passed (suite: 30/30 across 7 files) | 17.19 s (81.07 s suite) |

## Code/build checks and retained failures

- Initial unit run: 21 passed; proxy suite failed importing server-only recovery service. Mocked new recovery boundary in the existing proxy unit suite; final 32/32 pass in 453ms (earlier 32/32 in 798ms).
- pnpm lint, typecheck and format:check pass.
- Initial production build compiled and typed but failed Next.js instant-navigation validation around connection(). Read installed Next.js docs; explicitly made recovery request-rendered with instant=false.
- One build retry was not executed because automatic approval review hit usage limits; after user asked to continue, approved retry passed: compile 3.5s, TypeScript 4.4s, seven static pages in 1078ms, /auth/reset-password dynamic.
- Source-only reviewer found native GET fallback, lost-response uncertainty and unrelated-email quota exhaustion; all fixed and scored resolved. No browser, UI tests, DOM audits or real-device checks.
- Impeccable doctor: findings=[] after aligning sidecar recovery guidance.

## Activation status

The Owner explicitly approved production activation. Migration 20261113060000_recovery_security
was applied; Prisma reports the schema up to date. Database connection check passed
with GMT (UTC-equivalent). Neon readback confirms enabled=true, disable_sign_up=true
and revoke_sessions_on_password_reset=true. No live email, password reset or account
mutation was performed as verification. Custom SMTP remains required before launch.

## Owner checklist after activation

1. Use /auth/reset-password at 360px. Labels, feedback and actions must reflow without horizontal scrolling.
2. Request a code using the existing Owner's real inbox; check inbox/spam. Other addresses receive generic acknowledgement only.
3. Enter a wrong/expired code and mismatched password; error text must associate with fields, focus must be useful and inputs preserved.
4. Use the valid code and matching 12–128 character passwords; success clears sensitive state. A reused code must fail.
5. Tab/Shift+Tab, Enter and mobile autofill must work; pending actions disable duplicate submissions. Check reduced motion and visible focus.
6. In airplane mode, submit: show unconfirmed outcome and keep inputs. Reconnect deliberately; recovery never enters offline storage/sync. Throttled requests explain retry time.

### Production activation run — 2026-11-13 15:14:22 (UTC+8)
- Environment: Windows/Node26.13.1/pnpm10.28.2/NeonCLI9.4.0, explicitly authorized production branch.
- pnpm db:deploy: PASS, one migration applied. prisma migrate status: PASS, database schema up to date.
- pnpm db:check: PASS, neondb connected, GMT timezone.
- Neon config update/readback: PASS, email enabled, signup disabled, reset session revocation enabled. Combined activation/verification command exited0.
- Production fixture metrics: 0 fixtures, 0 business records, no cleanup needed. No live email or password reset attempted.
