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
  /** Ratio of actual contour area to fitted quad area (`0..1+`). */
  solidity: number;
  /** Composite candidate quality score used to pick the best detection. */
  score: number;
};

export type CoverCrop = { x: number; y: number; width: number; height: number };

export type DocumentDetectorConfig = {
  /** Minimum fraction of the frame a valid document must occupy. */
  minCoverage: number;
  /** Maximum fraction of the frame before rejecting full-frame false positives. */
  maxCoverage: number;
  /** Minimum contourArea / quadArea ratio (rejects merged-stripe convex hulls). */
  minSolidity: number;
  /** Valid interior corner angle bounds in degrees. */
  minCornerAngleDeg: number;
  maxCornerAngleDeg: number;
  /** Minimum length ratio between opposite edges. */
  minOppositeSideRatio: number;
  /** Normalized edge margin for counting corners pinned to outer frame edges. */
  borderMargin: number;
  /** Maximum corners allowed on the outer frame border before rejecting candidate. */
  maxBorderCorners: number;
  /** Rolling history window for per-corner median stabilization. */
  medianWindowFrames: number;
  /** Consecutive stable frames required to enter the locked state. */
  lockFramesRequired: number;
  /** Consecutive missed frames tolerated before releasing a locked outline. */
  maxMissedFrames: number;
  /** Corner movement below this normalized distance is frozen (0-jitter deadband). */
  jitterDeadband: number;
  /** Sudden jump above this normalized distance requires multi-frame confirmation. */
  jumpGateThreshold: number;
  /** Consecutive consistent frames required to accept a large jump. */
  jumpConfirmFrames: number;
  /** Low-pass EMA smoothing factor for steady tracking once locked. */
  emaAlpha: number;
};

/**
 * Default detection and temporal stabilization parameters modeled after
 * standard real-time document scanners (OpenCV + WeScan / Apple Vision style
 * multi-frame consensus, deadband, and jump hysteresis).
 */
export const DEFAULT_DOCUMENT_DETECTOR_CONFIG: Readonly<DocumentDetectorConfig> =
  {
    minCoverage: 0.14,
    maxCoverage: 0.9,
    minSolidity: 0.76,
    minCornerAngleDeg: 52,
    maxCornerAngleDeg: 128,
    minOppositeSideRatio: 0.52,
    borderMargin: 0.015,
    maxBorderCorners: 2,
    medianWindowFrames: 5,
    lockFramesRequired: 3,
    maxMissedFrames: 5,
    jitterDeadband: 0.012,
    jumpGateThreshold: 0.11,
    jumpConfirmFrames: 3,
    emaAlpha: 0.28,
  };

export type StabilizerState = "searching" | "stabilizing" | "locked";

export type StabilizedDocumentResult = {
  corners: QuadCorners | null;
  state: StabilizerState;
  stableFrames: number;
};

type OpenCvMat = {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32S: Int32Array;
  delete(): void;
};

type OpenCvMatVector = {
  size(): number;
  get(index: number): OpenCvMat;
  delete(): void;
};

