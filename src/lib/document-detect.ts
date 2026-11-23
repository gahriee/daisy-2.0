import type JScanify from "jscanify/client";
import type { JScanifyCornerPoints } from "jscanify/client";

export type Point = { x: number; y: number };

/** Corners ordered top-left, top-right, bottom-right, bottom-left. */
export type QuadCorners = readonly [Point, Point, Point, Point];

export type DetectedDocument = {
  /** Page corners in normalized `[0, 1]` frame coordinates. */
  corners: QuadCorners;
  /** Fraction of the frame covered by the page. */
  coverage: number;
};

export type CoverCrop = { x: number; y: number; width: number; height: number };

type OpenCvMat = {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32S: Int32Array;
  delete(): void;
};

export type OpenCvRuntime = {
  Mat?: new () => OpenCvMat;
  Size: new (width: number, height: number) => unknown;
  Scalar: new () => unknown;
  CV_32FC2: number;
  INTER_LINEAR: number;
  BORDER_CONSTANT: number;
  onRuntimeInitialized?: (() => void) | undefined;
  matFromImageData(imageData: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }): OpenCvMat;
  matFromArray(
    rows: number,
    cols: number,
    type: number,
    array: number[],
  ): OpenCvMat;
  contourArea(contour: unknown): number;
  getPerspectiveTransform(src: OpenCvMat, dst: OpenCvMat): OpenCvMat;
  warpPerspective(
    src: OpenCvMat,
    dst: OpenCvMat,
    m: OpenCvMat,
    dsize: unknown,
    flags: number,
    borderMode: number,
    borderValue: unknown,
  ): void;
};

export type JScanifyEngine = {
  cv: OpenCvRuntime;
  scanner: JScanify;
};

const MIN_COVERAGE = 0.1;
const MAX_COVERAGE = 0.95;
const MIN_CORNER_ANGLE = 40;
const MAX_CORNER_ANGLE = 140;
const MIN_OPPOSITE_SIDE_RATIO = 0.42;

let enginePromise: Promise<JScanifyEngine> | null = null;
let loadedEngine: JScanifyEngine | null = null;

/**
 * Lazy-loads `@techstark/opencv-js` (WebAssembly) and `jscanify/client` once on
 * demand so the main application bundle never pays the OpenCV WASM cost upfront.
 */
export async function loadJScanifyEngine(): Promise<JScanifyEngine> {
  if (loadedEngine) return loadedEngine;
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    const loader = await import("@/lib/opencv-loader.cjs");
    const resolved = await loader.loadOpenCvAndJScanify();
    loadedEngine = resolved;
    return loadedEngine;
  })();

  return enginePromise;
}

export function getLoadedJScanifyEngine(): JScanifyEngine | null {
  return loadedEngine;
}

/**
 * Returns the centered source region that a CSS `object-fit: cover` element of
 * `targetAspect` (width / height) displays, so captures match the viewfinder.
 */
export function computeCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: number,
): CoverCrop {
  const width = Math.max(0, Math.round(sourceWidth));
  const height = Math.max(0, Math.round(sourceHeight));
  if (width === 0 || height === 0 || !(targetAspect > 0)) {
    return { x: 0, y: 0, width, height };
  }
  if (width / height > targetAspect) {
    const cropWidth = Math.max(1, Math.round(height * targetAspect));
    return {
      x: Math.round((width - cropWidth) / 2),
      y: 0,
      width: cropWidth,
      height,
    };
  }
  const cropHeight = Math.max(1, Math.round(width / targetAspect));
  return {
    x: 0,
    y: Math.round((height - cropHeight) / 2),
    width,
    height: cropHeight,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Moves each corner `amount` (0..1) of the way from `previous` toward `next`. */
export function blendQuadCorners(
  previous: QuadCorners,
  next: QuadCorners,
  amount: number,
): QuadCorners {
  const t = Math.max(0, Math.min(1, amount));
  const mix = (a: Point, b: Point): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  return [
    mix(previous[0], next[0]),
    mix(previous[1], next[1]),
    mix(previous[2], next[2]),
    mix(previous[3], next[3]),
  ];
}

/**
 * Output size for a flattened page, using the longer of each pair of opposite
 * edges (in source pixels) and capping the long side at `maxDimension`.
 */
export function estimateFlattenedSize(
  corners: QuadCorners,
  maxDimension: number,
): { width: number; height: number } {
  const [tl, tr, br, bl] = corners;
  const rawWidth = Math.max(distance(tl, tr), distance(bl, br));
  const rawHeight = Math.max(distance(tl, bl), distance(tr, br));
  const scale = Math.min(1, maxDimension / Math.max(rawWidth, rawHeight, 1));
  return {
    width: Math.max(1, Math.round(rawWidth * scale)),
    height: Math.max(1, Math.round(rawHeight * scale)),
  };
}

function cornerAngleDegrees(prev: Point, corner: Point, next: Point): number {
  const ax = prev.x - corner.x;
  const ay = prev.y - corner.y;
  const bx = next.x - corner.x;
  const by = next.y - corner.y;
  const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (lengths === 0) return 0;
  const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / lengths));
  return (Math.acos(cos) * 180) / Math.PI;
}

