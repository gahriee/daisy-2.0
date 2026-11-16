# Offline sync engine and leader coordination

- Status: PASS
- Last run: 2026-11-16 14:08:23 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0, fake-indexeddb 6.2.8
- Command: `pnpm test:unit` (covers `tests/unit/offline/sync-engine.test.ts`)
- Result: 2 passed here (222 ms); suite 138 passed, 0 failed, 0 skipped across 37 files, 2.88 s.
- Target file: [tests/unit/offline/sync-engine.test.ts](tests/unit/offline/sync-engine.test.ts) -> [src/offline/sync-engine.ts](src/offline/sync-engine.ts), [src/offline/attachments.ts](src/offline/attachments.ts)

## Verified criteria

- Executes push-before-pull batches with encrypted queued attachment upload + `403` presigned URL renewal reusing `(opId, clientFileId)` intents and pruning local blobs only once accepted.
- Binds unsubmitted dependent operations (`dependsOn`) to the acknowledged predecessor `resultingVersion` cleanly before first submission.
- Respects `429 Retry-After` backoff windows, triggers full `/api/sync/bootstrap` on `410 rebootstrap_required` without dropping Needs-attention/pending entries, and rejects overlapping leaders under `runWithSyncLeader`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 14:08:23 | `pnpm test:unit` | 2 passed (suite: 138/138 across 37 files) | 222 ms (2.88 s suite) |

