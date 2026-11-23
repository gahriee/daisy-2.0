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
 * Pure O(W*H) integral-image document scan enhancer.
 *
 * - `MAGIC_WHITE`: Locally normalizes uneven shadows and warm/gray paper tint
 *   to #FFFFFF while preserving colored ink and handwritten signatures.
 * - `BW_SCAN`: Sauvola adaptive local thresholding for crisp dark text on pure
 *   #FFFFFF backgrounds.
 * - `ORIGINAL`: Preserves pixel data untouched.
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

  const stride = width + 1;
  const lum = new Float64Array(totalPixels);
  const sumY = new Float64Array(stride * (height + 1));
  const sumY2 =
    mode === "BW_SCAN" ? new Float64Array(stride * (height + 1)) : null;

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    let rowSum2 = 0;
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
      if (sumY2) {
        rowSum2 += gray * gray;
        sumY2[satRow + x + 1] = sumY2[prevSatRow + x + 1]! + rowSum2;
      }
    }
  }

  const radius = Math.max(
    8,
    Math.min(48, Math.round(Math.min(width, height) / 22)),
  );

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    const topSat = y0 * stride;
    const botSat = (y1 + 1) * stride;
    const rowHeight = y1 - y0 + 1;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * rowHeight;

      const meanY =
        (sumY[botSat + x1 + 1]! -
          sumY[topSat + x1 + 1]! -
          sumY[botSat + x0]! +
          sumY[topSat + x0]!) /
        area;

      const p = y * width + x;
      const idx = p * 4;
      const gray = lum[p]!;
      const alpha = rgba[idx + 3]!;

      if (mode === "BW_SCAN" && sumY2) {
        const meanY2 =
          (sumY2[botSat + x1 + 1]! -
            sumY2[topSat + x1 + 1]! -
            sumY2[botSat + x0]! +
            sumY2[topSat + x0]!) /
          area;
        const variance = Math.max(0, meanY2 - meanY * meanY);
        const stdDev = Math.sqrt(variance);
        const threshold = Math.max(36, meanY * (1 + 0.22 * (stdDev / 128 - 1)));
        const soft = smoothstep(threshold - 10, threshold + 5, gray);
        const mono = clampByte(14 + soft * (255 - 14));
        out[idx] = mono;
        out[idx + 1] = mono;
        out[idx + 2] = mono;
        out[idx + 3] = alpha;
        continue;
      }

      // MAGIC_WHITE: divide out uneven illumination while preserving ink hues.
      const paperEstimate = Math.max(40, meanY * 1.03 + 2);
      const ratio = gray / paperEstimate;

      if (ratio >= 0.94) {
        out[idx] = 255;
        out[idx + 1] = 255;
        out[idx + 2] = 255;
        out[idx + 3] = alpha;
        continue;
      }

      const r = rgba[idx]!;
      const g = rgba[idx + 1]!;
      const b = rgba[idx + 2]!;
      const normalizedScale = 255 / paperEstimate;
      const liftedR = Math.min(255, r * normalizedScale);
      const liftedG = Math.min(255, g * normalizedScale);
      const liftedB = Math.min(255, b * normalizedScale);

      if (ratio >= 0.82) {
        const whiteBlend = smoothstep(0.82, 0.94, ratio);
        out[idx] = clampByte(liftedR + (255 - liftedR) * whiteBlend);
        out[idx + 1] = clampByte(liftedG + (255 - liftedG) * whiteBlend);
        out[idx + 2] = clampByte(liftedB + (255 - liftedB) * whiteBlend);
        out[idx + 3] = alpha;
        continue;
      }

      // Deepen dark ink strokes gently while preserving color ratios (e.g. blue ink).
      const targetInkLum =
        clampByte(255 * Math.pow(Math.max(0, ratio / 0.85), 1.38) * 0.82) /
        Math.max(1, 0.299 * liftedR + 0.587 * liftedG + 0.114 * liftedB);
      const gain = Math.min(1.05, Math.max(0.25, targetInkLum));

      out[idx] = clampByte(liftedR * gain);
      out[idx + 1] = clampByte(liftedG * gain);
      out[idx + 2] = clampByte(liftedB * gain);
      out[idx + 3] = alpha;
    }
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
    const maxDim = params.maxDimension ?? 1800;
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
        params.quality ?? 0.86,
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
