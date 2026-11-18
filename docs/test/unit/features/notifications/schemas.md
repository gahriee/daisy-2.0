# Notification helpers unit verification

- Status: PASS
- Last run: 2026-11-17 00:44:38 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/notifications/schemas.test.ts tests/unit/offline/sw-policy.test.ts` (Vitest configuration ran `tests/unit` + targeted files)
- Result: 3 passed here (24 ms); suite 162 passed, 0 failed, 0 skipped across 42 files, 3.06 s.
- Target file: [tests/unit/features/notifications/schemas.test.ts](tests/unit/features/notifications/schemas.test.ts) -> [src/features/notifications/schemas.ts](src/features/notifications/schemas.ts)

## Verified criteria

- Maps notification key prefixes (`settings:`, `assignment:`, `invoice:`, `booking_request:`, `maintenance:`, `sec:`) to explicit categories.
- Sorts unread notifications ahead of read notifications and orders newest `createdAt` first within each group.
- Deduplicates, trims, and chunks notification keys into batches of at most 50 keys matching `POST /api/notifications/read`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-17 00:44:38 | `pnpm test:unit tests/unit/features/notifications/schemas.test.ts tests/unit/offline/sw-policy.test.ts` | 3 passed (suite: 162/162 across 42 files) | 24 ms (3.06 s suite) |

