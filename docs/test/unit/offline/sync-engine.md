# Offline sync engine and leader coordination

- Status: PASS
- Last run: 2026-11-23 21:06:12 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0, fake-indexeddb 6.2.8
- Command: `pnpm exec vitest run tests/unit/offline/sync-engine.test.ts`
- Result: 4 passed, 0 failed, 0 skipped (174 ms; 634 ms total).
- Target file: [tests/unit/offline/sync-engine.test.ts](../../../../tests/unit/offline/sync-engine.test.ts) -> [src/offline/sync-engine.ts](../../../../src/offline/sync-engine.ts), [src/offline/attachments.ts](../../../../src/offline/attachments.ts), [src/offline/client.ts](../../../../src/offline/client.ts)

## Verified criteria

- Executes push-before-pull batches with encrypted queued attachment upload + `403` presigned URL renewal reusing `(opId, clientFileId)` intents and pruning local blobs only once accepted.
- Binds unsubmitted dependent operations (`dependsOn`) to the acknowledged predecessor `resultingVersion` cleanly before first submission.
- Respects `429 Retry-After` backoff windows, triggers full `/api/sync/bootstrap` on `410 rebootstrap_required` without dropping Needs-attention/pending entries, and rejects overlapping leaders under `runWithSyncLeader`.
- Invokes default `globalThis.fetch` bound to `globalThis` during bootstrap and attachment uploads so browsers never throw `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`.
- `listDecryptedPendingOutbox` returns queued outbox entries when unlocked, and `resetOfflineVaultForNewPassphrase` clears encrypted tables plus `crypto`/`sync` metadata while preserving the trusted-device `auth` anchor so a new sync password can be initialized immediately.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-23 21:06:12 | `pnpm exec vitest run tests/unit/offline/sync-engine.test.ts` | 4 passed (targeted: 4/4) | 174 ms (634 ms total) |
| 2026-11-23 21:00:48 | `pnpm exec vitest run tests/unit/offline/sync-engine.test.ts` | 3 passed (targeted: 3/3) | 88 ms (611 ms total) |
| 2026-11-16 14:08:23 | `pnpm test:unit` | 2 passed (suite: 138/138 across 37 files) | 222 ms (2.88 s suite) |
