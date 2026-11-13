# Restricted auth proxy

- Status: PASS
- Last run: 2026-11-13 16:55:34 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 8 passed here (58ms); suite 44 passed, 0 failed, 0 skipped across 10 files; 509 ms total suite.
- Scope: 8 tests: registration denied, foreign origin rejected, private session projection, tokens omitted with cookies preserved, upstream 401 credential redaction, 429 throttling with forwarded Retry-After, 503 mapping for upstream 5xx/thrown errors, and sign-out JSON `{}` normalization with cookie clearing.
- External providers are mocked; live checks are recorded separately.

## Run History

| Run (UTC+8) | Result | Duration |
| --- | --- | --- |
| 2026-11-13 11:35:15 | PASS | 505 ms (suite) |
| 2026-11-13 15:43:52 | 4 passed | 597 ms (suite) |
| 2026-11-13 16:03:09 | 8 passed | 620 ms (suite) |
| 2026-11-13 16:07:20 | 8 passed | 608 ms (suite) |
| 2026-11-13 16:20:19 | 8 passed | 546 ms (suite) |
| 2026-11-13 16:36:03 | 8 passed | 604 ms (suite) |
| 2026-11-13 16:40:30 | 8 passed | 562 ms (suite) |
| 2026-11-13 16:43:20 | 8 passed | 491 ms (suite) |
| 2026-11-13 16:50:09 | 8 passed | 484 ms (suite) |
| 2026-11-13 16:55:34 | 8 passed | 509 ms (suite) |

### Formatting verification run
- 2026-11-13 13:53:50 (UTC+8): pnpm test:unit passed after Prettier formatting; 25 passed, 0 failed/skipped across 7 files, 618 ms. Existing test criteria unchanged.


### Recovery route integration 2026-11-13 15:10:16 (UTC+8)
- Initial suite failed server-only import after adding recovery service. Added a focused recovery boundary mock; existing 4 proxy assertions unchanged and pass in final 32-test suite (453ms), no skips/failures. Recovery actual route covered in isolated integration suite.
