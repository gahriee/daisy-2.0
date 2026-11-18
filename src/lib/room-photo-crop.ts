import {
  ROOM_PHOTO_ASPECT_RATIO,
  ROOM_PHOTO_OUTPUT_HEIGHT,
  ROOM_PHOTO_OUTPUT_WIDTH,
} from "@/features/rooms/schemas";

export type PixelCropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExportedCroppedRoomPhoto = {
  file: File;
  width: number;
  height: number;
};

const DEFAULT_OUTPUT_MAX_BYTES = 5 * 1024 * 1024;
const EXPORT_QUALITY_STEPS = [0.88, 0.78, 0.68] as const;

/**
 * Computes the axis-aligned bounding box dimensions of a rectangle rotated by `rotationDeg`.
 */
export function computeRotatedBoundingBox(
  width: number,
  height: number,
  rotationDeg: number,
): { width: number; height: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

/**
 * Computes the centered fallback crop rectangle matching `targetAspect` inside
 * a rotated image's bounding box.
 */
export function computeDefaultAspectCropArea(
  naturalWidth: number,
  naturalHeight: number,
  targetAspect: number = ROOM_PHOTO_ASPECT_RATIO,
  rotationDeg = 0,
): PixelCropArea {
  const rotated = computeRotatedBoundingBox(
    naturalWidth,
    naturalHeight,
    rotationDeg,
  );
  if (rotated.width <= 0 || rotated.height <= 0 || targetAspect <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const mediaAspect = rotated.width / rotated.height;
  const cropWidth =
    mediaAspect >= targetAspect ? rotated.height * targetAspect : rotated.width;
  const cropHeight =
    mediaAspect >= targetAspect ? rotated.height : rotated.width / targetAspect;

  return {
    x: Math.max(0, Math.round((rotated.width - cropWidth) / 2)),
    y: Math.max(0, Math.round((rotated.height - cropHeight) / 2)),
    width: Math.max(1, Math.round(cropWidth)),
    height: Math.max(1, Math.round(cropHeight)),
  };
}

/**
 * Normalizes a user-selected filename to a bounded `.jpg` name for cropped JPEG uploads.
 */
export function buildCroppedPhotoFileName(originalName: string): string {
  const leaf = originalName.trim().split(/[/\\]/).pop() ?? "";
  const stem = leaf.replace(/\.[^.]+$/, "").trim() || "room-photo";
  const maxStemLen = 180 - 4;
  return `${stem.slice(0, maxStemLen)}.jpg`;
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("Could not encode cropped room photo as JPEG."));
        }
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Crops and scales an image file into exact `1200 x 900` px (`4:3`) JPEG bytes
 * matching the `/book` storefront cards and room photo gallery.
 */
export async function exportCroppedRoomPhoto(params: {
  sourceFile: File;
  cropAreaPixels: PixelCropArea | null;
  rotationDeg?: number;
  targetWidth?: number;
  targetHeight?: number;
  maxBytes?: number;
}): Promise<ExportedCroppedRoomPhoto> {
  const targetWidth = params.targetWidth ?? ROOM_PHOTO_OUTPUT_WIDTH;
  const targetHeight = params.targetHeight ?? ROOM_PHOTO_OUTPUT_HEIGHT;
  const rotationDeg = params.rotationDeg ?? 0;
  const maxBytes = params.maxBytes ?? DEFAULT_OUTPUT_MAX_BYTES;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(params.sourceFile);
  } catch {
    throw new Error(
      `Could not read "${params.sourceFile.name}". Select a valid JPEG, PNG, or WebP photo.`,
    );
  }

  try {
    const crop =
      params.cropAreaPixels &&
      params.cropAreaPixels.width > 0 &&
      params.cropAreaPixels.height > 0
        ? params.cropAreaPixels
        : computeDefaultAspectCropArea(
            bitmap.width,
            bitmap.height,
            targetWidth / targetHeight,
            rotationDeg,
          );

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Image cropping is unavailable in this browser.");
    }

    const rotBox = computeRotatedBoundingBox(
      bitmap.width,
      bitmap.height,
      rotationDeg,
    );

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.scale(targetWidth / crop.width, targetHeight / crop.height);
    ctx.translate(rotBox.width / 2 - crop.x, rotBox.height / 2 - crop.y);
    if (rotationDeg !== 0) {
      ctx.rotate((rotationDeg * Math.PI) / 180);
    }
    ctx.drawImage(
      bitmap,
      -bitmap.width / 2,
      -bitmap.height / 2,
      bitmap.width,
      bitmap.height,
    );
    ctx.restore();

    let encodedBlob: Blob | null = null;
    for (const quality of EXPORT_QUALITY_STEPS) {
      const candidate = await canvasToJpegBlob(canvas, quality);
      encodedBlob = candidate;
      if (candidate.size <= maxBytes) {
        break;
      }
    }

    if (!encodedBlob || encodedBlob.size === 0) {
      throw new Error("Could not produce a valid cropped room photo.");
    }
    if (encodedBlob.size > maxBytes) {
      const maxMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
      throw new Error(
        `Cropped photo still exceeds the ${maxMb} MB limit. Try another image.`,
      );
    }

    const fileName = buildCroppedPhotoFileName(params.sourceFile.name);
    const file = new File([encodedBlob], fileName, { type: "image/jpeg" });

    return {
      file,
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    bitmap.close();
  }
}

