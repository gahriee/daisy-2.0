# Reports CSV escaping and serialization

- Status: PASS
- Last run: 2026-11-16 14:54:23 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/dashboard/calculations.test.ts tests/unit/features/reports/calculations.test.ts tests/unit/features/reports/csv.test.ts tests/unit/features/reports/schemas.test.ts`
- Result: 2 passed here (6 ms); suite 146 passed, 0 failed, 0 skipped across 39 files, 2.21 s.
- Target file: [tests/unit/features/reports/csv.test.ts](tests/unit/features/reports/csv.test.ts) -> [src/features/reports/csv.ts](src/features/reports/csv.ts)

## Verified criteria

- Escapes RFC 4180 delimiters/quotes and neutralizes formula-injection prefixes (`=`, `+`, `-`, `@`) while preserving negative decimal amounts such as `-1500.00`.
- Serializes all six report CSV documents (`occupancy`, `rent-roll`, `receivables-aging`, `collections`, `transient-revenue`, `maintenance`) with metadata header rows and matching filenames.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 03:08:27 | `pnpm test:unit` | 1 passed, 1 failed (extra quotes in unit test expectation) | 16 ms |
| 2026-11-16 03:08:52 | `pnpm test:unit` | 2 passed (suite: 124/124 across 31 files) | 9 ms (1.59 s suite) |
| 2026-11-16 14:54:23 | `pnpm test:unit ...` | 2 passed (suite: 146/146 across 39 files) | 6 ms (2.21 s suite) |

