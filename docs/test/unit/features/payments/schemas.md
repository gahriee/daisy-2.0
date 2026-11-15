# Payments Zod validation & sync envelope schemas

- Status: PASS
- Last run: 2026-11-13 23:41:44 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 4 passed here (22 ms); suite 84 passed, 0 failed, 0 skipped across 21 files, 1.19 s.
- Target file: [tests/unit/features/payments/schemas.test.ts](../../../../tests/unit/features/payments/schemas.test.ts) -> [src/features/payments/schemas.ts](../../../../src/features/payments/schemas.ts), [src/features/payments/sync-contracts.ts](../../../../src/features/payments/sync-contracts.ts)

## Verified criteria

- Normalizes positive decimal peso amounts, trims optional payment references, converts blank notes to `null`, and validates Manila dates and payment methods.
- Rejects duplicate invoice IDs in a single payment, zero or negative amounts, duplicate proof intent IDs, and blank reversal reasons.
- Enforces the proof upload MIME allowlist, 64-hex SHA-256 checksums, and paired `(opId, clientFileId)` metadata for sync-safe attachments.
- Validates `payment.record` sync operation envelopes (`protocolVersion: 1`, `baseVersion: 0`) and produces deterministic canonical sync fingerprints.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 23:41:44 | pnpm test:unit | 4 passed (suite: 84/84 across 21 files) | 22 ms (1.19 s suite) |

