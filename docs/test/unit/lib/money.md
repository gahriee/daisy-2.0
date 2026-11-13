# Money centavo helpers

- Status: PASS
- Last run: 2026-11-13 18:30:47 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 3 passed here (8 ms); suite 55 passed, 0 failed, 0 skipped across 13 files, 1.06 s.
- Target file: [tests/unit/lib/money.test.ts](tests/unit/lib/money.test.ts) -> [src/lib/money.ts](src/lib/money.ts)

## Verified criteria

- Parses and formats exact centavos (`BigInt`) without floating-point drift (`formatMoneyDecimal`, `formatPhpCurrency`).
- Rejects empty, over-precise (`> 2` decimals), scientific-notation, and symbol-prefixed monetary strings with `RangeError`.
- Performs exact integer arithmetic (`addMoney`, `subtractMoney`, `compareMoney`) and `HALF_UP` proration (`prorateMoneyHalfUp`), throwing `RangeError` on invalid numerators or non-positive denominators.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 18:30:47 | pnpm test:unit | 3 passed (suite: 55/55 across 13 files) | 8 ms (1.06 s suite) |

