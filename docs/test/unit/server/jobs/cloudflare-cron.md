# Cloudflare Worker Cron dispatcher

- Status: PASS
- Last run: 2026-11-22 03:41:23 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/sms/schemas.test.ts tests/unit/server/jobs/cloudflare-cron.test.ts`
- Result: 3 passed here (55 ms); suite 181 passed, 0 failed, 0 skipped across 46 files, 3.03 s.
- Target file: [tests/unit/server/jobs/cloudflare-cron.test.ts](tests/unit/server/jobs/cloudflare-cron.test.ts) -> [src/server/jobs/cloudflare-cron.ts](src/server/jobs/cloudflare-cron.ts)

## Verified criteria

- Maps documented schedules `15 16 * * *` -> `/api/jobs/billing/generate`, `*/30 * * * *` -> `/api/jobs/billing/overdue-sms`, and `45 18 * * *` -> `/api/jobs/maintenance/cleanup`, returning `null` for unsupported schedules.
- Dispatches authorized internal `POST` requests with `Authorization: Bearer <CRON_SECRET>`, `Content-Type: application/json` (`{}`), and normalized `APP_ORIGIN` origin header.
- Fails closed without calling `fetcher` when `CRON_SECRET` is blank/missing, and throws safe HTTP status errors on non-2xx responses without leaking secrets.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 23:52:29 | `pnpm test:unit tests/unit/server/db/client.test.ts tests/unit/server/jobs/cloudflare-cron.test.ts` | 3 passed (suite: 159/159 across 41 files) | 58 ms (2.93 s suite) |
| 2026-11-22 02:22:19 | `pnpm test:unit tests/unit/features/sms/schemas.test.ts tests/unit/server/jobs/cloudflare-cron.test.ts tests/unit/features/settings/schemas.test.ts` | 3 passed (suite: 181/181 across 46 files) | 53 ms (4.82 s suite) |
| 2026-11-22 03:41:23 | `pnpm test:unit tests/unit/features/sms/schemas.test.ts tests/unit/server/jobs/cloudflare-cron.test.ts` | 3 passed (suite: 181/181 across 46 files) | 55 ms (3.03 s suite) |

