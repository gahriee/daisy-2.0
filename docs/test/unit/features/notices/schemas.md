# Notices Zod validation

- Status: PASS
- Last run: 2026-11-22 05:13:35 (UTC+8)
- Runtime: Windows, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/features/notices/schemas.test.ts`
- Result: 3 passed here (17 ms); suite 184 passed, 0 failed, 0 skipped across 47 files, 3.04 s.
- Target file: [tests/unit/features/notices/schemas.test.ts](../../../../tests/unit/features/notices/schemas.test.ts) -> [src/features/notices/schemas.ts](../../../../src/features/notices/schemas.ts)

## Verified criteria

- Enforces audience target mutual exclusion for `EVERYONE`, `ROOM`, and `TENANT` and allows single-day notices (`endDateManila === startDateManila`).
- Rejects `endDateManila < startDateManila` on both `CreateNoticeSchema` and `UpdateNoticeSchema`.
- Validates `SendNoticeSmsSchema` UUIDs and formats/clips Semaphore SMS notice text cleanly via `formatNoticeSmsText`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-22 05:13:35 | `pnpm test:unit tests/unit/features/notices/schemas.test.ts` | 3 passed (suite: 184/184 across 47 files) | 17 ms (3.04 s suite) |
| 2026-11-22 05:08:28 | `pnpm test:unit tests/unit/features/notices/schemas.test.ts` | 3 passed (suite: 184/184 across 47 files) | 15 ms (3.05 s suite) |
| 2026-11-14 00:39:59 | pnpm test:unit | 2 passed (suite: 98/98 across 25 files) | 9 ms (1.38 s suite) |

