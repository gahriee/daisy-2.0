# Database client lifecycle

- Status: PASS
- Last run: 2026-11-13 13:53:50 (UTC+8)
- Environment: Windows, Node 26.13.1, Vitest 5.1.0
- Command: node node_modules/vitest/vitest.mjs run tests/unit
- Result: 3 passed, 0 failed, 0 skipped; full suite 9 passed in 511 ms.

## Verified cases

- Calls reuse the same client rather than constructing a pool per call.
- Changing connection configuration disconnects and replaces the prior client.
- Missing configuration fails before connection setup.
- Prisma and the adapter are mocked; these tests do not prove a live connection.

## Run History

| Run (UTC+8) | Result | Duration |
| --- | --- | --- |
| 2026-11-13 10:47:09 | 3 passed | 511 ms (suite) |

### Neon integration reruns (2026-11-13 11:36:53 UTC+8)
- pnpm test:unit: unchanged database tests passed in the 21-test (467 ms), 21-test (435 ms) and 24-test (505 ms) suites. No failures or skips.

### Formatting verification run
- 2026-11-13 13:53:50 (UTC+8): pnpm test:unit passed after Prettier formatting; 25 passed, 0 failed/skipped across 7 files, 618 ms. Existing test criteria unchanged.
