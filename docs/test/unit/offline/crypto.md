# Offline vault crypto and key custody

- Status: PASS
- Last run: 2026-11-28 03:26:14 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit tests/unit/offline/crypto.test.ts tests/unit/offline/db-outbox.test.ts tests/unit/offline/sync-engine.test.ts` (Vitest configuration ran `tests/unit` + targeted files)
- Result: 5 passed here (106 ms); suite 221 passed, 0 failed, 0 skipped across 51 files, 5.95 s.
- Target file: [tests/unit/offline/crypto.test.ts](tests/unit/offline/crypto.test.ts) -> [src/offline/crypto.ts](src/offline/crypto.ts), [src/offline/client.ts](src/offline/client.ts)

## Verified criteria

- Derives non-extractable in-memory AES-256-GCM keys via PBKDF2-SHA256, verifies passphrases against encrypted verifier metadata, and encrypts/decrypts JSON payloads and binary blobs.
- Auto-locks `VaultKeyCustody` after inactivity and enforces `offlineUnlockMaxDays` bounds while rejecting backward clock skew.
- Generates distinct 4x5 unambiguous high-entropy passphrases via `generateVaultPassphrase()` that initialize and unlock vault metadata.
- Generates and verifies non-extractable AES-256-GCM trusted-device keys (`initializeTrustedDeviceVaultKey` / `verifyTrustedDeviceVaultKey`).
- `ensureTrustedDeviceVaultUnlocked` auto-unlocks passwordlessly on trusted devices (online and within `offlineUnlockMaxDays` offline) and blocks untrusted, revoked, or expired sessions.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-28 03:26:14 | `pnpm test:unit tests/unit/offline/crypto.test.ts tests/unit/offline/db-outbox.test.ts tests/unit/offline/sync-engine.test.ts` | 5 passed (suite: 221/221 across 51 files) | 106 ms (5.95 s suite) |
| 2026-11-17 02:06:57 | `pnpm test:unit tests/unit/offline/crypto.test.ts` | 3 passed (suite: 163/163 across 42 files) | 52 ms (2.22 s suite) |
| 2026-11-16 14:08:23 | `pnpm test:unit` | 2 passed (suite: 138/138 across 37 files) | 39 ms (2.88 s suite) |

