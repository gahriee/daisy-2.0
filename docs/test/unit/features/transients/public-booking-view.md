# Public booking storefront view helpers

- Status: PASS
- Last run: 2026-11-22 21:46:58 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts` (Vitest configuration ran all `tests/unit` + targeted file)
- Result: 9 passed here (18 ms); suite 188 passed, 0 failed, 0 skipped across 47 files, 5.36 s.
- Target file: [tests/unit/features/transients/public-booking-view.test.ts](../../../../tests/unit/features/transients/public-booking-view.test.ts) -> [src/features/transients/public-booking-view.ts](../../../../src/features/transients/public-booking-view.ts)

## Verified criteria

- Builds deduplicated room photo slide lists placing preview covers first followed by captioned gallery shots.
- Formats `HH:mm` stay times (`formatStayTime`), plain room scope labels (`getScopeLabel`), `Male`/`Female` labels (`getGuestSexLabel`), and adult/child summaries (`formatGuestsSummary`).
- Parses and encodes bounded When (`checkIn`/`checkOut`) and Who (`adults >= 1`, `children >= 0`, sum `<= 20`, legacy `guests` fallback) URL query params cleanly across `/book`, `/book/[roomId]`, and `/book/[roomId]/request`.
- Derives non-technical availability status and capacity diagnostics across `WHOLE_ROOM` and `BED` scopes.
- Filters and sorts published rooms using exact `BigInt` centavo comparisons and builds encoded OpenStreetMap area links.
- Computes unavailable Asia/Manila nights (`computeUnavailableNightDates`) from active half-open `[startDate, endDate)` allocations for both `WHOLE_ROOM` and shared `BED` scopes, preserving same-day turnover check-in/check-out.
- Finds the earliest occupied night after check-in (`findFirstUnavailableNightAfter`) and blocks ranges spanning across occupied dates (`isRangeBlockedByUnavailableDates`) while permitting abutting same-day check-out.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-22 21:46:58 | `pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts` | 9 passed (suite: 188/188 across 47 files) | 18 ms (5.36 s suite) |
| 2026-11-17 21:17:04 | `pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts` | 6 passed (suite: 169/169 across 43 files) | 19 ms (6.36 s suite) |
| 2026-11-17 20:50:50 | pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts | 5 passed (suite: 168/168 across 43 files) | 10 ms (3.22 s suite) |

