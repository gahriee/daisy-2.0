# Business settings validation schemas

- Status: PASS
- Last run: 2026-11-23 13:14:12 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/settings/schemas.test.ts`
- Result: 5 passed here (31 ms); suite 192 passed, 0 failed, 0 skipped across 48 files, 3.54 s.
- Target file: [tests/unit/features/settings/schemas.test.ts](../../../../tests/unit/features/settings/schemas.test.ts) -> [src/features/settings/schemas.ts](../../../../src/features/settings/schemas.ts)

## Verified criteria

- Accepts partial setup payloads while trimming whitespace, normalizing empty optional strings to `null`, and reporting `hasCompleteFinancialPolicies(...) === false` until billing/proration/deposit/overpayment/prefix policies are configured, independently of `hasCompleteStaySchedule(...)`.
- Uppercases document prefixes (`INV-`, `RCP-`) and confirms `hasCompleteFinancialPolicies(...) === true` when all required financial policies are supplied without requiring stay schedule fields.
- Validates per-module discriminated updates (`profile`, `policies`, `operations`, `house_rules`) including `transientPolicyNote` (house rules) and stay schedule completeness (`hasCompleteStaySchedule`).
- Parses house rules cleanly via `parseHouseRulesList` without implicit default fallbacks (returns `[]` for `null`/blank), and serializes rule-per-row arrays cleanly via `serializeHouseRulesList`.
- Rejects out-of-range billing days (e.g., `31`) and invalid `HH:mm` wall times (`25:00`).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-23 13:14:12 | `pnpm test:unit tests/unit/features/settings/schemas.test.ts` | 5 passed (suite: 192/192 across 48 files) | 31 ms (3.54 s suite) |
| 2026-11-23 13:05:35 | `pnpm test:unit tests/unit/features/settings/schemas.test.ts` | 5 passed (suite: 192/192 across 48 files) | 63 ms (3.69 s suite) |
| 2026-11-23 12:38:00 | `pnpm test:unit tests/unit/features/settings/schemas.test.ts` | 5 passed (suite: 192/192 across 48 files) | 35 ms (4.01 s suite) |
| 2026-11-13 23:25:21 | pnpm test:unit | 4 passed (suite: 76/76 across 19 files) | 16 ms (995 ms suite) |
| 2026-11-13 18:30:47 | pnpm test:unit | 3 passed (suite: 55/55 across 13 files) | 12 ms (1.06 s suite) |

