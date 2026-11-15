# Payments BigInt distribution, receipt numbering & reconciliation calculations

- Status: PASS
- Last run: 2026-11-13 23:41:44 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 3 passed here (9 ms); suite 84 passed, 0 failed, 0 skipped across 21 files, 1.19 s.
- Target file: [tests/unit/features/payments/calculations.test.ts](../../../../tests/unit/features/payments/calculations.test.ts) -> [src/features/payments/calculations.ts](../../../../src/features/payments/calculations.ts)

## Verified criteria

- Formats Owner-scoped official receipt numbers consistently across trailing hyphens (`OR-2026-000001`).
- Enforces `REJECT_OVERPAYMENT` (blocks unallocated excess), `CREDIT_NEXT_INVOICE` (computes `unallocatedCentavos`), and open-balance bounds (`allocation_exceeds_invoice`) in exact `BigInt` centavos.
- Auto-distributes payment amounts FIFO across open invoices and computes forward/reversal invoice `paidAmount` and `status` transitions (`ISSUED` <-> `PARTIALLY_PAID` <-> `PAID`).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 23:41:44 | pnpm test:unit | 3 passed (suite: 84/84 across 21 files) | 9 ms (1.19 s suite) |

