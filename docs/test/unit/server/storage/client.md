# Private storage client

- Status: PASS
- Last run: 2026-11-13 23:41:44 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 4 passed here (27 ms); suite 84 passed, 0 failed, 0 skipped across 21 files; 1.19 s total suite.
- Scope: 4 tests: missing secrets rejected, client cleanup on provider failure, 60-second download signing and client cleanup, plus `signPrivateUpload`, `putPrivateObject`, and `headPrivateObject` (`null` on `404`) with S3 client destruction.
- External providers are mocked; live checks are recorded separately.

## Run History

| Run (UTC+8) | Result | Duration |
| --- | --- | --- |
| 2026-11-13 11:35:15 | PASS | 505 ms (suite) |
| 2026-11-13 15:43:52 | 3 passed | 597 ms (suite) |
| 2026-11-13 16:03:09 | 3 passed | 620 ms (suite) |
| 2026-11-13 16:07:20 | 3 passed | 608 ms (suite) |
| 2026-11-13 16:20:19 | 3 passed | 546 ms (suite) |
| 2026-11-13 16:36:03 | 3 passed | 604 ms (suite) |
| 2026-11-13 16:40:30 | 3 passed | 562 ms (suite) |
| 2026-11-13 16:43:20 | 3 passed | 491 ms (suite) |
| 2026-11-13 16:50:09 | 3 passed | 484 ms (suite) |
| 2026-11-13 16:55:34 | 3 passed | 509 ms (suite) |
| 2026-11-13 23:41:44 | 4 passed (suite: 84/84 across 21 files) | 27 ms (1.19 s suite) |

### Formatting verification run
- 2026-11-13 13:53:50 (UTC+8): pnpm test:unit passed after Prettier formatting; 25 passed, 0 failed/skipped across 7 files, 618 ms. Existing test criteria unchanged.
