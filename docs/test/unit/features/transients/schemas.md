# Transients Zod validation & sync envelope contracts

- Status: PASS
- Last run: 2026-11-15 20:16:55 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 4 passed here (26 ms); suite 113 passed, 0 failed, 0 skipped across 28 files, 1.70 s.
- Target file: [tests/unit/features/transients/schemas.test.ts](../../../../tests/unit/features/transients/schemas.test.ts) -> [src/features/transients/schemas.ts](../../../../src/features/transients/schemas.ts), [src/features/transients/sync-contracts.ts](../../../../src/features/transients/sync-contracts.ts)

## Verified criteria

- Enforces at least one contact method (`phone` or `email`) and trims/normalizes guest profile fields.
- Validates `BED` vs. `WHOLE_ROOM` bed-selection exclusivity and strict `checkOutDateManila > checkInDateManila` ordering.
- Requires explicit privacy consent (`privacyConsentAccepted: true`) and bounded idempotency keys on `SubmitPublicBookingRequestSchema`.
- Produces deterministic canonical SHA-256 sync fingerprints regardless of payload property order on `TransientSyncOperationSchema`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-14 00:09:25 | pnpm test:unit | 4 passed (suite: 91/91 across 23 files) | 23 ms (1.10 s suite) |
| 2026-11-15 20:16:55 | pnpm test:unit | 4 passed (suite: 113/113 across 28 files) | 26 ms (1.70 s suite) |
