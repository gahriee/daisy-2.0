import {
  detectDocumentQuad,
  estimateFlattenedSize,
  warpPerspectiveRgba,
  type Point,
  type QuadCorners,
} from "./document-detect";

export type DocumentScanFilterMode = "ORIGINAL" | "MAGIC_WHITE" | "BW_SCAN";

export const DOCUMENT_SCAN_MODE_LABELS: Record<DocumentScanFilterMode, string> =
  {
    MAGIC_WHITE: "Magic white",
    BW_SCAN: "B&W scan",
    ORIGINAL: "Original",
  };

function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Separable O(W*H) 2D morphological dilation (sliding-window maximum) using a
 * monotonic deque. Estimates the true local paper background brightness even
 * inside dense paragraphs of small printed text without dark ink dragging the
 * paper estimate down.
 */
function morphDilateGray(
  lum: Float64Array,
  width: number,
  height: number,
  radius: number,
): Float64Array {
  const total = width * height;
  const horiz = new Float64Array(total);
  const out = new Float64Array(total);
  const deque = new Int32Array(Math.max(width, height));

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let head = 0;
    let tail = 0;
    for (let x = 0; x < width + radius; x++) {
      if (x < width) {
        const val = lum[row + x]!;
        while (tail > head && lum[row + deque[tail - 1]!]! <= val) {
          tail -= 1;
        }
        deque[tail++] = x;
      }
      const outX = x - radius;
      if (outX >= 0) {
        if (deque[head]! < outX - radius) head += 1;
        horiz[row + outX] = lum[row + deque[head]!]!;
      }
    }
  }

  for (let x = 0; x < width; x++) {
    let head = 0;
    let tail = 0;
    for (let y = 0; y < height + radius; y++) {
      if (y < height) {
        const val = horiz[y * width + x]!;
        while (tail > head && horiz[deque[tail - 1]! * width + x]! <= val) {
          tail -= 1;
        }
        deque[tail++] = y;
      }
      const outY = y - radius;
      if (outY >= 0) {
        if (deque[head]! < outY - radius) head += 1;
        out[outY * width + x] = horiz[deque[head]! * width + x]!;
      }
    }
  }

  return out;
}

/**
 * Separable O(W*H) box blur on a floating-point grayscale buffer to smooth the
 * morphological paper background estimate so illumination division is seamless.
 */
function boxBlurFloat(
  src: Float64Array,
  width: number,
  height: number,
  radius: number,
): Float64Array {
  const total = width * height;
  const horiz = new Float64Array(total);
  const out = new Float64Array(total);
  const prefix = new Float64Array(Math.max(width, height) + 1);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    prefix[0] = 0;
    for (let x = 0; x < width; x++) {
      prefix[x + 1] = prefix[x]! + src[row + x]!;
    }
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      horiz[row + x] = (prefix[x1 + 1]! - prefix[x0]!) / (x1 - x0 + 1);
    }
  }

  for (let x = 0; x < width; x++) {
    prefix[0] = 0;
    for (let y = 0; y < height; y++) {
      prefix[y + 1] = prefix[y]! + horiz[y * width + x]!;
    }
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      out[y * width + x] = (prefix[y1 + 1]! - prefix[y0]!) / (y1 - y0 + 1);
    }
  }

  return out;
}

/**
 * Applies an edge-preserving unsharp mask (`radius = 2`, 5x5 neighborhood) to
 * sharpen soft or slightly out-of-focus phone camera text strokes while
 * ignoring flat paper sensor noise below `threshold`.
 */
