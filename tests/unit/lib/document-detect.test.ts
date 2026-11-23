import { describe, expect, it } from "vitest";
import {
  blendQuadCorners,
  computeCoverCrop,
  detectDocumentQuad,
  estimateFlattenedSize,
  loadJScanifyEngine,
  warpPerspectiveRgba,
  type Point,
  type QuadCorners,
} from "@/lib/document-detect";

type Rgb = [number, number, number];

function isInsideConvex(p: Point, poly: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}

function makeImage(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Rgb,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

function expectPointNear(actual: Point, expected: Point, tolerance: number) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
}

describe("loadJScanifyEngine", () => {
  it("loads @techstark/opencv-js and jscanify/client singleton", async () => {
    const engine = await loadJScanifyEngine();
    expect(engine.cv.Mat).toBeDefined();
    expect(typeof engine.scanner.findPaperContour).toBe("function");
    expect(typeof engine.scanner.getCornerPoints).toBe("function");
  });
});

describe("computeCoverCrop", () => {
  it("crops the sides of a landscape frame for a portrait viewfinder", () => {
    expect(computeCoverCrop(1920, 1440, 3 / 4)).toEqual({
      x: 420,
      y: 0,
      width: 1080,
      height: 1440,
    });
  });

  it("crops the top and bottom of a tall frame", () => {
    expect(computeCoverCrop(1080, 1920, 3 / 4)).toEqual({
      x: 0,
      y: 240,
      width: 1080,
      height: 1440,
    });
  });
});

describe("blendQuadCorners", () => {
  it("moves each corner part of the way toward the newest outline", () => {
    const a: QuadCorners = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const b: QuadCorners = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ];
    const mixed = blendQuadCorners(a, b, 0.5);
    expect(mixed[0]).toEqual({ x: 0.1, y: 0.1 });
    expect(mixed[2]).toEqual({ x: 0.9, y: 0.9 });
  });
});

describe("estimateFlattenedSize", () => {
  it("uses the longest opposite edges and caps the long side", () => {
    const corners: QuadCorners = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1400 },
      { x: 0, y: 1400 },
    ];
    expect(estimateFlattenedSize(corners, 2000)).toEqual({
      width: 1000,
      height: 1400,
    });
    expect(estimateFlattenedSize(corners, 700)).toEqual({
      width: 500,
      height: 700,
    });
  });
});

describe("warpPerspectiveRgba (OpenCV warpPerspective)", () => {
  it("straightens a tilted page so the output is filled with page pixels", async () => {
    const width = 120;
    const height = 120;
    const page: QuadCorners = [
      { x: 25, y: 15 },
      { x: 100, y: 28 },
      { x: 92, y: 108 },
      { x: 16, y: 96 },
    ];
    const src = makeImage(width, height, (x, y) =>
      isInsideConvex({ x: x + 0.5, y: y + 0.5 }, page)
        ? [230, 30, 30]
        : [20, 40, 200],
    );
    const out = await warpPerspectiveRgba(src, width, height, page, 60, 70);
    let red = 0;
    for (let i = 0; i < out.length; i += 4) {
      if (out[i]! > 150 && out[i + 2]! < 110) red += 1;
    }
    expect(red / (60 * 70)).toBeGreaterThan(0.92);
  });
});

describe("detectDocumentQuad (jscanify + @techstark/opencv-js)", () => {
  const width = 160;
  const height = 200;
  const page: QuadCorners = [
    { x: 34, y: 26 },
    { x: 128, y: 38 },
    { x: 122, y: 178 },
    { x: 26, y: 166 },
  ];

  function pageOnDesk(): Uint8ClampedArray {
    return makeImage(width, height, (x, y) => {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (isInsideConvex(p, page)) {
        const inMargin = x > 44 && x < 112 && y > 50 && y < 160;
        if (inMargin && y % 9 < 2) return [42, 40, 44];
        return [236, 232, 224];
      }
      return [72, 54, 42];
    });
  }

  it("finds the four corners of a tilted page using jscanify", async () => {
    const detected = await detectDocumentQuad(pageOnDesk(), width, height);
    expect(detected).not.toBeNull();
    const tolerance = 0.04;
    detected!.corners.forEach((corner, i) => {
      expectPointNear(
        corner,
        { x: page[i]!.x / width, y: page[i]!.y / height },
        tolerance,
      );
    });
    expect(detected!.coverage).toBeGreaterThan(0.3);
    expect(detected!.coverage).toBeLessThan(0.6);
  });

  it("accurately separates shadowed white paper from a bright warm wooden desk with similar grayscale brightness", async () => {
    // Simulates the real-world case where a warm wooden desk (R=156, G=126, B=68, gray ~130)
    // has almost the same grayscale luminance as shadowed paper (R=142, G=125, B=126, gray ~130)
    // and a dark top border (R=45, G=45, B=43).
    const img = makeImage(width, height, (x, y) => {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (isInsideConvex(p, page)) {
        const inMargin = x > 44 && x < 112 && y > 50 && y < 160;
        if (inMargin && y % 9 < 2) return [52, 48, 50];
        return [142, 125, 126];
      }
      if (y < 28) return [45, 45, 43];
      return [156, 126, 68];
    });

    const detected = await detectDocumentQuad(img, width, height);
    expect(detected).not.toBeNull();
    const tolerance = 0.045;
    detected!.corners.forEach((corner, i) => {
      expectPointNear(
        corner,
        { x: page[i]!.x / width, y: page[i]!.y / height },
        tolerance,
      );
    });
  });

  it("returns null for a plain frame with no page", async () => {
    const plain = makeImage(width, height, () => [120, 110, 100]);
    expect(await detectDocumentQuad(plain, width, height)).toBeNull();
  });

  it("returns null when the frame is too small to analyse", async () => {
    const tiny = makeImage(8, 8, () => [255, 255, 255]);
    expect(await detectDocumentQuad(tiny, 8, 8)).toBeNull();
  });
});
