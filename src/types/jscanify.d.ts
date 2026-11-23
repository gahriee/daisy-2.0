declare module "jscanify/client" {
  export type JScanifyPoint = {
    x: number;
    y: number;
  };

  export type JScanifyCornerPoints = {
    topLeftCorner?: JScanifyPoint;
    topRightCorner?: JScanifyPoint;
    bottomLeftCorner?: JScanifyPoint;
    bottomRightCorner?: JScanifyPoint;
  };

  export default class JScanify {
    findPaperContour(img: unknown): unknown;
    getCornerPoints(contour: unknown, img?: unknown): JScanifyCornerPoints;
    highlightPaper(
      image: HTMLImageElement | HTMLCanvasElement,
      options?: { color?: string; thickness?: number },
    ): HTMLCanvasElement;
    extractPaper(
      image: HTMLImageElement | HTMLCanvasElement,
      resultWidth: number,
      resultHeight: number,
      cornerPoints?: JScanifyCornerPoints,
    ): HTMLCanvasElement | null;
  }
}

declare module "@/lib/opencv-loader.cjs" {
  import type JScanify from "jscanify/client";
  import type { OpenCvRuntime } from "@/lib/document-detect";

  export function loadOpenCvAndJScanify(): Promise<{
    cv: OpenCvRuntime;
    scanner: JScanify;
  }>;
}
