# Dexie offline vault, outbox atomicity, and conflicts

- Status: PASS
- Last run: 2026-11-16 21:20:06 (UTC+8)
- Runtime: Windows, Vitest 5.1.0, fake-indexeddb 6.2.8, Next.js 16.4.6 (`pnpm build` verified)
- Command: `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` (Vitest ran full unit suite + targeted files)
- Result: 6 passed here (251 ms); suite 155 passed, 0 failed, 0 skipped across 40 files, 2.77 s.
- Target file: [tests/unit/offline/db-outbox.test.ts](tests/unit/offline/db-outbox.test.ts) -> [src/offline/db.ts](src/offline/db.ts)

## Verified criteria

- Commits encrypted outbox, attachment blobs, and local projections atomically inside Dexie IndexedDB transactions, rolling back completely on simulated `QuotaExceededError`.
- Applies server delta pages and tombstones cleanly while keeping unconfirmed local operations, and resolves Needs attention entries via `keepMineNeedsAttentionOperation` (fresh `opId` bound to confirmed version) and `discardNeedsAttentionOperation`.
- Chains explicit `dependsOn` links via `findLatestActiveEntityOutboxOpId` and preserves optimistic `.archive`/`.restore` `archivedAt` timestamps, `maintenance.update` `statusTo` transitions, and `transient_reservation.create`/`.checkin`/`.checkout` status/timestamps across `applySyncChangesAtomic` projection rebasing.
- Blocks incompatible newer vault schema versions (`assertOfflineSchemaCompatible`) when unsynced outbox items exist rather than dropping local data.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 21:20:06 | `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` | 6 passed (suite: 155/155 across 40 files) | 251 ms (2.77 s suite) |
| 2026-11-16 20:59:31 | `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` | 5 passed (suite: 153/153 across 40 files) | 235 ms (2.51 s suite) |
| 2026-11-16 19:33:41 | `pnpm test:unit tests/unit/offline/db-outbox.test.ts tests/unit/offline/snapshot-selectors.test.ts` | 4 passed (suite: 150/150 across 40 files) | 557 ms (4.51 s suite) |
| 2026-11-16 14:08:23 | `pnpm test:unit` | 3 passed (suite: 138/138 across 37 files) | 460 ms (2.88 s suite) |

