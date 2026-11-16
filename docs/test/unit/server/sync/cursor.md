# Signed opaque sync cursors

- Status: PASS
- Last run: 2026-11-16 13:57:11 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit` (covers `tests/unit/server/sync/cursor.test.ts`)
- Result: 3 passed here (16 ms); suite 129 passed, 0 failed, 0 skipped across 33 files, 1.70 s.
- Target file: [tests/unit/server/sync/cursor.test.ts](tests/unit/server/sync/cursor.test.ts) -> [src/server/sync/cursor.ts](src/server/sync/cursor.ts)

## Verified criteria

- Signs and verifies HMAC-SHA256 opaque `pull` and `bootstrap` cursors bound to `(ownerUserId, deviceId)`.
- Rejects tampered signatures, wrong kind (`bootstrap` vs `pull`), foreign Owner or device IDs, expired TTL, and rotated signing secrets with `RebootstrapRequiredError` (`HTTP 410`).
- Fails closed with `ServiceUnavailableError` (`HTTP 503`) when no signing secret is configured.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 13:56:46 | `pnpm test:unit` | Failed suite load (`server-only` missing mock in unit test) | — |
| 2026-11-16 13:57:11 | `pnpm test:unit` | 3 passed (suite: 129/129 across 33 files) | 16 ms (1.70 s suite) |