export function sharpenDocumentTextRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 1.4,
  threshold = 2,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  const totalPixels = width * height;
  if (width < 3 || height < 3 || rgba.length < totalPixels * 4 || amount <= 0) {
    out.set(rgba);
    return out;
  }

  const stride = width + 1;
  const lum = new Float64Array(totalPixels);
  const sumY = new Float64Array(stride * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const rowOffset = y * width;
    const satRow = (y + 1) * stride;
    const prevSatRow = y * stride;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;
      const gray =
        0.299 * rgba[idx]! + 0.587 * rgba[idx + 1]! + 0.114 * rgba[idx + 2]!;
      lum[rowOffset + x] = gray;
      rowSum += gray;
      sumY[satRow + x + 1] = sumY[prevSatRow + x + 1]! + rowSum;
    }
  }

  const rSharp = 2;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - rSharp);
    const y1 = Math.min(height - 1, y + rSharp);
    const topSat = y0 * stride;
    const botSat = (y1 + 1) * stride;
    const rowH = y1 - y0 + 1;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - rSharp);
      const x1 = Math.min(width - 1, x + rSharp);
      const area = (x1 - x0 + 1) * rowH;
      const blurY =
        (sumY[botSat + x1 + 1]! -
          sumY[topSat + x1 + 1]! -
          sumY[botSat + x0]! +
          sumY[topSat + x0]!) /
        area;

      const p = y * width + x;
      const idx = p * 4;
      const gray = lum[p]!;
      const detail = gray - blurY;

      if (Math.abs(detail) <= threshold) {
        out[idx] = rgba[idx]!;
        out[idx + 1] = rgba[idx + 1]!;
        out[idx + 2] = rgba[idx + 2]!;
        out[idx + 3] = rgba[idx + 3]!;
        continue;
      }

      const delta = detail * amount;
      out[idx] = clampByte(rgba[idx]! + delta);
      out[idx + 1] = clampByte(rgba[idx + 1]! + delta);
      out[idx + 2] = clampByte(rgba[idx + 2]! + delta);
      out[idx + 3] = rgba[idx + 3]!;
    }
  }

  return out;
}

/**
 * Pure O(W*H) CamScanner-style document scan and text enhancer:
 *
 * 1. **Morphological Background Estimation (`morphDilateGray` + `boxBlurFloat`):**
 *    Estimates the true paper illumination surface ignoring dark ink strokes so
 *    dense paragraphs and faint handwriting are never washed out.
 * 2. **Illumination Division & Unsharp Mask (`sharpenDocumentTextRgba`):**
 *    Divides out uneven shadows to `#FFFFFF` and sharpens soft phone-camera
 *    text strokes.
 * 3. **Steep Ink Levels / Black-Point Stretch:**
 *    - `MAGIC_WHITE`: Pulls faint/small printed text and handwriting into deep,
 *      crisp dark ink while preserving colored pen signatures (e.g. blue ink)
 *      and keeping paper pure `#FFFFFF`.
 *    - `BW_SCAN`: High-contrast grayscale adaptive thresholding on the
 *      illumination-divided, sharpened page for laser-sharp black text on pure
 *      `#FFFFFF` paper.
 *    - `ORIGINAL`: Preserves pixel data untouched.
 */
