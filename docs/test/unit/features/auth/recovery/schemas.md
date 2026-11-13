# Recovery validation and notification projection

- Status: PASS
- Last run: 2026-11-13 16:55:34 (UTC+8)
- Environment: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Results: 7 passed here (10ms); suite 44 passed, 0 failed/skipped, 10 files, 509ms.
- Criteria: email normalization/allowlist projection; reject malformed/oversized OTP and short/oversized passwords; routine events audit-only; success notification Owner-scoped with explicit destination.

## Run History

| Run (UTC+8) | Result | Duration |
| --- | --- | --- |
| 2026-11-13 14:41 | 7 passed | 798ms suite |
| 2026-11-13 15:02 | 7 passed | 453ms suite |
| 2026-11-13 15:43 | 7 passed | 597ms suite |
| 2026-11-13 16:03:09 | 7 passed | 620ms suite |
| 2026-11-13 16:07:20 | 7 passed | 608ms suite |
| 2026-11-13 16:20:19 | 7 passed | 546ms suite |
| 2026-11-13 16:36:03 | 7 passed | 604ms suite |
| 2026-11-13 16:40:30 | 7 passed | 562ms suite |
| 2026-11-13 16:43:20 | 7 passed | 491ms suite |
| 2026-11-13 16:50:09 | 7 passed | 484ms suite |
| 2026-11-13 16:55:34 | 7 passed | 509ms suite |