export type OpenCvRuntime = {
  Mat?: new () => OpenCvMat;
  MatVector: new () => OpenCvMatVector;
  Size: new (width: number, height: number) => unknown;
  Scalar: new () => unknown;
  CV_32FC2: number;
  COLOR_RGBA2GRAY: number;
  THRESH_BINARY: number;
  THRESH_OTSU: number;
  MORPH_RECT: number;
  MORPH_CLOSE: number;
  MORPH_OPEN: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
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
  cvtColor(src: OpenCvMat, dst: OpenCvMat, code: number): void;
  GaussianBlur(
    src: OpenCvMat,
    dst: OpenCvMat,
    ksize: unknown,
    sigmaX: number,
  ): void;
  threshold(
    src: OpenCvMat,
    dst: OpenCvMat,
    thresh: number,
    maxval: number,
    type: number,
  ): number;
  getStructuringElement(shape: number, ksize: unknown): OpenCvMat;
  morphologyEx(
    src: OpenCvMat,
    dst: OpenCvMat,
    op: number,
    kernel: OpenCvMat,
  ): void;
  findContours(
    image: OpenCvMat,
    contours: OpenCvMatVector,
    hierarchy: OpenCvMat,
    mode: number,
    method: number,
  ): void;
  contourArea(contour: unknown): number;
  convexHull(
    points: OpenCvMat,
    hull: OpenCvMat,
    clockwise?: boolean,
    returnPoints?: boolean,
  ): void;
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

const MIN_PAPER_SCORE_CONTRAST = 20;
const MIN_PAPER_SCORE_MEAN = 55;

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

export function maxCornerDelta(a: QuadCorners, b: QuadCorners): number {
  let max = 0;
  for (let i = 0; i < 4; i++) {
    const d = distance(a[i]!, b[i]!);
    if (d > max) max = d;
  }
  return max;
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

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function medianQuadCorners(history: readonly QuadCorners[]): QuadCorners {
  const pts: Point[] = [];
  for (let i = 0; i < 4; i++) {
    pts.push({
      x: medianNumber(history.map((q) => q[i]!.x)),
      y: medianNumber(history.map((q) => q[i]!.y)),
    });
  }
  return [pts[0]!, pts[1]!, pts[2]!, pts[3]!];
}

/**
 * Multi-frame temporal stabilizer for live camera document detection:
 * - Rolling median filter across recent frames suppresses single-frame noise.
 * - Jump/outlier hysteresis gate ignores sudden large jumps (e.g., transient
 *   flicker or hand movement) until confirmed across consecutive frames.
 * - Jitter deadband freezes tiny sub-1.2% oscillations when holding still.
 * - Miss hysteresis holds a locked outline briefly during autofocus blur.
 */
export class DocumentQuadStabilizer {
  private readonly cfg: DocumentDetectorConfig;
  private history: QuadCorners[] = [];
  private displayed: QuadCorners | null = null;
  private pendingJump: QuadCorners[] = [];
  private stableFrames = 0;
  private missedFrames = 0;

  constructor(config: Partial<DocumentDetectorConfig> = {}) {
    this.cfg = { ...DEFAULT_DOCUMENT_DETECTOR_CONFIG, ...config };
  }

  reset(): void {
    this.history = [];
    this.displayed = null;
    this.pendingJump = [];
    this.stableFrames = 0;
    this.missedFrames = 0;
  }

  getLockedCorners(): QuadCorners | null {
    return this.stableFrames >= this.cfg.lockFramesRequired
      ? this.displayed
      : null;
  }

  push(detected: DetectedDocument | null): StabilizedDocumentResult {
    if (!detected) {
      this.pendingJump = [];
      this.missedFrames += 1;
      if (this.missedFrames > this.cfg.maxMissedFrames) {
        this.reset();
        return { corners: null, state: "searching", stableFrames: 0 };
      }
      return {
        corners: this.displayed,
        state:
          this.displayed && this.stableFrames >= this.cfg.lockFramesRequired
            ? "locked"
            : this.displayed
              ? "stabilizing"
              : "searching",
        stableFrames: this.stableFrames,
      };
    }

    this.missedFrames = 0;
    const incoming = detected.corners;

    // Outlier / jump hysteresis gate: ignore sudden jumps unless confirmed.
    if (this.displayed) {
      const deltaFromDisplayed = maxCornerDelta(this.displayed, incoming);
      if (deltaFromDisplayed > this.cfg.jumpGateThreshold) {
        const lastJump = this.pendingJump[this.pendingJump.length - 1];
        if (
          lastJump &&
          maxCornerDelta(lastJump, incoming) <= this.cfg.jumpGateThreshold
        ) {
          this.pendingJump.push(incoming);
        } else {
          this.pendingJump = [incoming];
        }

        if (this.pendingJump.length < this.cfg.jumpConfirmFrames) {
          // Reject momentary jump and keep the stable displayed outline.
          return {
            corners: this.displayed,
            state:
              this.stableFrames >= this.cfg.lockFramesRequired
                ? "locked"
                : "stabilizing",
            stableFrames: this.stableFrames,
          };
        }

        // Confirmed deliberate camera/page movement: reset to new position.
        const confirmed = medianQuadCorners(this.pendingJump);
        this.history = [...this.pendingJump];
        this.pendingJump = [];
        this.displayed = confirmed;
        this.stableFrames = 1;
        return {
          corners: this.displayed,
          state: "stabilizing",
          stableFrames: this.stableFrames,
        };
      }
    }

    this.pendingJump = [];
    this.history.push(incoming);
    if (this.history.length > this.cfg.medianWindowFrames) {
      this.history.shift();
    }

    const median = medianQuadCorners(this.history);
    if (!this.displayed) {
      this.displayed = median;
      this.stableFrames = 1;
    } else {
      const delta = maxCornerDelta(this.displayed, median);
      if (delta <= this.cfg.jitterDeadband) {
        // Freeze micro-jitter completely while counting toward lock.
        this.stableFrames = Math.min(
          this.cfg.lockFramesRequired + 4,
          this.stableFrames + 1,
        );
      } else {
        this.displayed = blendQuadCorners(
          this.displayed,
          median,
          this.cfg.emaAlpha,
        );
        this.stableFrames =
          delta <= this.cfg.jitterDeadband * 4
            ? Math.min(this.cfg.lockFramesRequired + 4, this.stableFrames + 1)
            : Math.max(1, this.stableFrames - 1);
      }
    }

    const state: StabilizerState =
      this.stableFrames >= this.cfg.lockFramesRequired
        ? "locked"
        : "stabilizing";
    return {
      corners: this.displayed,
      state,
      stableFrames: this.stableFrames,
    };
  }
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

function validateAndScoreCandidate(
  corners: JScanifyCornerPoints,
  contourArea: number,
  width: number,
  height: number,
  cfg: DocumentDetectorConfig = DEFAULT_DOCUMENT_DETECTOR_CONFIG,
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
  const frameArea = width * height;
  const coverage = quadArea / frameArea;
  if (coverage < cfg.minCoverage || coverage > cfg.maxCoverage) return null;

  const solidity = contourArea / Math.max(1, quadArea);
  if (solidity < cfg.minSolidity) return null;

  let anglePenalty = 0;
  for (let i = 0; i < 4; i++) {
    const angle = cornerAngleDegrees(
      ordered[(i + 3) % 4]!,
      ordered[i]!,
      ordered[(i + 1) % 4]!,
    );
    if (angle < cfg.minCornerAngleDeg || angle > cfg.maxCornerAngleDeg) {
      return null;
    }
    anglePenalty += Math.abs(90 - angle) / 90;
  }

  const horizontalRatio =
    Math.min(distance(tl, tr), distance(bl, br)) /
    Math.max(distance(tl, tr), distance(bl, br), 1e-6);
  const verticalRatio =
    Math.min(distance(tl, bl), distance(tr, br)) /
    Math.max(distance(tl, bl), distance(tr, br), 1e-6);
  if (
    horizontalRatio < cfg.minOppositeSideRatio ||
    verticalRatio < cfg.minOppositeSideRatio
  ) {
    return null;
  }

  const normalize = (p: Point): Point => ({
    x: Math.max(0, Math.min(1, p.x / width)),
    y: Math.max(0, Math.min(1, p.y / height)),
  });
  const normalized: QuadCorners = [
    normalize(tl),
    normalize(tr),
    normalize(br),
    normalize(bl),
  ];

  let borderCorners = 0;
  for (const p of normalized) {
    if (
      p.x <= cfg.borderMargin ||
      p.x >= 1 - cfg.borderMargin ||
      p.y <= cfg.borderMargin ||
      p.y >= 1 - cfg.borderMargin
    ) {
      borderCorners += 1;
    }
  }
  if (borderCorners > cfg.maxBorderCorners) return null;

  const clampedSolidity = Math.min(1, solidity);
  const rectScore = Math.max(0, 1 - anglePenalty / 4);
  const borderBonus =
    borderCorners === 0 ? 1 : borderCorners === 1 ? 0.85 : 0.7;
  const score = coverage * clampedSolidity * rectScore * borderBonus;

  let borderCorners = 0;
  for (const p of normalized) {
    if (
      p.x <= cfg.borderMargin ||
      p.x >= 1 - cfg.borderMargin ||
      p.y <= cfg.borderMargin ||
      p.y >= 1 - cfg.borderMargin
    ) {
      borderCorners += 1;
    }
  }
  if (borderCorners > cfg.maxBorderCorners) return null;

  const clampedSolidity = Math.min(1, solidity);
  const rectScore = Math.max(0, 1 - anglePenalty / 4);
  const borderBonus =
    borderCorners === 0 ? 1 : borderCorners === 1 ? 0.85 : 0.7;
  const score = coverage * clampedSolidity * rectScore * borderBonus;

  return {
    corners: normalized,
    coverage,
    solidity: clampedSolidity,
    score,
  };
}

/**
 * Builds an RGBA buffer where neutral paper pixels (white, cream, or shadowed
 * gray where R ≈ G ≈ B) stay bright while warm/colored backgrounds (wooden
 * desks, skin tones, colored surfaces where G > B or saturation is high) are
 * suppressed to dark values before OpenCV + jscanify contour extraction.
 */
function buildNeutralPaperRgba(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const yellowWarmth = Math.max(0, g - b);
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const v = Math.max(
      0,
      Math.min(255, Math.round(b - 1.5 * yellowWarmth - 0.25 * sat)),
    );
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Multi-threshold chroma-suppressed OpenCV + `jscanify` paper segmentation:
 * - Applies `MORPH_OPEN` BEFORE `MORPH_CLOSE` so thin light stripes (e.g.
 *   plaid bedsheets) are severed before closing printed text gaps.
 * - Evaluates `[Otsu, Otsu + 24, Otsu + 44]` thresholds and scores candidates
 *   by solidity (`contourArea / quadArea`), rectangularity, and border margin,
 *   preventing merged background hulls from winning.
 */
function detectByMultiThresholdOpenCv(
  engine: JScanifyEngine,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  cfg: DocumentDetectorConfig,
): DetectedDocument | null {
  const { cv, scanner } = engine;
  const neutralRgba = buildNeutralPaperRgba(rgba);
  const mat = cv.matFromImageData({ data: neutralRgba, width, height });
  const gray = new cv.Mat!();
  const blurred = new cv.Mat!();
  const otsuMask = new cv.Mat!();
  const minSide = Math.min(width, height);
  const openSize = Math.max(5, Math.round(minSide / 26) | 1);
  const closeSize = Math.max(5, Math.round(minSide / 32) | 1);
  const kernelOpen = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(openSize, openSize),
  );
  const kernelClose = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(closeSize, closeSize),
  );

  try {
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    const otsuVal = cv.threshold(
      blurred,
      otsuMask,
      0,
      255,
      cv.THRESH_BINARY + cv.THRESH_OTSU,
    );

    // Ensure the scene actually has a bright paper region distinct from background.
    const maskBytes = otsuMask.data;
    const scoreBytes = blurred.data;
    let fgSum = 0;
    let fgCount = 0;
    let bgSum = 0;
    for (let i = 0; i < maskBytes.length; i++) {
      if (maskBytes[i]! > 0) {
        fgSum += scoreBytes[i]!;
        fgCount += 1;
      } else {
        bgSum += scoreBytes[i]!;
      }
    }
    const bgCount = maskBytes.length - fgCount;
    if (fgCount === 0 || bgCount === 0) return null;
    const fgMean = fgSum / fgCount;
    const bgMean = bgSum / bgCount;
    if (
      fgMean < MIN_PAPER_SCORE_MEAN ||
      fgMean - bgMean < MIN_PAPER_SCORE_CONTRAST
    ) {
      return null;
    }

    let bestDetected: DetectedDocument | null = null;
    const offsets = [0, 24, 44];

    for (const offset of offsets) {
      const thresholdVal = Math.min(238, otsuVal + offset);
      const thresh = new cv.Mat!();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat!();
      let bestContour: OpenCvMat | null = null;
      let hull: OpenCvMat | null = null;

      try {
        cv.threshold(blurred, thresh, thresholdVal, 255, cv.THRESH_BINARY);
        // Open first to disconnect thin bright stripes/objects, then close text gaps.
        cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernelOpen);
        cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernelClose);

        cv.findContours(
          thresh,
          contours,
          hierarchy,
          cv.RETR_EXTERNAL,
          cv.CHAIN_APPROX_SIMPLE,
        );

        let maxArea = 0;
        let maxIdx = -1;
        for (let i = 0; i < contours.size(); i++) {
          const candidate = contours.get(i);
          const area = cv.contourArea(candidate);
          candidate.delete();
          if (area > maxArea) {
            maxArea = area;
            maxIdx = i;
          }
        }
        if (maxIdx < 0) continue;

        bestContour = contours.get(maxIdx);
        hull = new cv.Mat!();
        cv.convexHull(bestContour, hull, false, true);
        const rawCorners = scanner.getCornerPoints(hull, mat);
        const scored = validateAndScoreCandidate(
          rawCorners,
          maxArea,
          width,
          height,
          cfg,
        );
        if (scored && (!bestDetected || scored.score > bestDetected.score)) {
          bestDetected = scored;
        }
      } finally {
        if (hull) hull.delete();
        if (bestContour) bestContour.delete();
        hierarchy.delete();
        contours.delete();
        thresh.delete();
      }
    }

    return bestDetected;
  } finally {
    kernelClose.delete();
    kernelOpen.delete();
    otsuMask.delete();
    blurred.delete();
    gray.delete();
    mat.delete();
  }
}

