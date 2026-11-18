import { describe, expect, it } from "vitest";
import { ROOM_PHOTO_ASPECT_RATIO } from "@/features/rooms/schemas";
import {
  buildCroppedPhotoFileName,
  computeDefaultAspectCropArea,
  computeRotatedBoundingBox,
} from "@/lib/room-photo-crop";

describe("room photo crop helpers", () => {
  it("computes rotated bounding boxes accurately for quarter turns", () => {
    const unrotated = computeRotatedBoundingBox(1600, 900, 0);
    expect(unrotated.width).toBeCloseTo(1600, 6);
    expect(unrotated.height).toBeCloseTo(900, 6);

    const rotated90 = computeRotatedBoundingBox(1600, 900, 90);
    expect(rotated90.width).toBeCloseTo(900, 6);
    expect(rotated90.height).toBeCloseTo(1600, 6);

    const rotated180 = computeRotatedBoundingBox(1600, 900, 180);
    expect(rotated180.width).toBeCloseTo(1600, 6);
    expect(rotated180.height).toBeCloseTo(900, 6);
  });

  it("derives centered 4:3 default crop boxes for landscape, portrait, and rotated photos", () => {
    const wide = computeDefaultAspectCropArea(1920, 1080);
    expect(wide.height).toBe(1080);
    expect(wide.width).toBe(1440);
    expect(wide.x).toBe(240);
    expect(wide.y).toBe(0);
    expect(wide.width / wide.height).toBeCloseTo(ROOM_PHOTO_ASPECT_RATIO, 6);

    const portrait = computeDefaultAspectCropArea(1200, 1600);
    expect(portrait.width).toBe(1200);
    expect(portrait.height).toBe(900);
    expect(portrait.x).toBe(0);
    expect(portrait.y).toBe(350);
    expect(portrait.width / portrait.height).toBeCloseTo(
      ROOM_PHOTO_ASPECT_RATIO,
      6,
    );

    const rotatedPortrait = computeDefaultAspectCropArea(
      1200,
      1600,
      ROOM_PHOTO_ASPECT_RATIO,
      90,
    );
    expect(rotatedPortrait.width).toBe(1600);
    expect(rotatedPortrait.height).toBe(1200);
    expect(rotatedPortrait.x).toBe(0);
    expect(rotatedPortrait.y).toBe(0);
  });

  it("normalizes cropped photo filenames to bounded .jpg names", () => {
    expect(buildCroppedPhotoFileName("IMG_001.png")).toBe("IMG_001.jpg");
    expect(buildCroppedPhotoFileName("folder/my.room.webp")).toBe(
      "my.room.jpg",
    );
    expect(buildCroppedPhotoFileName("   ")).toBe("room-photo.jpg");

    const longName = `${"a".repeat(220)}.png`;
    const normalized = buildCroppedPhotoFileName(longName);
    expect(normalized.endsWith(".jpg")).toBe(true);
    expect(normalized.length).toBeLessThanOrEqual(180);
  });
});

