# Restricted auth proxy

- Status: PASS
- Last run: 2026-11-13 13:53:50 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 10.28.2, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 24 passed, 0 failed, 0 skipped across 6 files; 505 ms total suite.
- Scope: 4 tests: registration denied, foreign origin rejected, private session projection, tokens omitted with cookies preserved.
- External providers are mocked; live checks are recorded separately.

## Run History

| Run (UTC+8) | Result | Duration |
| --- | --- | --- |
| 2026-11-13 11:35:15 | PASS | 505 ms (suite) |

### Formatting verification run
- 2026-11-13 13:53:50 (UTC+8): pnpm test:unit passed after Prettier formatting; 25 passed, 0 failed/skipped across 7 files, 618 ms. Existing test criteria unchanged.


### Recovery route integration 2026-11-13 15:10:16 (UTC+8)
- Initial suite failed server-only import after adding recovery service. Added a focused recovery boundary mock; existing 4 proxy assertions unchanged and pass in final 32-test suite (453ms), no skips/failures. Recovery actual route covered in isolated integration suite.
