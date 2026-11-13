# Asia/Manila business date helpers

- Status: PASS
- Last run: 2026-11-13 18:30:47 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: pnpm test:unit
- Result: 4 passed here (8 ms); suite 55 passed, 0 failed, 0 skipped across 13 files, 1.06 s.
- Target file: [tests/unit/lib/dates.test.ts](tests/unit/lib/dates.test.ts) -> [src/lib/dates.ts](src/lib/dates.ts)

## Verified criteria

- Converts UTC instants cleanly across `Asia/Manila` midnight boundaries (`15:59:59.999Z` vs `16:00:00.000Z`).
- Converts `Asia/Manila` business dates and `HH:mm` wall times to exact UTC `Date` instants (`manilaDateTimeToUtc`).
- Validates leap-year and calendar day bounds (`isValidManilaDate`, `parseManilaDate`, `isValidTimeHHmm`) strictly.
- Performs calendar-day arithmetic and difference (`addManilaDays`, `diffManilaDays`) and derives overdue state at `Asia/Manila` day boundaries (`isOverdueManila`).

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-13 18:30:47 | pnpm test:unit | 4 passed (suite: 55/55 across 13 files) | 8 ms (1.06 s suite) |

