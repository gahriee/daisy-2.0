"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  CONTRACT_MAX_FILE_BYTES,
  CONTRACT_SCAN_MODE_LABELS,
  CONTRACT_SCAN_MODES,
  type ContractScanModeValue,
} from "@/features/tenants/schemas";
import {
  blendQuadCorners,
  computeCoverCrop,
  detectDocumentQuadSync,
  getLoadedJScanifyEngine,
  loadJScanifyEngine,
  type QuadCorners,
} from "@/lib/document-detect";
import {
  flattenDocumentPhoto,
  processContractScanFile,
  type ProcessedContractScan,
} from "@/lib/document-scanner";

const PORTRAIT_ASPECT = 3 / 4;
const LIVE_DETECT_WIDTH = 180;
const LIVE_DETECT_HEIGHT = 240;

export type ConfirmedCameraScan = {
  sourceFile: File;
  processed: ProcessedContractScan;
  mode: ContractScanModeValue;
  rotationQuarterTurns: number;
};

type ContractCameraScanDialogProps = {
  open: boolean;
  initialMode: ContractScanModeValue;
  onClose: () => void;
  onConfirm: (scan: ConfirmedCameraScan) => void;
};

export function ContractCameraScanDialog({
  open,
  initialMode,
  onClose,
  onConfirm,
}: ContractCameraScanDialogProps) {
  if (!open) return null;
  return (
    <ContractCameraScanSession
      initialMode={initialMode}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function buildOverlayPolygonPoints(corners: QuadCorners): string {
  return corners
    .map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`)
    .join(" ");
}

function buildMaskPath(corners: QuadCorners): string {
  const [tl, tr, br, bl] = corners.map((p) => ({
    x: (p.x * 100).toFixed(2),
    y: (p.y * 100).toFixed(2),
  }));
  return `M0,0 H100 V100 H0 Z M${tl!.x},${tl!.y} L${tr!.x},${tr!.y} L${br!.x},${br!.y} L${bl!.x},${bl!.y} Z`;
}

function ContractCameraScanSession({
  initialMode,
  onClose,
  onConfirm,
}: Omit<ContractCameraScanDialogProps, "open">) {
  const [step, setStep] = useState<"camera" | "review">("camera");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraState, setCameraState] = useState<
    "starting" | "ready" | "fallback"
  >("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [liveCorners, setLiveCorners] = useState<QuadCorners | null>(null);

  const [rawSourceFile, setRawSourceFile] = useState<File | null>(null);
  const [trimmedDocFile, setTrimmedDocFile] = useState<File | null>(null);
  const [useDocumentOnly, setUseDocumentOnly] = useState(true);
  const [selectedMode, setSelectedMode] =
    useState<ContractScanModeValue>(initialMode);
  const [rotationQuarterTurns, setRotationQuarterTurns] = useState(0);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  const [previousPreviewUrl, setPreviousPreviewUrl] = useState<string | null>(
    null,
  );
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | null>(
    null,
  );
  const [currentProcessed, setCurrentProcessed] =
    useState<ProcessedContractScan | null>(null);
  const [revealKey, setRevealKey] = useState(0);
  const [showRevealBeam, setShowRevealBeam] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const currentPreviewRef = useRef<string | null>(null);
  const enhanceGenRef = useRef(0);
  const revealTimerRef = useRef<number | null>(null);
  const liveCornersRef = useRef<QuadCorners | null>(null);
  const missedDetectionsRef = useRef(0);

  const activeSourceFile =
    useDocumentOnly && trimmedDocFile ? trimmedDocFile : rawSourceFile;

  const trackObjectUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const releaseAllObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current.clear();
    currentPreviewRef.current = null;
  }, []);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    liveCornersRef.current = null;
  }, []);

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  // Connect live camera whenever in camera step and clean up tracks on exit/unmount.
  useEffect(() => {
    if (step !== "camera") {
      stopCameraStream();
      return;
    }

    let cancelled = false;

    async function startStream() {
      stopCameraStream();

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        if (!cancelled) {
          setCameraState("fallback");
          setCameraError(
            "Live camera is not available in this browser. Use your device camera below to snap a page.",
          );
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1440 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {
            // Autoplay may resolve asynchronously on mobile Safari.
          });
        }
        if (!cancelled) {
          setCameraState("ready");
          setCameraError(null);
        }
      } catch {
        if (!cancelled) {
          setCameraState("fallback");
          setCameraError(
            "Could not open the live camera. Allow camera access or use your phone camera below.",
          );
        }
      }
    }

    void startStream();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [step, cameraAttempt, stopCameraStream]);

  // Periodically detect the paper document boundary inside the portrait viewfinder.
  useEffect(() => {
    if (step !== "camera" || cameraState !== "ready") {
      liveCornersRef.current = null;
      return;
    }

    void loadJScanifyEngine().catch(() => {
      // Scanner fallback still works if WASM init is delayed.
    });

    const detectCanvas = document.createElement("canvas");
    detectCanvas.width = LIVE_DETECT_WIDTH;
    detectCanvas.height = LIVE_DETECT_HEIGHT;
    const detectCtx = detectCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!detectCtx) return;

    const timer = window.setInterval(() => {
      const engine = getLoadedJScanifyEngine();
      const video = videoRef.current;
      if (
        !engine ||
        !video ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        return;
      }

      const crop = computeCoverCrop(
        video.videoWidth,
        video.videoHeight,
        PORTRAIT_ASPECT,
      );
      detectCtx.drawImage(
        video,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        LIVE_DETECT_WIDTH,
        LIVE_DETECT_HEIGHT,
      );
      const frame = detectCtx.getImageData(
        0,
        0,
        LIVE_DETECT_WIDTH,
        LIVE_DETECT_HEIGHT,
      );
      const detected = detectDocumentQuadSync(
        engine,
        frame.data,
        LIVE_DETECT_WIDTH,
        LIVE_DETECT_HEIGHT,
      );

      if (detected) {
        missedDetectionsRef.current = 0;
        const blended = liveCornersRef.current
          ? blendQuadCorners(liveCornersRef.current, detected.corners, 0.55)
          : detected.corners;
        liveCornersRef.current = blended;
        setLiveCorners(blended);
      } else {
        missedDetectionsRef.current += 1;
        if (missedDetectionsRef.current >= 3 && liveCornersRef.current) {
          liveCornersRef.current = null;
          setLiveCorners(null);
        }
      }
    }, 180);

    return () => {
      window.clearInterval(timer);
    };
  }, [step, cameraState]);

  // Release temporary object URLs and timers on unmount.
  useEffect(() => {
    return () => {
      enhanceGenRef.current += 1;
      clearRevealTimer();
      stopCameraStream();
      releaseAllObjectUrls();
    };
  }, [clearRevealTimer, stopCameraStream, releaseAllObjectUrls]);

  const runEnhancement = useCallback(
    async (params: {
      file: File;
      mode: ContractScanModeValue;
      turns: number;
      animateTransition: boolean;
    }) => {
      const gen = enhanceGenRef.current + 1;
      enhanceGenRef.current = gen;
      clearRevealTimer();
      setEnhanceError(null);
      setIsEnhancing(true);

      const prevUrl = currentPreviewRef.current;

      try {
        const processed = await processContractScanFile({
          sourceFile: params.file,
          mode: params.mode,
          rotationQuarterTurns: params.turns,
        });
        if (enhanceGenRef.current !== gen) return;
        if (processed.byteSize > CONTRACT_MAX_FILE_BYTES) {
          throw new Error("Keep each scanned page under 15 MB.");
        }

        const nextUrl = trackObjectUrl(processed.blob);
        if (params.animateTransition && prevUrl) {
          setPreviousPreviewUrl(prevUrl);
          setShowRevealBeam(true);
          setRevealKey((k) => k + 1);
          revealTimerRef.current = window.setTimeout(() => {
            setShowRevealBeam(false);
          }, 700);
        } else {
          setPreviousPreviewUrl(null);
          setShowRevealBeam(false);
        }

        currentPreviewRef.current = nextUrl;
        setCurrentPreviewUrl(nextUrl);
        setCurrentProcessed(processed);
      } catch (error) {
        if (enhanceGenRef.current !== gen) return;
        setEnhanceError(
          error instanceof Error
            ? error.message
            : "Could not process this photo. Try another mode or retake.",
        );
      } finally {
        if (enhanceGenRef.current === gen) {
          setIsEnhancing(false);
        }
      }
    },
    [clearRevealTimer, trackObjectUrl],
  );

  async function beginReviewFromFile(capturedFile: File) {
    stopCameraStream();
    setLiveCorners(null);
    releaseAllObjectUrls();

    setRawSourceFile(capturedFile);
    setTrimmedDocFile(null);
    setUseDocumentOnly(true);
    setPreviousPreviewUrl(null);
    setCurrentProcessed(null);
    setRotationQuarterTurns(0);
    setSelectedMode(initialMode);
    setIsEnhancing(true);
    setStep("review");

    let targetFile = capturedFile;
    try {
      const flattened = await flattenDocumentPhoto({
        sourceFile: capturedFile,
      });
      if (flattened) {
        setTrimmedDocFile(flattened.file);
        targetFile = flattened.file;
      }
    } catch {
      // Fall back to the full captured frame if page detection fails.
    }

    const baseUrl = trackObjectUrl(targetFile);
    currentPreviewRef.current = baseUrl;
    setCurrentPreviewUrl(baseUrl);

    void runEnhancement({
      file: targetFile,
      mode: initialMode,
      turns: 0,
      animateTransition: initialMode !== "ORIGINAL",
    });
  }

  async function handleCaptureFrame() {
    const video = videoRef.current;
    if (
      !video ||
      capturing ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      return;
    }

    setCapturing(true);
    try {
      const crop = computeCoverCrop(
        video.videoWidth,
        video.videoHeight,
        PORTRAIT_ASPECT,
      );
      const canvas = document.createElement("canvas");
      canvas.width = crop.width;
      canvas.height = crop.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not capture camera frame.");
      }
      ctx.drawImage(
        video,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) resolve(result);
            else reject(new Error("Could not save captured photo."));
          },
          "image/jpeg",
          0.92,
        );
      });
      const file = new File(
        [blob],
        `contract-scan-${Date.now().toString(36)}.jpg`,
        { type: "image/jpeg" },
      );
      await beginReviewFromFile(file);
    } catch (error) {
      setCameraError(
        error instanceof Error
          ? error.message
          : "Could not capture photo from camera.",
      );
    } finally {
      setCapturing(false);
    }
  }

  function handleFallbackFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void beginReviewFromFile(file);
  }

  function handleSelectMode(mode: ContractScanModeValue) {
    if (!activeSourceFile || mode === selectedMode) return;
    setSelectedMode(mode);
    void runEnhancement({
      file: activeSourceFile,
      mode,
      turns: rotationQuarterTurns,
      animateTransition: true,
    });
  }

  function handleToggleDocumentCrop() {
    if (!rawSourceFile || !trimmedDocFile) return;
    const nextUseDoc = !useDocumentOnly;
    setUseDocumentOnly(nextUseDoc);
    const nextFile = nextUseDoc ? trimmedDocFile : rawSourceFile;
    void runEnhancement({
      file: nextFile,
      mode: selectedMode,
      turns: rotationQuarterTurns,
      animateTransition: false,
    });
  }

  function handleRotate() {
    if (!activeSourceFile) return;
    const nextTurns = (rotationQuarterTurns + 1) % 4;
    setRotationQuarterTurns(nextTurns);
    void runEnhancement({
      file: activeSourceFile,
      mode: selectedMode,
      turns: nextTurns,
      animateTransition: false,
    });
  }

  function handleRetake() {
    enhanceGenRef.current += 1;
    clearRevealTimer();
    releaseAllObjectUrls();
    setLiveCorners(null);
    setRawSourceFile(null);
    setTrimmedDocFile(null);
    setUseDocumentOnly(true);
    setCurrentPreviewUrl(null);
    setPreviousPreviewUrl(null);
    setCurrentProcessed(null);
    setEnhanceError(null);
    setIsEnhancing(false);
    setShowRevealBeam(false);
    setRotationQuarterTurns(0);
    setCameraError(null);
    setCameraState("starting");
    setCameraAttempt((n) => n + 1);
    setStep("camera");
  }

  function handleConfirmScan() {
    if (!activeSourceFile || !currentProcessed || isEnhancing) return;
    onConfirm({
      sourceFile: activeSourceFile,
      processed: currentProcessed,
      mode: selectedMode,
      rotationQuarterTurns,
    });
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={step === "camera" ? "Scan contract page" : "Choose scan look"}
      description={
        step === "camera"
          ? "Line up the paper contract inside the portrait frame. Background outside the page is trimmed automatically."
          : "Compare Original, Magic white, and B&W scan before adding this page."
      }
      maxWidthClassName="max-w-lg"
    >
      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFallbackFileChange}
      />

      {step === "camera" ? (
        <div className="grid gap-4">
          {cameraError && (
            <Alert tone="warning" role="status">
              {cameraError}
            </Alert>
          )}

          {cameraState !== "fallback" ? (
            <div className="relative mx-auto flex aspect-[3/4] max-h-[54dvh] w-full max-w-[360px] items-center justify-center overflow-hidden rounded-panel bg-foreground">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
              />
              {cameraState === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/75 px-4 text-center text-sm font-medium text-surface">
                  Starting camera...
                </div>
              )}
              {cameraState === "ready" && liveCorners && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  <path
                    d={buildMaskPath(liveCorners)}
                    fill="rgba(17, 17, 17, 0.52)"
                    fillRule="evenodd"
                  />
                  <polygon
                    points={buildOverlayPolygonPoints(liveCorners)}
                    fill="rgba(224, 11, 65, 0.08)"
                    stroke="#ffffff"
                    strokeWidth="0.9"
                    strokeLinejoin="round"
                  />
                  {liveCorners.map((corner, index) => (
                    <circle
                      key={index}
                      cx={corner.x * 100}
                      cy={corner.y * 100}
                      r="1.8"
                      fill="#e00b41"
                      stroke="#ffffff"
                      strokeWidth="0.7"
                    />
                  ))}
                </svg>
              )}
              {cameraState === "ready" && !liveCorners && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-5 sm:inset-6"
                >
                  <span className="absolute top-0 left-0 h-6 w-6 rounded-tl border-t-2 border-l-2 border-surface/90" />
                  <span className="absolute top-0 right-0 h-6 w-6 rounded-tr border-t-2 border-r-2 border-surface/90" />
                  <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl border-b-2 border-l-2 border-surface/90" />
                  <span className="absolute right-0 bottom-0 h-6 w-6 rounded-br border-r-2 border-b-2 border-surface/90" />
                </div>
              )}
              {cameraState === "ready" && (
                <div
                  aria-live="polite"
                  className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center"
                >
                  <span className="rounded-full bg-foreground/85 px-3 py-1 text-center text-xs font-medium text-surface shadow-sm">
                    {liveCorners
                      ? "Document detected — background will be excluded"
                      : "Hold paper page inside the portrait frame"}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto flex aspect-[3/4] max-h-[48dvh] w-full max-w-[360px] flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-control-border bg-surface-muted/55 px-5 py-8 text-center">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-8 text-muted-foreground"
              >
                <path d="M4 7h3l2-2h6l2 2h3a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 4 7Z" />
                <circle cx="12" cy="13.5" r="3.5" />
              </svg>
              <p className="max-w-xs text-sm text-muted-foreground">
                Open your phone camera to take a portrait photo of the signed
                page. Background outside the paper is trimmed automatically.
              </p>
              <Button
                type="button"
                size="md"
                className="w-full justify-center"
                onClick={() => fallbackInputRef.current?.click()}
              >
                Open device camera
              </Button>
            </div>
          )}

          <div className="grid w-full gap-2 pt-1">
            {cameraState !== "fallback" && (
              <Button
                type="button"
                size="md"
                className="w-full justify-center"
                loading={capturing}
                disabled={cameraState !== "ready" || capturing}
                onClick={() => void handleCaptureFrame()}
              >
                Capture photo
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="w-full justify-center"
              onClick={() => fallbackInputRef.current?.click()}
            >
              Use phone camera instead
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="w-full justify-center"
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {enhanceError && (
            <Alert tone="danger" role="alert">
              {enhanceError}
            </Alert>
          )}

          <div className="relative mx-auto flex aspect-[3/4] max-h-[54dvh] w-full max-w-[360px] items-center justify-center overflow-hidden rounded-panel border border-border bg-surface-muted p-2">
            <div className="relative inline-flex h-full w-full items-center justify-center overflow-hidden rounded">
              {previousPreviewUrl && showRevealBeam && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previousPreviewUrl}
                  alt=""
                  aria-hidden="true"
                  className="max-h-full w-auto max-w-full object-contain"
                />
              )}

              {currentPreviewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${revealKey}-${currentPreviewUrl}`}
                  src={currentPreviewUrl}
                  alt={`Scanned page preview in ${CONTRACT_SCAN_MODE_LABELS[selectedMode]} mode`}
                  className={
                    previousPreviewUrl && showRevealBeam
                      ? "daisy-scan-reveal absolute inset-0 h-full w-full object-contain"
                      : "max-h-full w-auto max-w-full object-contain"
                  }
                />
              )}

              {showRevealBeam && !isEnhancing && (
                <div
                  key={`beam-${revealKey}`}
                  aria-hidden="true"
                  className="daisy-scan-beam-sweep pointer-events-none absolute inset-x-0 h-1 bg-primary shadow-[0_0_16px_3px_var(--primary)]"
                />
              )}

              {isEnhancing && (
                <div
                  role="status"
                  aria-live="polite"
                  className="pointer-events-none absolute inset-0 bg-foreground/10"
                >
                  <div
                    aria-hidden="true"
                    className="daisy-scan-beam-loading absolute inset-x-0 h-1 bg-primary shadow-[0_0_16px_3px_var(--primary)]"
                  />
                  <div className="absolute inset-x-0 bottom-3 flex justify-center">
                    <span className="rounded-full bg-foreground/85 px-3 py-1 text-xs font-medium text-surface shadow-sm">
                      Applying {CONTRACT_SCAN_MODE_LABELS[selectedMode]}...
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid w-full gap-2">
            <div
              role="group"
              aria-label="Scan filter modes"
              className="grid w-full grid-cols-3 gap-2"
            >
              {CONTRACT_SCAN_MODES.map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  className="w-full justify-center"
                  variant={selectedMode === mode ? "primary" : "secondary"}
                  disabled={isEnhancing}
                  aria-pressed={selectedMode === mode}
                  onClick={() => handleSelectMode(mode)}
                >
                  {CONTRACT_SCAN_MODE_LABELS[mode]}
                </Button>
              ))}
            </div>

            <div
              className={
                trimmedDocFile
                  ? "grid w-full grid-cols-2 gap-2"
                  : "grid w-full grid-cols-1 gap-2"
              }
            >
              {trimmedDocFile && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full justify-center"
                  variant={useDocumentOnly ? "primary" : "secondary"}
                  disabled={isEnhancing}
                  aria-pressed={useDocumentOnly}
                  onClick={handleToggleDocumentCrop}
                >
                  {useDocumentOnly ? "Document only" : "Full photo"}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full justify-center"
                disabled={isEnhancing}
                onClick={handleRotate}
              >
                Rotate 90&deg;
              </Button>
            </div>
          </div>

          <div className="grid w-full gap-2 border-t border-border pt-3">
            <Button
              type="button"
              size="md"
              className="w-full justify-center"
              disabled={isEnhancing || !currentProcessed}
              onClick={handleConfirmScan}
            >
              Use this page
            </Button>
            <div className="grid w-full grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="w-full justify-center"
                disabled={isEnhancing}
                onClick={handleRetake}
              >
                Retake
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="w-full justify-center"
                onClick={onClose}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
