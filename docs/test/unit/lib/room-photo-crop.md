# Room photo crop & dimension helpers

- Status: PASS
- Last run: 2026-11-18 04:05:33 (UTC+8)
- Runtime: Windows, Node 26.13.1, pnpm 12.18.0, Vitest 5.1.0
- Command: `pnpm test:unit`
- Result: 3 passed here (8 ms); suite 172 passed, 0 failed, 0 skipped across 44 files, 2.57 s.
- Target file: [tests/unit/lib/room-photo-crop.test.ts](../../../../tests/unit/lib/room-photo-crop.test.ts) -> [src/lib/room-photo-crop.ts](../../../../src/lib/room-photo-crop.ts)

## Verified criteria

- `computeRotatedBoundingBox` preserves dimensions at `0`/`180` degrees and swaps width/height accurately at `90` degrees.
- `computeDefaultAspectCropArea` derives centered `4:3` (`1200 x 900` aspect) pixel crop rectangles for landscape, portrait, and rotated photos without exceeding image bounds.
- `buildCroppedPhotoFileName` normalizes arbitrary filenames and folder prefixes into bounded `.jpg` names (`<= 180` chars) matching `CreateRoomPhotoIntentSchema`.

## Run History

| Run (UTC+8) | Command | Result | Duration |
| --- | --- | --- | --- |
| 2026-11-18 04:05:33 | pnpm test:unit | 3 passed (suite: 172/172 across 44 files) | 8 ms (2.57 s suite) |

