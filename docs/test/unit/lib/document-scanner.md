# Document scanner Canvas RGBA enhancer

- Status: PASS
- Last run: 2026-11-23 17:47:38 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm exec vitest run tests/unit/lib/document-scanner.test.ts tests/unit/lib/document-detect.test.ts`
- Result: 4 passed here (14 ms); 14 passed, 0 failed, 0 skipped across 2 targeted files, 485 ms.
- Target file: [tests/unit/lib/document-scanner.test.ts](../../../../tests/unit/lib/document-scanner.test.ts) -> [src/lib/document-scanner.ts](../../../../src/lib/document-scanner.ts)

## Verified criteria

- `enhanceDocumentRgba` in `ORIGINAL` mode returns a fresh pixel buffer matching the source bytes untouched.
- `sharpenDocumentTextRgba` applies a `5x5` integral-image unsharp mask that sharpens soft or slightly out-of-focus text edges while leaving flat paper background noise below threshold untouched.
- `MAGIC_WHITE` mode automatically sharpens text strokes and normalizes uneven shadowed and warm-tinted paper pixels to `#FFFFFF` via integral-image local background illumination estimation while preserving dark black printed text and blue handwritten signatures.
- `BW_SCAN` mode automatically sharpens text strokes and applies Sauvola adaptive local thresholding to render paper backgrounds `#FFFFFF` and ink strokes crisp near-black grayscale.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-23 17:47:38 | `pnpm exec vitest run tests/unit/lib/document-scanner.test.ts tests/unit/lib/document-detect.test.ts` | 4 passed (targeted: 14/14 across 2 files) | 14 ms (485 ms total) |
| 2026-11-23 17:38:21 | `pnpm exec vitest run tests/unit/lib/document-detect.test.ts tests/unit/lib/document-scanner.test.ts` | 3 passed (targeted: 13/13 across 2 files) | 11 ms (452 ms total) |
| 2026-11-23 17:10:18 | `pnpm exec vitest run tests/unit/lib/document-detect.test.ts tests/unit/lib/document-scanner.test.ts` | 3 passed (targeted: 12/12 across 2 files) | 10 ms (479 ms total) |
| 2026-11-23 16:29:38 | `pnpm test:unit tests/unit/lib/document-detect.test.ts tests/unit/lib/document-scanner.test.ts` | 3 passed (suite: 208/208 across 49 files) | 19 ms (2.95 s suite) |
| 2026-11-15 20:16:55 | pnpm test:unit | 3 passed (suite: 113/113 across 28 files) | 24 ms (1.70 s suite) |

