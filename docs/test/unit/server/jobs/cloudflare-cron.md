# Cloudflare Worker Cron dispatcher

- Status: PASS
- Last run: 2026-11-16 23:52:29 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/server/db/client.test.ts tests/unit/server/jobs/cloudflare-cron.test.ts`
- Result: 3 passed here (58 ms); suite 159 passed, 0 failed, 0 skipped across 41 files, 2.93 s.
- Target file: [tests/unit/server/jobs/cloudflare-cron.test.ts](tests/unit/server/jobs/cloudflare-cron.test.ts) -> [src/server/jobs/cloudflare-cron.ts](src/server/jobs/cloudflare-cron.ts)

## Verified criteria

- Maps documented schedules `15 16 * * *` -> `/api/jobs/billing/generate` and `45 18 * * *` -> `/api/jobs/maintenance/cleanup`, returning `null` for unsupported schedules.
- Dispatches authorized internal `POST` requests with `Authorization: Bearer <CRON_SECRET>`, `Content-Type: application/json` (`{}`), and normalized `APP_ORIGIN` origin header.
- Fails closed without calling `fetcher` when `CRON_SECRET` is blank/missing, and throws safe HTTP status errors on non-2xx responses without leaking secrets.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 23:52:29 | `pnpm test:unit tests/unit/server/db/client.test.ts tests/unit/server/jobs/cloudflare-cron.test.ts` | 3 passed (suite: 159/159 across 41 files) | 58 ms (2.93 s suite) |

