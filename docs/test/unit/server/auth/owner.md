# Owner session authority

- Status: PASS
- Last run: 2026-11-13 16:55:34 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 5 passed here (11ms); suite 44 passed, 0 failed, 0 skipped across 10 files; 509 ms total suite.
- Scope: 5 tests: missing Owner binding; valid, foreign, expired and mismatched sessions. Fresh provider query required.
- External providers are mocked; live checks are recorded separately.

## Run History

| Run (UTC+8) | Result | Duration |
| --- | --- | --- |
| 2026-11-13 11:35:15 | PASS | 505 ms (suite) |
| 2026-11-13 15:43:52 | 5 passed | 597 ms (suite) |
| 2026-11-13 16:03:09 | 5 passed | 620 ms (suite) |
| 2026-11-13 16:07:20 | 5 passed | 608 ms (suite) |
| 2026-11-13 16:20:19 | 5 passed | 546 ms (suite) |
| 2026-11-13 16:36:03 | 5 passed | 604 ms (suite) |
| 2026-11-13 16:40:30 | 5 passed | 562 ms (suite) |
| 2026-11-13 16:43:20 | 5 passed | 491 ms (suite) |
| 2026-11-13 16:50:09 | 5 passed | 484 ms (suite) |
| 2026-11-13 16:55:34 | 5 passed | 509 ms (suite) |

### Formatting verification run
- 2026-11-13 13:53:50 (UTC+8): pnpm test:unit passed after Prettier formatting; 25 passed, 0 failed/skipped across 7 files, 618 ms. Existing test criteria unchanged.
