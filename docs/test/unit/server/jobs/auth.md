# Scheduled job bearer authentication

- Status: PASS
- Last run: 2026-11-16 14:14:08 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit` (covers `tests/unit/server/jobs/auth.test.ts`)
- Result: 2 passed here (43 ms); suite 140 passed, 0 failed, 0 skipped across 38 files, 2.37 s.
- Target file: [tests/unit/server/jobs/auth.test.ts](tests/unit/server/jobs/auth.test.ts) -> [src/server/jobs/auth.ts](src/server/jobs/auth.ts)

## Verified criteria

- Fails closed with `503 ServiceUnavailableError` when `CRON_SECRET` is unset.
- Rejects missing, empty, or mismatched Bearer tokens with `401 UnauthenticatedError` via constant-time SHA-256 digest comparison (`timingSafeEqual`).
- Accepts valid matching `CRON_SECRET` Bearer headers.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 14:14:08 | `pnpm test:unit` | 2 passed (suite: 140/140 across 38 files) | 43 ms (2.37 s suite) |
