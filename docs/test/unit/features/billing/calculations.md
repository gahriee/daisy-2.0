# Billing proration, deposit & numbering calculations

- Status: PASS
- Last run: 2026-11-14 02:04:48 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 5 passed here; suite 98 passed, 0 failed, 0 skipped across 25 files, 1.42 s.
- Target file: [tests/unit/features/billing/calculations.test.ts](../../../../tests/unit/features/billing/calculations.test.ts) -> [src/features/billing/calculations.ts](../../../../src/features/billing/calculations.ts)

## Verified criteria

- Computes exact Asia/Manila half-open calendar month bounds (including leap-year February) and `billingDayOfMonth + gracePeriodDays` due dates.
- Applies `DAILY_EXACT`, `DAILY_30`, `HALF_MONTH`, and `NONE` proration policies using exact `BigInt` centavo arithmetic and explicit `HALF_UP` rounding.
- Computes fractional quantity line totals without floating-point arithmetic.
- Generates initial period security deposit line items (`Monthly room rent` / `Prorated room rent`) and final-month/move-out deposit credit adjustments per `DepositPolicy`.
- Formats Owner-scoped official invoice numbers (`PREFIX-YYYY-000001`).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 23:04:30 | pnpm test:unit | 5 passed (suite: 75/75 across 19 files) | 1.08 s suite |
| 2026-11-14 02:04:48 | pnpm test:unit | 5 passed (suite: 98/98 across 25 files) | 1.42 s suite |