export function enhanceDocumentRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mode: DocumentScanFilterMode,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  if (mode === "ORIGINAL" || width <= 0 || height <= 0) {
    out.set(rgba);
    return out;
  }

  const totalPixels = width * height;
  if (rgba.length < totalPixels * 4) {
    out.set(rgba);
    return out;
  }

  // Step 1: Compute per-pixel luminance and morphological paper background.
  const rawLum = new Float64Array(totalPixels);
  for (let p = 0; p < totalPixels; p++) {
    const idx = p * 4;
    rawLum[p] =
      0.299 * rgba[idx]! + 0.587 * rgba[idx + 1]! + 0.114 * rgba[idx + 2]!;
  }

  const bgRadius = Math.max(
    8,
    Math.min(28, Math.round(Math.min(width, height) / 28)),
  );
  const dilatedBg = morphDilateGray(rawLum, width, height, bgRadius);
  const paperBg = boxBlurFloat(
    dilatedBg,
    width,
    height,
    Math.max(4, Math.round(bgRadius * 0.6)),
  );

  // Step 2: Divide out uneven illumination so blank paper normalizes to 255.
  const divided = new Uint8ClampedArray(rgba.length);
  for (let p = 0; p < totalPixels; p++) {
    const idx = p * 4;
    const bg = Math.max(48, paperBg[p]!);
    const scale = 255 / bg;
    divided[idx] = clampByte(rgba[idx]! * scale);
    divided[idx + 1] = clampByte(rgba[idx + 1]! * scale);
    divided[idx + 2] = clampByte(rgba[idx + 2]! * scale);
    divided[idx + 3] = rgba[idx + 3]!;
  }

  // Step 3: Crisp edge-preserving unsharp mask on the illumination-normalized page.
  const sharpened = sharpenDocumentTextRgba(
    divided,
    width,
    height,
    mode === "BW_SCAN" ? 1.65 : 1.45,
    2,
  );

  // Step 4: Steep ink black-point stretch & pure white paper clipping.
  for (let p = 0; p < totalPixels; p++) {
    const idx = p * 4;
    const r = sharpened[idx]!;
    const g = sharpened[idx + 1]!;
    const b = sharpened[idx + 2]!;
    const alpha = sharpened[idx + 3]!;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (mode === "BW_SCAN") {
      // Crisp black ink on pure white paper with smooth anti-aliased edges.
      if (lum >= 234) {
        out[idx] = 255;
        out[idx + 1] = 255;
        out[idx + 2] = 255;
        out[idx + 3] = alpha;
        continue;
      }
      const soft = smoothstep(148, 232, lum);
      const mono = clampByte(12 + Math.pow(soft, 1.85) * (255 - 12));
      out[idx] = mono;
      out[idx + 1] = mono;
      out[idx + 2] = mono;
      out[idx + 3] = alpha;
      continue;
    }

    // MAGIC_WHITE: Pure #FFFFFF paper above 240; steep gamma black-point stretch
    // for all text and handwriting below 240 while preserving colored ink hues.
    if (lum >= 242) {
      out[idx] = 255;
      out[idx + 1] = 255;
      out[idx + 2] = 255;
      out[idx + 3] = alpha;
      continue;
    }

    const blackPoint = 82;
    const whitePoint = 240;
    const norm = Math.max(
      0,
      Math.min(1, (lum - blackPoint) / (whitePoint - blackPoint)),
    );
    const targetLum = 14 + (255 - 14) * Math.pow(norm, 2.35);

    if (lum >= 224) {
      const whiteBlend = smoothstep(224, 242, lum);
      const gain = targetLum / Math.max(1, lum);
      const darkR = clampByte(r * gain);
      const darkG = clampByte(g * gain);
      const darkB = clampByte(b * gain);
      out[idx] = clampByte(darkR + (255 - darkR) * whiteBlend);
      out[idx + 1] = clampByte(darkG + (255 - darkG) * whiteBlend);
      out[idx + 2] = clampByte(darkB + (255 - darkB) * whiteBlend);
      out[idx + 3] = alpha;
      continue;
    }

    // Preserve ink color ratios (e.g. blue ballpoint signatures) with gentle
    // chroma boost so colored ink stays distinct instead of turning gray.
    const gain = targetLum / Math.max(1, lum);
    const dr = r * gain;
    const dg = g * gain;
    const db = b * gain;
    const boostedLum = 0.299 * dr + 0.587 * dg + 0.114 * db;
    const chromaBoost = 1.2;
    out[idx] = clampByte(boostedLum + (dr - boostedLum) * chromaBoost);
    out[idx + 1] = clampByte(boostedLum + (dg - boostedLum) * chromaBoost);
    out[idx + 2] = clampByte(boostedLum + (db - boostedLum) * chromaBoost);
    out[idx + 3] = alpha;
  }

  return out;
}

export async function computeBlobSha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
  failureMessage: string,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error(failureMessage));
      },
      "image/jpeg",
      quality,
    );
  });
}

export type FlattenedDocumentPhoto = {
  file: File;
  /** Page corners in normalized `[0, 1]` coordinates of the source photo. */
  corners: QuadCorners;
  width: number;
  height: number;
};

/**
 * Finds the paper page in a photo, removes the surrounding background, and
 * straightens it into an upright JPEG. Resolves `null` when no page outline is
 * found so callers can keep the full photo.
 */
