import { describe, expect, it } from "vitest";
import {
  enhanceDocumentRgba,
  sharpenDocumentTextRgba,
} from "@/lib/document-scanner";

function makeSolidImage(
  width: number,
  height: number,
  fill: [number, number, number],
  draw?: (x: number, y: number) => [number, number, number] | null,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = draw?.(x, y) ?? fill;
      const idx = (y * width + x) * 4;
      data[idx] = pixel[0];
      data[idx + 1] = pixel[1];
      data[idx + 2] = pixel[2];
      data[idx + 3] = 255;
    }
  }
  return data;
}

describe("enhanceDocumentRgba", () => {
  it("returns an unmodified copy in ORIGINAL mode", () => {
    const src = makeSolidImage(24, 24, [188, 174, 148]);
    const out = enhanceDocumentRgba(src, 24, 24, "ORIGINAL");
    expect(Array.from(out)).toEqual(Array.from(src));
    expect(out).not.toBe(src);
  });

  it("turns uneven warm shadowed paper crisp white while keeping black and blue ink dark", () => {
    // Left half darker shadow (150, 142, 124), right half warmer yellow paper (218, 210, 182)
    // Draw black printed stroke at (14..15, 10..22) and blue ballpoint stroke at (28..29, 10..22)
    const src = makeSolidImage(48, 36, [215, 208, 180], (x, y) => {
      if (x >= 14 && x <= 15 && y >= 10 && y <= 22) {
        return [28, 28, 30];
      }
      if (x >= 28 && x <= 29 && y >= 10 && y <= 22) {
        return [32, 68, 158];
      }
      return x < 24 ? [150, 142, 124] : [218, 210, 182];
    });

    const out = enhanceDocumentRgba(src, 48, 36, "MAGIC_WHITE");

    // Check shadowed paper background becomes pure white
    const bgLeft = (18 * 48 + 6) * 4;
    expect(out[bgLeft]).toBe(255);
    expect(out[bgLeft + 1]).toBe(255);
    expect(out[bgLeft + 2]).toBe(255);

    // Check warm right paper background becomes pure white
    const bgRight = (18 * 48 + 38) * 4;
    expect(out[bgRight]).toBe(255);
    expect(out[bgRight + 1]).toBe(255);
    expect(out[bgRight + 2]).toBe(255);

    // Black ink stays dark
    const blackIdx = (16 * 48 + 14) * 4;
    expect(out[blackIdx]!).toBeLessThan(85);
    expect(out[blackIdx + 1]!).toBeLessThan(85);
    expect(out[blackIdx + 2]!).toBeLessThan(85);

    // Blue signature stays noticeably blue and darker than paper
    const blueIdx = (16 * 48 + 28) * 4;
    expect(out[blueIdx + 2]!).toBeGreaterThan(out[blueIdx]!);
    expect(out[blueIdx]!).toBeLessThan(120);
  });

  it("produces pure white paper and sharp dark text in BW_SCAN Sauvola mode", () => {
    const src = makeSolidImage(48, 36, [196, 190, 172], (x, y) => {
      if (x >= 18 && x <= 20 && y >= 10 && y <= 24) {
        return [42, 40, 38];
      }
      return null;
    });

    const out = enhanceDocumentRgba(src, 48, 36, "BW_SCAN");

    const bgIdx = (6 * 48 + 6) * 4;
    expect(out[bgIdx]).toBe(255);
    expect(out[bgIdx + 1]).toBe(255);
    expect(out[bgIdx + 2]).toBe(255);

    const textIdx = (17 * 48 + 19) * 4;
    expect(out[textIdx]).toBeLessThan(40);
    expect(out[textIdx]).toBe(out[textIdx + 1]);
    expect(out[textIdx + 1]).toBe(out[textIdx + 2]);
  });

  it("sharpens soft blurred text edges while keeping flat paper smooth", () => {
    // Soft gray stroke (115) surrounded by slightly blurred halo (165) on warm paper (200)
    const src = makeSolidImage(32, 32, [200, 200, 200], (x, y) => {
      if (y >= 8 && y <= 24) {
        if (x === 16) return [115, 115, 115];
        if (x === 15 || x === 17) return [165, 165, 165];
      }
      return null;
    });

    const sharpened = sharpenDocumentTextRgba(src, 32, 32);
    const strokeIdx = (16 * 32 + 16) * 4;
    const flatPaperIdx = (4 * 32 + 4) * 4;

    // Center of soft text stroke becomes darker (higher contrast) than original 115
    expect(sharpened[strokeIdx]!).toBeLessThan(95);
    // Flat background remains untouched at 200
    expect(sharpened[flatPaperIdx]).toBe(200);
  });

  it("deepens faint handwritten/small printed strokes in MAGIC_WHITE instead of washing them out", () => {
    // Shadowed paper (205) with faint pencil/pen stroke (168 — only 18% darker than paper)
    const src = makeSolidImage(48, 36, [205, 202, 196], (x, y) => {
      if (x >= 20 && x <= 21 && y >= 10 && y <= 24) {
        return [168, 165, 162];
      }
      return null;
    });

    const out = enhanceDocumentRgba(src, 48, 36, "MAGIC_WHITE");
    const paperIdx = (6 * 48 + 6) * 4;
    const faintStrokeIdx = (17 * 48 + 20) * 4;

    expect(out[paperIdx]).toBe(255);
    // Faint stroke is significantly darkened below 110 instead of fading to white
    expect(out[faintStrokeIdx]!).toBeLessThan(110);
  });
});
