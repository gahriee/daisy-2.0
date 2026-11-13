# Audit filter validation schemas

- Status: PASS
- Last run: 2026-11-13 18:43:11 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 3 passed here (7 ms); suite 58 passed, 0 failed, 0 skipped across 14 files, 962 ms.
- Target file: [tests/unit/features/audit/schemas.test.ts](tests/unit/features/audit/schemas.test.ts) -> [src/features/audit/schemas.ts](src/features/audit/schemas.ts)

## Verified criteria

- Trims and normalizes blank `query`, `action`, `fromDate`, and `toDate` values to `undefined` while defaulting `area` to `"all"` and `limit` to `50`.
- Accepts valid `Asia/Manila` dates (`YYYY-MM-DD`) paired with multi-field `query` strings and bounded limits.
- Rejects impossible calendar dates (e.g., `2026-02-29`) and inverted ranges where `fromDate > toDate`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 18:43:11 | pnpm test:unit | 3 passed (suite: 58/58 across 14 files) | 7 ms (962 ms suite) |

