/* eslint-disable @typescript-eslint/no-require-imports */
const cvPromise = require("@techstark/opencv-js");
const JScanify = require("jscanify/client");

module.exports = {
  loadOpenCvAndJScanify: async function loadOpenCvAndJScanify() {
    const raw = await cvPromise;
    const cv = raw && raw.default ? raw.default : raw;
    if (!cv.Mat) {
      await new Promise((resolve) => {
        const prev = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => {
          if (typeof prev === "function") prev();
          resolve();
        };
      });
    }
    globalThis.cv = cv;
    const scanner = new JScanify();
    return { cv, scanner };
  },
};
