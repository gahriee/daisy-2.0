# Table sort helpers

- Status: PASS
- Last run: 2026-11-14 02:39:27 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 5 passed here (7 ms); suite 103 passed, 0 failed, 0 skipped across 26 files, 1.45 s.
- Target file: [tests/unit/lib/table-sort.test.ts](tests/unit/lib/table-sort.test.ts) -> [src/lib/table-sort.ts](src/lib/table-sort.ts)

## Verified criteria

- Toggles active sort columns using each column's `defaultDirection` on first activation and reverses `asc`/`desc` on repeated clicks (`toggleSortState`).
- Sorts text naturally and case-insensitively (`Intl.Collator("en", { numeric: true, sensitivity: "base" })`) while preserving original row order on ties (`sortRows`).
- Compares peso currency decimals using exact `BigInt` centavos (`parseMoneyDecimal`) without floating-point drift, keeping empty/`null` values last in both directions.
- Sorts ISO dates and timestamps chronologically and keeps numeric `0` distinct from `null`/empty values.
- Returns a fresh shallow copy in original order when sort state is `null`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-14 02:39:27 | pnpm test:unit | 5 passed (suite: 103/103 across 26 files) | 7 ms (1.45 s suite) |

