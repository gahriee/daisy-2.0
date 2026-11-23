# Document boundary detection and perspective flattening (jscanify + @techstark/opencv-js)

- Status: PASS
- Last run: 2026-11-23 17:10:18 (UTC+8)
- Runtime: Windows, Node 24.20.0, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm exec vitest run tests/unit/lib/document-detect.test.ts tests/unit/lib/document-scanner.test.ts`
- Result: 9 passed here (275 ms); 12 passed, 0 failed, 0 skipped across 2 targeted files, 479 ms.
- Target file: [tests/unit/lib/document-detect.test.ts](../../../../tests/unit/lib/document-detect.test.ts) -> [src/lib/document-detect.ts](../../../../src/lib/document-detect.ts)

## Verified criteria

- `loadJScanifyEngine` lazy-loads `@techstark/opencv-js` and `jscanify/client` via `src/lib/opencv-loader.cjs` and returns a ready OpenCV + `JScanify` singleton.
- `computeCoverCrop` extracts the centered portrait (`3:4`) region matching CSS `object-fit: cover` from both landscape and tall frames.
- `blendQuadCorners` interpolates live corner coordinates smoothly across camera frames.
- `estimateFlattenedSize` derives upright document dimensions from the longer of opposite edges while capping the long side at `maxDimension`.
- `warpPerspectiveRgba` uses OpenCV `cv.getPerspectiveTransform` and `cv.warpPerspective` to straighten a tilted 4-corner quadrilateral into an upright rectangular buffer while freeing WASM `cv.Mat` instances.
- `detectDocumentQuad` uses `jscanify` (`findPaperContour` + `getCornerPoints`) to locate the 4 corners of a tilted paper document on a desk background and returns `null` when no valid page contour is present.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-23 17:10:18 | `pnpm exec vitest run tests/unit/lib/document-detect.test.ts tests/unit/lib/document-scanner.test.ts` | 9 passed (targeted: 12/12 across 2 files) | 275 ms (479 ms total) |
| 2026-11-23 16:52:42 | `pnpm test:unit` | 4 passed, 5 failed (`Promise.prototype.then` ESM namespace receiver on `@techstark/opencv-js`; fixed via `src/lib/opencv-loader.cjs`) | 483 ms |
| 2026-11-23 16:29:38 | `pnpm test:unit tests/unit/lib/document-detect.test.ts tests/unit/lib/document-scanner.test.ts` | 14 passed (suite: 208/208 across 49 files) | 101 ms (2.95 s suite) |