export async function flattenDocumentPhoto(params: {
  sourceFile: File;
  detectionMaxDimension?: number;
  sourceMaxDimension?: number;
  outputMaxDimension?: number;
  quality?: number;
}): Promise<FlattenedDocumentPhoto | null> {
  const bitmap = await createImageBitmap(params.sourceFile);
  try {
    const naturalW = bitmap.width;
    const naturalH = bitmap.height;
    if (naturalW <= 0 || naturalH <= 0) return null;

    const detectScale = Math.min(
      1,
      (params.detectionMaxDimension ?? 320) / Math.max(naturalW, naturalH),
    );
    const detectW = Math.max(1, Math.round(naturalW * detectScale));
    const detectH = Math.max(1, Math.round(naturalH * detectScale));
    const detectCanvas = document.createElement("canvas");
    detectCanvas.width = detectW;
    detectCanvas.height = detectH;
    const detectCtx = detectCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!detectCtx) return null;
    detectCtx.drawImage(bitmap, 0, 0, detectW, detectH);
    const detected = await detectDocumentQuad(
      detectCtx.getImageData(0, 0, detectW, detectH).data,
      detectW,
      detectH,
    );
    if (!detected) return null;

    const sourceScale = Math.min(
      1,
      (params.sourceMaxDimension ?? 2400) / Math.max(naturalW, naturalH),
    );
    const srcW = Math.max(1, Math.round(naturalW * sourceScale));
    const srcH = Math.max(1, Math.round(naturalH * sourceScale));
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
    if (!srcCtx) return null;
    srcCtx.drawImage(bitmap, 0, 0, srcW, srcH);
    const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;

    const toSourcePixels = (p: Point): Point => ({
      x: p.x * srcW,
      y: p.y * srcH,
    });
    const sourceCorners: QuadCorners = [
      toSourcePixels(detected.corners[0]),
      toSourcePixels(detected.corners[1]),
      toSourcePixels(detected.corners[2]),
      toSourcePixels(detected.corners[3]),
    ];
    const size = estimateFlattenedSize(
      sourceCorners,
      params.outputMaxDimension ?? 2000,
    );
    const warped = await warpPerspectiveRgba(
      srcData,
      srcW,
      srcH,
      sourceCorners,
      size.width,
      size.height,
    );

    const outCanvas = document.createElement("canvas");
    outCanvas.width = size.width;
    outCanvas.height = size.height;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) return null;
    const outImage = outCtx.createImageData(size.width, size.height);
    outImage.data.set(warped);
    outCtx.putImageData(outImage, 0, 0);

    const blob = await canvasToJpegBlob(
      outCanvas,
      params.quality ?? 0.92,
      "Could not save the trimmed page.",
    );
    const baseName = params.sourceFile.name.replace(/\.[^.]+$/, "") || "page";
    return {
      file: new File([blob], `${baseName}-page.jpg`, { type: "image/jpeg" }),
      corners: detected.corners,
      width: size.width,
      height: size.height,
    };
  } finally {
    bitmap.close();
  }
}

export type ProcessedContractScan = {
  blob: Blob;
  fileName: string;
  mimeType: "image/jpeg";
  byteSize: number;
  sha256: string;
  width: number;
  height: number;
};

/**
 * Renders a photo into an HTML5 Canvas with optional 90-degree clockwise rotations,
 * applies the chosen document scan filter, and exports a compressed JPEG.
 */
export async function processContractScanFile(params: {
  sourceFile: File;
  mode: DocumentScanFilterMode;
  rotationQuarterTurns: number;
  maxDimension?: number;
  quality?: number;
}): Promise<ProcessedContractScan> {
  const bitmap = await createImageBitmap(params.sourceFile);
  try {
    const turns = ((params.rotationQuarterTurns % 4) + 4) % 4;
    const rotated = turns % 2 === 1;
    const naturalW = rotated ? bitmap.height : bitmap.width;
    const naturalH = rotated ? bitmap.width : bitmap.height;
    const maxDim = params.maxDimension ?? 2200;
    const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH, 1));
    const width = Math.max(1, Math.round(naturalW * scale));
    const height = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error(
        "Canvas image processing is unavailable in this browser.",
      );
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate((turns * Math.PI) / 2);
    const drawW = rotated ? height : width;
    const drawH = rotated ? width : height;
    ctx.drawImage(bitmap, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    if (params.mode !== "ORIGINAL") {
      const imageData = ctx.getImageData(0, 0, width, height);
      const enhanced = enhanceDocumentRgba(
        imageData.data,
        width,
        height,
        params.mode,
      );
      imageData.data.set(enhanced);
      ctx.putImageData(imageData, 0, 0);
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("Could not encode scanned page as JPEG."));
        },
        "image/jpeg",
        params.quality ?? 0.9,
      );
    });

    const sha256 = await computeBlobSha256Hex(blob);
    const baseName = params.sourceFile.name.replace(/\.[^.]+$/, "") || "page";
    return {
      blob,
      fileName: `${baseName}.jpg`,
      mimeType: "image/jpeg",
      byteSize: blob.size,
      sha256,
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}
