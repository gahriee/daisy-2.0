# Notices Zod validation

- Status: PASS
- Last run: 2026-11-14 00:39:59 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 2 passed here (9 ms); suite 98 passed, 0 failed, 0 skipped across 25 files, 1.38 s.
- Target file: [tests/unit/features/notices/schemas.test.ts](../../../../tests/unit/features/notices/schemas.test.ts) -> [src/features/notices/schemas.ts](../../../../src/features/notices/schemas.ts)

## Verified criteria

- Enforces audience target mutual exclusion for `EVERYONE`, `ROOM`, and `TENANT` and allows single-day notices (`endDateManila === startDateManila`).
- Rejects `endDateManila < startDateManila` on both `CreateNoticeSchema` and `UpdateNoticeSchema`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-14 00:39:59 | pnpm test:unit | 2 passed (suite: 98/98 across 25 files) | 9 ms (1.38 s suite) |

