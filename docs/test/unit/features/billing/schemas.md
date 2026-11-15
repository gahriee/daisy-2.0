# Billing Zod validation schemas

- Status: PASS
- Last run: 2026-11-13 23:04:30 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 3 passed here; suite 75 passed, 0 failed, 0 skipped across 19 files, 1.08 s.
- Target file: [tests/unit/features/billing/schemas.test.ts](../../../../tests/unit/features/billing/schemas.test.ts) -> [src/features/billing/schemas.ts](../../../../src/features/billing/schemas.ts)

## Verified criteria

- Validates `YYYY-MM` Asia/Manila billing period format and rejects out-of-range months or full dates.
- Normalizes manual invoice line items (two-decimal unit amounts and positive quantities) and rejects `periodEndManila <= periodStartManila`.
- Enforces strictly positive adjustment amounts, positive `expectedVersion` integers, and non-empty void reasons.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 23:04:30 | pnpm test:unit | 3 passed (suite: 75/75 across 19 files) | 1.08 s suite |

