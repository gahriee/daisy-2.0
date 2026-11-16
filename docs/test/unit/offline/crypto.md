# Offline vault crypto and key custody

- Status: PASS
- Last run: 2026-11-16 14:08:23 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit` (covers `tests/unit/offline/crypto.test.ts`)
- Result: 2 passed here (39 ms); suite 138 passed, 0 failed, 0 skipped across 37 files, 2.88 s.
- Target file: [tests/unit/offline/crypto.test.ts](tests/unit/offline/crypto.test.ts) -> [src/offline/crypto.ts](src/offline/crypto.ts)

## Verified criteria

- Derives non-extractable in-memory AES-256-GCM keys via PBKDF2-SHA256, verifies passphrases against encrypted verifier metadata, and encrypts/decrypts JSON payloads and binary blobs.
- Auto-locks `VaultKeyCustody` after inactivity and enforces `offlineUnlockMaxDays` bounds while rejecting backward clock skew.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-16 14:08:23 | `pnpm test:unit` | 2 passed (suite: 138/138 across 37 files) | 39 ms (2.88 s suite) |