function validateDetectedQuad(
  corners: JScanifyCornerPoints,
  width: number,
  height: number,
): DetectedDocument | null {
  const {
    topLeftCorner: tl,
    topRightCorner: tr,
    bottomRightCorner: br,
    bottomLeftCorner: bl,
  } = corners;
  if (!tl || !tr || !br || !bl) return null;

  const ordered: QuadCorners = [tl, tr, br, bl];
  const quadArea = polygonArea(ordered);
  const coverage = quadArea / (width * height);
  if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) return null;

  for (let i = 0; i < 4; i++) {
    const angle = cornerAngleDegrees(
      ordered[(i + 3) % 4]!,
      ordered[i]!,
      ordered[(i + 1) % 4]!,
    );
    if (angle < MIN_CORNER_ANGLE || angle > MAX_CORNER_ANGLE) return null;
  }

  const horizontalRatio =
    Math.min(distance(tl, tr), distance(bl, br)) /
    Math.max(distance(tl, tr), distance(bl, br), 1e-6);
  const verticalRatio =
    Math.min(distance(tl, bl), distance(tr, br)) /
    Math.max(distance(tl, bl), distance(tr, br), 1e-6);
  if (
    horizontalRatio < MIN_OPPOSITE_SIDE_RATIO ||
    verticalRatio < MIN_OPPOSITE_SIDE_RATIO
  ) {
    return null;
  }

  const normalize = (p: Point): Point => ({
    x: Math.max(0, Math.min(1, p.x / width)),
    y: Math.max(0, Math.min(1, p.y / height)),
  });

  return {
    corners: [normalize(tl), normalize(tr), normalize(br), normalize(bl)],
    coverage,
  };
}

/**
 * Synchronous paper quad detection using `jscanify` (`findPaperContour` +
 * `getCornerPoints`) when the OpenCV WASM engine is already loaded.
 */
export function detectDocumentQuadSync(
  engine: JScanifyEngine,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): DetectedDocument | null {
  const total = width * height;
  if (width < 16 || height < 16 || rgba.length < total * 4) return null;

  const img = engine.cv.matFromImageData({ data: rgba, width, height });
  let contour: OpenCvMat | null = null;
  try {
    contour = engine.scanner.findPaperContour(img) as OpenCvMat | null;
    if (!contour) return null;
    const rawCorners = engine.scanner.getCornerPoints(contour, img);
    return validateDetectedQuad(rawCorners, width, height);
  } finally {
    if (contour) contour.delete();
    img.delete();
  }
}

/**
 * Async paper quad detection that ensures `jscanify` + `@techstark/opencv-js`
 * are initialized before running `findPaperContour` and `getCornerPoints`.
 */
export async function detectDocumentQuad(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<DetectedDocument | null> {
  const engine = await loadJScanifyEngine();
  return detectDocumentQuadSync(engine, rgba, width, height);
}

/**
 * Uses OpenCV (`cv.getPerspectiveTransform` + `cv.warpPerspective`, the core of
 * `jscanify.extractPaper`) to perspective-flatten the 4-corner document region
 * into an upright `outWidth x outHeight` RGBA buffer while freeing WASM mats.
 */
export async function warpPerspectiveRgba(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  corners: QuadCorners,
  outWidth: number,
  outHeight: number,
): Promise<Uint8ClampedArray> {
  const engine = await loadJScanifyEngine();
  const { cv } = engine;
  const [tl, tr, br, bl] = corners;

  const img = cv.matFromImageData({
    data: src,
    width: srcWidth,
    height: srcHeight,
  });
  const warpedDst = new cv.Mat!();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x,
    tl.y,
    tr.x,
    tr.y,
    bl.x,
    bl.y,
    br.x,
    br.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    outWidth,
    0,
    0,
    outHeight,
    outWidth,
    outHeight,
  ]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);

  try {
    const dsize = new cv.Size(outWidth, outHeight);
    cv.warpPerspective(
      img,
      warpedDst,
      M,
      dsize,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(),
    );
    return new Uint8ClampedArray(warpedDst.data);
  } finally {
    M.delete();
    dstTri.delete();
    srcTri.delete();
    warpedDst.delete();
    img.delete();
  }
}
