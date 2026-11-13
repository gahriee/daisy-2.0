# Sign-in input validation

- Status: PASS
- Last run: 2026-11-13 16:55:34 (UTC+8)
- Environment: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Results: 4 passed here (8ms); suite 44 passed, 0 failed/skipped, 10 files, 509ms.
- Criteria: email trimming and lowercasing while preserving password characters; accepts legacy non-empty passwords up to 256 characters; rejects malformed or oversized emails (>254 chars); rejects empty or oversized passwords (>256 chars).

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
