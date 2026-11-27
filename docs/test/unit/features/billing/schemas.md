# Billing Zod validation schemas

- Status: PASS
- Last run: 2026-11-27 23:02:09 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm exec vitest run tests/unit/features/billing/schemas.test.ts`
- Result: 3 passed, 0 failed, 0 skipped across 1 file, 346 ms.
- Target file: [tests/unit/features/billing/schemas.test.ts](../../../../tests/unit/features/billing/schemas.test.ts) -> [src/features/billing/schemas.ts](../../../../src/features/billing/schemas.ts)

## Verified criteria

- Validates `YYYY-MM` Asia/Manila billing period format and rejects out-of-range months or full dates.
- Normalizes manual invoice line items (two-decimal unit amounts and positive whole-number quantities, rejecting decimal quantities), accepts either `tenantId` or `transientGuestId`, and rejects `periodEndManila <= periodStartManila` when coverage dates are provided.
- Enforces strictly positive adjustment amounts, positive `expectedVersion` integers, and non-empty void reasons.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 23:04:30 | pnpm test:unit | 3 passed (suite: 75/75 across 19 files) | 1.08 s suite |
| 2026-11-27 22:58:45 | pnpm test:unit tests/unit/features/billing | 3 passed (suite: 219/219 across 51 files) | 3.84 s suite |
| 2026-11-27 23:02:09 | pnpm exec vitest run tests/unit/features/billing/schemas.test.ts | 3 passed | 346 ms |

