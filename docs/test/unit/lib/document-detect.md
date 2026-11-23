# Document boundary detection and perspective flattening (jscanify + @techstark/opencv-js)

- Status: PASS
- Last run: 2026-11-23 17:47:38 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm exec vitest run tests/unit/lib/document-scanner.test.ts tests/unit/lib/document-detect.test.ts`
- Result: 10 passed here (278 ms); 14 passed, 0 failed, 0 skipped across 2 targeted files, 485 ms.
- Target file: [tests/unit/lib/document-detect.test.ts](../../../../tests/unit/lib/document-detect.test.ts) -> [src/lib/document-detect.ts](../../../../src/lib/document-detect.ts)

## Verified criteria

- `loadJScanifyEngine` lazy-loads `@techstark/opencv-js` and `jscanify/client` via `src/lib/opencv-loader.cjs` and returns a ready OpenCV + `JScanify` singleton.
- `computeCoverCrop` extracts the centered portrait (`3:4`) region matching CSS `object-fit: cover` from both landscape and tall frames.
- `blendQuadCorners` interpolates live corner coordinates smoothly across camera frames.
- `estimateFlattenedSize` derives upright document dimensions from the longer of opposite edges while capping the long side at `maxDimension`.
- `warpPerspectiveRgba` uses OpenCV `cv.getPerspectiveTransform` and `cv.warpPerspective` to straighten a tilted 4-corner quadrilateral into an upright rectangular buffer while freeing WASM `cv.Mat` instances.
- `detectDocumentQuad` combines chroma-suppressed OpenCV Otsu + morphology + convexHull + `jscanify.getCornerPoints` (with `jscanify.findPaperContour` fallback) to accurately locate all 4 corners of shadowed paper on both dark desks and bright warm wooden desks that share similar grayscale luminance, returning `null` when no valid page contour is present.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-23 17:47:38 | `pnpm exec vitest run tests/unit/lib/document-scanner.test.ts tests/unit/lib/document-detect.test.ts` | 10 passed (targeted: 14/14 across 2 files) | 278 ms (485 ms total) |
| 2026-11-23 17:38:21 | `pnpm exec vitest run tests/unit/lib/document-detect.test.ts tests/unit/lib/document-scanner.test.ts` | 10 passed (targeted: 13/13 across 2 files) | 258 ms (452 ms total) |
| 2026-11-23 17:10:18 | `pnpm exec vitest run tests/unit/lib/document-detect.test.ts tests/unit/lib/document-scanner.test.ts` | 9 passed (targeted: 12/12 across 2 files) | 275 ms (479 ms total) |
| 2026-11-23 16:52:42 | `pnpm test:unit` | 4 passed, 5 failed (`Promise.prototype.then` ESM namespace receiver on `@techstark/opencv-js`; fixed via `src/lib/opencv-loader.cjs`) | 483 ms |
| 2026-11-23 16:29:38 | `pnpm test:unit tests/unit/lib/document-detect.test.ts tests/unit/lib/document-scanner.test.ts` | 14 passed (suite: 208/208 across 49 files) | 101 ms (2.95 s suite) |
