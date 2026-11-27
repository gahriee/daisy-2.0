# Public booking storefront view helpers

- Status: PASS
- Last run: 2026-11-27 20:29:14 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 9 passed here (14 ms); suite 219 passed, 0 failed, 0 skipped across 51 files, 3.83 s.
- Target file: [tests/unit/features/transients/public-booking-view.test.ts](../../../../tests/unit/features/transients/public-booking-view.test.ts) -> [src/features/transients/public-booking-view.ts](../../../../src/features/transients/public-booking-view.ts)

## Verified criteria

- Builds deduplicated room photo slide lists placing preview covers first followed by captioned gallery shots.
- Formats `HH:mm` stay times (`formatStayTime`), plain room scope labels (`getScopeLabel`), `Male`/`Female` labels (`getGuestSexLabel`), and adult/child summaries (`formatGuestsSummary`).
- Parses and encodes bounded When (`checkIn`/`checkOut`) and Who (`adults >= 1`, `children >= 0`, sum `<= 20`, legacy `guests` fallback) URL query params cleanly across `/book`, `/book/[roomId]`, and `/book/[roomId]/request`.
- Derives non-technical availability status and capacity diagnostics across `WHOLE_ROOM` and `BED` scopes.
- Filters and sorts published rooms using exact `BigInt` centavo comparisons and builds encoded OpenStreetMap area links, Google Maps turn-by-turn direction URLs (`buildMapDirectionsUrl`), and Grab passenger ride-booking deep links (`buildGrabBookingUrl`) targeting pinned coordinates (`dropOffLatitude`, `dropOffLongitude`) or fallback street addresses.
- Computes unavailable Asia/Manila nights (`computeUnavailableNightDates`) from active half-open `[startDate, endDate)` allocations for both `WHOLE_ROOM` and shared `BED` scopes, preserving same-day turnover check-in/check-out.
- Finds the earliest occupied night after check-in (`findFirstUnavailableNightAfter`) and blocks ranges spanning across occupied dates (`isRangeBlockedByUnavailableDates`) while permitting abutting same-day check-out.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-27 20:29:14 | `pnpm test:unit` | 9 passed (suite: 219/219 across 51 files) | 14 ms (3.83 s suite) |
| 2026-11-23 15:08:01 | `pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts tests/unit/server/mail/booking-mailer.test.ts` | 9 passed (suite: 194/194 across 48 files) | 3.76 s suite |
| 2026-11-23 14:56:18 | `pnpm test:unit tests/unit/server/mail/booking-mailer.test.ts tests/unit/features/transients/public-booking-view.test.ts` | 9 passed (suite: 194/194 across 48 files) | 3.39 s suite |
| 2026-11-22 21:46:58 | `pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts` | 9 passed (suite: 188/188 across 47 files) | 18 ms (5.36 s suite) |
| 2026-11-17 21:17:04 | `pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts` | 6 passed (suite: 169/169 across 43 files) | 19 ms (6.36 s suite) |
| 2026-11-17 20:50:50 | pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts | 5 passed (suite: 168/168 across 43 files) | 10 ms (3.22 s suite) |

