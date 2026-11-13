# Business settings validation schemas

- Status: PASS
- Last run: 2026-11-13 18:30:47 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 3 passed here (12 ms); suite 55 passed, 0 failed, 0 skipped across 13 files, 1.06 s.
- Target file: [tests/unit/features/settings/schemas.test.ts](tests/unit/features/settings/schemas.test.ts) -> [src/features/settings/schemas.ts](src/features/settings/schemas.ts)

## Verified criteria

- Accepts partial setup payloads while trimming whitespace, normalizing empty optional strings to `null`, and reporting `hasCompleteFinancialPolicies(...) === false` until billing/proration/deposit/overpayment/prefix policies are configured.
- Uppercases document prefixes (`INV-`, `RCP-`) and confirms `hasCompleteFinancialPolicies(...) === true` when all required financial policies are supplied.
- Rejects out-of-range billing days (e.g., `31`) and invalid `HH:mm` wall times (`25:00`).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 18:30:47 | pnpm test:unit | 3 passed (suite: 55/55 across 13 files) | 12 ms (1.06 s suite) |

