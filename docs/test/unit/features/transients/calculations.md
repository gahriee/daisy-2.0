# Transients stay & rate calculations

- Status: PASS
- Last run: 2026-11-15 20:16:55 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 3 passed here (9 ms); suite 113 passed, 0 failed, 0 skipped across 28 files, 1.70 s.
- Target file: [tests/unit/features/transients/calculations.test.ts](../../../../tests/unit/features/transients/calculations.test.ts) -> [src/features/transients/calculations.ts](../../../../src/features/transients/calculations.ts)

## Verified criteria

- Computes exact Asia/Manila stay night counts across month boundaries and rejects non-positive intervals.
- Converts Manila stay dates paired with Owner `checkInTimeManila` / `checkOutTimeManila` into strict half-open UTC timestamps (`[startUtc, endUtc)`) and throws when check-out is not strictly after check-in.
- Resolves effective daily rate in integer centavos using room override before room-type fallback and multiplies exact total stay centavos.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-14 00:09:25 | pnpm test:unit | 3 passed (suite: 91/91 across 23 files) | 8 ms (1.10 s suite) |
| 2026-11-15 20:16:55 | pnpm test:unit | 3 passed (suite: 113/113 across 28 files) | 9 ms (1.70 s suite) |
