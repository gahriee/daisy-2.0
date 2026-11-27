# Reports shared template & multi-format exports

- Status: PASS
- Last run: 2026-11-27 20:29:14 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 3 passed here (1.90 s); suite 219 passed, 0 failed, 0 skipped across 51 files, 3.83 s.
- Target file: [tests/unit/features/reports/exports.test.ts](../../../../tests/unit/features/reports/exports.test.ts) -> [src/features/reports/template.ts](../../../../src/features/reports/template.ts), [src/features/reports/export-excel.ts](../../../../src/features/reports/export-excel.ts), [src/features/reports/export-word.ts](../../../../src/features/reports/export-word.ts), [src/features/reports/export-pdf.ts](../../../../src/features/reports/export-pdf.ts)

## Verified criteria

- Neutralizes spreadsheet formula prefixes (`=`, `+`, `-`, `@`) while preserving negative decimal amounts (`-1500.00`), formats Peso currency strings cleanly, and generates `daisy-<reportType>-<date>.<format>` filenames across `csv`, `xlsx`, `docx`, and `pdf`.
- Builds consistent `SharedReportDocument` payloads (business profile, scope metadata, headline KPIs, analytical breakdown tables, and detailed ledger columns/rows) across all six operational reports (`occupancy`, `rent-roll`, `receivables-aging`, `collections`, `transient-revenue`, `maintenance`).
- Generates valid multi-sheet `.xlsx` (`Summary` and `Detail ledger` worksheets inside PKZIP archive), `.docx` (`word/document.xml` OOXML), and `%PDF-` / `%%EOF` documents across all six reports, including empty-row banners and automatic multi-page PDF pagination across 42 dense occupancy rows.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-18 19:54:03 | `vitest run` (all unit files) | 2 passed, 1 failed (`PDFDocument.load` check needed for compressed xref streams) | 1.60 s |
| 2026-11-18 19:54:24 | `pnpm exec vitest run tests/unit/features/reports/...` | 3 passed here; 13/13 across 4 report files | 850 ms (1.59 s) |
| 2026-11-18 19:57:22 | `pnpm exec vitest run tests/unit/features/reports/...` | 3 passed here; 13/13 across 4 report files | 884 ms (1.76 s) |
| 2026-11-27 20:29:14 | `pnpm test:unit` | 3 passed (suite: 219/219 across 51 files) | 1.90 s (3.83 s suite) |

