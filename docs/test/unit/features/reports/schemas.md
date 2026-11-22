# Reports schemas and filter resolution

- Status: PASS
- Last run: 2026-11-18 19:57:22 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm exec vitest run tests/unit/features/reports/schemas.test.ts tests/unit/features/reports/csv.test.ts tests/unit/features/reports/exports.test.ts tests/unit/features/reports/calculations.test.ts`
- Result: 4 passed here (10 ms); targeted report suite 13 passed, 0 failed, 0 skipped across 4 files, 1.76 s.
- Target file: [tests/unit/features/reports/schemas.test.ts](tests/unit/features/reports/schemas.test.ts) -> [src/features/reports/schemas.ts](src/features/reports/schemas.ts)

## Verified criteria

- Resolves default `asOfDate` and month-to-date `[fromDate, toDate]` bounds in `Asia/Manila`.
- Anchors default period bounds to a supplied `asOfDate`.
- Rejects reversed `fromDate > toDate` ranges and windows exceeding `366` days.
- Rejects invalid calendar dates (`2026-02-30`), unknown export report types, and unsupported export formats while defaulting omitted `format` to `csv` and accepting `xlsx`, `docx`, and `pdf`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 03:08:27 | `pnpm test:unit` | 1 passed, 3 failed (Zod outer `.optional()` fix) | 16 ms |
| 2026-11-16 03:08:52 | `pnpm test:unit` | 4 passed (suite: 124/124 across 31 files) | 14 ms (1.59 s suite) |
| 2026-11-18 19:57:22 | `pnpm exec vitest run tests/unit/features/reports/...` | 4 passed here (13/13 across 4 report files) | 10 ms (1.76 s) |

