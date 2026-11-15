# Document scanner Canvas RGBA enhancer

- Status: PASS
- Last run: 2026-11-15 20:16:55 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 3 passed here (24 ms); suite 113 passed, 0 failed, 0 skipped across 28 files, 1.70 s.
- Target file: [tests/unit/lib/document-scanner.test.ts](../../../../tests/unit/lib/document-scanner.test.ts) -> [src/lib/document-scanner.ts](../../../../src/lib/document-scanner.ts)

## Verified criteria

- `enhanceDocumentRgba` in `ORIGINAL` mode returns a fresh pixel buffer matching the source bytes untouched.
- `MAGIC_WHITE` mode normalizes uneven shadowed and warm-tinted paper pixels to `#FFFFFF` via integral-image local background illumination estimation while preserving dark black printed text and blue handwritten signatures.
- `BW_SCAN` mode applies Sauvola adaptive local thresholding to render paper backgrounds `#FFFFFF` and ink strokes crisp near-black grayscale.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-15 20:16:55 | pnpm test:unit | 3 passed (suite: 113/113 across 28 files) | 24 ms (1.70 s suite) |

