# Public booking storefront view helpers

- Status: PASS
- Last run: 2026-11-17 21:17:04 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts` (Vitest configuration ran all `tests/unit` + targeted files)
- Result: 6 passed here (19 ms); suite 169 passed, 0 failed, 0 skipped across 43 files, 6.36 s.
- Target file: [tests/unit/features/transients/public-booking-view.test.ts](../../../../tests/unit/features/transients/public-booking-view.test.ts) -> [src/features/transients/public-booking-view.ts](../../../../src/features/transients/public-booking-view.ts)

## Verified criteria

- Builds deduplicated room photo slide lists placing preview covers first followed by captioned gallery shots.
- Formats `HH:mm` stay times (`formatStayTime`), plain room scope labels (`getScopeLabel`), `Male`/`Female` labels (`getGuestSexLabel`), and adult/child summaries (`formatGuestsSummary`).
- Parses and encodes bounded When (`checkIn`/`checkOut`) and Who (`adults >= 1`, `children >= 0`, sum `<= 20`, legacy `guests` fallback) URL query params cleanly across `/book`, `/book/[roomId]`, and `/book/[roomId]/request`.
- Derives non-technical availability status and capacity diagnostics across `WHOLE_ROOM` and `BED` scopes.
- Filters and sorts published rooms using exact `BigInt` centavo comparisons and builds encoded OpenStreetMap area links.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-17 21:17:04 | `pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts` | 6 passed (suite: 169/169 across 43 files) | 19 ms (6.36 s suite) |
| 2026-11-17 20:50:50 | pnpm test:unit tests/unit/features/transients/public-booking-view.test.ts | 5 passed (suite: 168/168 across 43 files) | 10 ms (3.22 s suite) |

