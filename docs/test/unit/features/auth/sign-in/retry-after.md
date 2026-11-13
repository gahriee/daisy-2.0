# Sign-in Retry-After parsing and wait copy

- Status: PASS
- Last run: 2026-11-13 16:55:34 (UTC+8)
- Environment: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Results: 4 passed here (8ms); suite 44 passed, 0 failed/skipped, 10 files, 509ms.
- Criteria: parses positive integer delay-seconds and future HTTP-dates; rejects zero, negative, empty, non-finite (`Infinity`, `NaN`), malformed, and elapsed values; formats seconds under 60s and singular/plural minutes from 60s up without contradictory "shortly" copy.

## Run History

| Run (UTC+8) | Result | Duration |
| --- | --- | --- |
| 2026-11-13 16:03:09 | 4 passed | 620ms suite |
| 2026-11-13 16:07:20 | 4 passed | 608ms suite |
| 2026-11-13 16:20:19 | 4 passed | 546ms suite |
| 2026-11-13 16:36:03 | 4 passed | 604ms suite |
| 2026-11-13 16:40:30 | 4 passed | 562ms suite |
| 2026-11-13 16:43:20 | 4 passed | 491ms suite |
| 2026-11-13 16:50:09 | 4 passed | 484ms suite |
| 2026-11-13 16:55:34 | 4 passed | 509ms suite |
