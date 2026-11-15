# Table pagination helpers

- Status: PASS
- Last run: 2026-11-14 02:54:07 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 3 passed here (5 ms); suite 106 passed, 0 failed, 0 skipped across 27 files, 1.46 s.
- Target file: [tests/unit/lib/table-pagination.test.ts](tests/unit/lib/table-pagination.test.ts) -> [src/lib/table-pagination.ts](src/lib/table-pagination.ts)

## Verified criteria

- Returns `page: 1`, `totalPages: 1`, `0–0` range bounds, and default page size `25` (`DEFAULT_PAGE_SIZE`) when `totalItems` is zero (`computePagination`).
- Slices sorted rows to requested page bounds and clamps oversized page requests down to the final valid page (`paginateRows`).
- Emits full page number arrays up to 7 pages and compact `"ellipsis"` windows anchored to page `1` and `totalPages` for larger page counts (`getPaginationItems`).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-14 02:54:07 | pnpm test:unit | 3 passed (suite: 106/106 across 27 files) | 5 ms (1.46 s suite) |