/**
 * Synchronous paper quad detection using OpenCV + `jscanify`:
 * 1. Multi-threshold chroma-suppressed OpenCV segmentation + solidity scoring
 *    (handles wooden desks, dark surfaces, and striped/plaid fabrics).
 * 2. Fallback to `jscanify.findPaperContour` + `getCornerPoints` with the same
 *    solidity and border-corner validation guards.
 */
export function detectDocumentQuadSync(
  engine: JScanifyEngine,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  config: Partial<DocumentDetectorConfig> = {},
): DetectedDocument | null {
  const total = width * height;
  if (width < 16 || height < 16 || rgba.length < total * 4) return null;

  const cfg = { ...DEFAULT_DOCUMENT_DETECTOR_CONFIG, ...config };
  const multiThresholdResult = detectByMultiThresholdOpenCv(
    engine,
    rgba,
    width,
    height,
    cfg,
  );
  if (multiThresholdResult) return multiThresholdResult;

  const img = engine.cv.matFromImageData({ data: rgba, width, height });
  let contour: OpenCvMat | null = null;
  try {
    contour = engine.scanner.findPaperContour(img) as OpenCvMat | null;
    if (!contour) return null;
    const area = engine.cv.contourArea(contour);
    const rawCorners = engine.scanner.getCornerPoints(contour, img);
    return validateAndScoreCandidate(rawCorners, area, width, height, cfg);
  } finally {
    if (contour) contour.delete();
    img.delete();
  }
}

/**
 * Async paper quad detection that ensures `jscanify` + `@techstark/opencv-js`
 * are initialized before running contour and corner detection.
 */
export async function detectDocumentQuad(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  config: Partial<DocumentDetectorConfig> = {},
): Promise<DetectedDocument | null> {
  const engine = await loadJScanifyEngine();
  return detectDocumentQuadSync(engine, rgba, width, height, config);
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
