# Recovery validation and notification projection

- Status: PASS
- Last run: 2026-11-13 15:10:16 (UTC+8)
- Environment: Windows, Node 26.13.1, Vitest 5.1.0
- Command: pnpm test:unit
- Results: 7 tests passed here; suite 32 passed, 0 failed/skipped, 8 files, 453ms.
- Criteria: email normalization/allowlist projection; reject malformed/oversized OTP and short/oversized passwords; routine events audit-only; success notification Owner-scoped with explicit destination.

## Run History

| Run (UTC+8) | Result | Duration |
| --- | --- | --- |
| 2026-11-13 14:41 | 7 passed | 798ms suite |
| 2026-11-13 15:02 | 7 passed | 453ms suite |
