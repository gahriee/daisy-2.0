# Dashboard pure calculations

- Status: PASS
- Last run: 2026-11-16 14:54:23 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/dashboard/calculations.test.ts tests/unit/features/reports/calculations.test.ts tests/unit/features/reports/csv.test.ts tests/unit/features/reports/schemas.test.ts`
- Result: 6 passed here (6 ms); suite 146 passed, 0 failed, 0 skipped across 39 files, 2.21 s.
- Target file: [tests/unit/features/dashboard/calculations.test.ts](tests/unit/features/dashboard/calculations.test.ts) -> [src/features/dashboard/calculations.ts](src/features/dashboard/calculations.ts)

## Verified criteria

- Returns `null` occupancy percentage when total active rooms is `0` so unavailable ratios stay distinct from `0%`.
- Computes clamped rounded integer occupancy percentages for positive active room counts (`computeOccupancyPercent`).
- Calculates `Asia/Manila` half-open `[startDateManila, nextMonthStartDateManila)` windows including December-to-January year rollover (`getManilaMonthWindow`) and preceding month windows including January-to-December rollover (`getPreviousManilaMonthWindow`).
- Computes non-overdue open receivables (`openBalance - overdueBalance`, clamped at `"0.00"`) in exact centavos (`computeOpenCurrentBalance`).
- Prioritizes active maintenance holds over active occupancy and fallback bed status flags (`deriveRoomUnitStatus`).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 02:24:46 | `pnpm test:unit tests/unit/features/dashboard/calculations.test.ts` | 4 passed (suite: 117/117 across 29 files) | 8 ms (1.63 s suite) |
| 2026-11-16 14:54:23 | `pnpm test:unit ...` | 6 passed (suite: 146/146 across 39 files) | 6 ms (2.21 s suite) |

