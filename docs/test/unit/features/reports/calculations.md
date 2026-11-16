# Reports pure analytics calculations

- Status: PASS
- Last run: 2026-11-16 14:54:23 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/dashboard/calculations.test.ts tests/unit/features/reports/calculations.test.ts tests/unit/features/reports/csv.test.ts tests/unit/features/reports/schemas.test.ts`
- Result: 4 passed here (13 ms); suite 146 passed, 0 failed, 0 skipped across 39 files, 2.21 s.
- Target file: [tests/unit/features/reports/calculations.test.ts](tests/unit/features/reports/calculations.test.ts) -> [src/features/reports/calculations.ts](src/features/reports/calculations.ts)

## Verified criteria

- Computes safe integer share percentages (`computeSharePercent`) including zero denominators.
- Computes exact `BigInt` centavo ratio percentages (`computeMoneyRatioPercent`) and per-unit currency averages with explicit `HALF_UP` rounding (`computePerUnitMoney`).
- Classifies boarding lease expiration buckets (`PAST_END`, `WITHIN_30`, `DAYS_31_90`, `DAYS_91_PLUS`) relative to the `Asia/Manila` as-of date.
- Aggregates payment collections and reversals into daily (`<= 31` days), 7-day weekly (`<= 140` days), and monthly (`> 140` days) trend points (`buildCollectionTrendPoints`).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 14:54:23 | `pnpm test:unit ...` | 4 passed (suite: 146/146 across 39 files) | 13 ms (2.21 s suite) |

