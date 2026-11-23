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
  processContractScanFile,
  type ProcessedContractScan,
} from "@/lib/document-scanner";

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

  const [sourceFile, setSourceFile] = useState<File | null>(null);
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
            width: { ideal: 1920 },
            height: { ideal: 1440 },
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

  function beginReviewFromFile(capturedFile: File) {
    stopCameraStream();
    releaseAllObjectUrls();

    const originalUrl = trackObjectUrl(capturedFile);
    currentPreviewRef.current = originalUrl;
    setSourceFile(capturedFile);
    setPreviousPreviewUrl(null);
    setCurrentPreviewUrl(originalUrl);
    setCurrentProcessed(null);
    setRotationQuarterTurns(0);
    setSelectedMode(initialMode);
    setStep("review");

    // Start from the original capture and transition smoothly into the chosen mode
    void runEnhancement({
      file: capturedFile,
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
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not capture camera frame.");
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
      beginReviewFromFile(file);
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
    beginReviewFromFile(file);
  }

  function handleSelectMode(mode: ContractScanModeValue) {
    if (!sourceFile || mode === selectedMode) return;
    setSelectedMode(mode);
    void runEnhancement({
      file: sourceFile,
      mode,
      turns: rotationQuarterTurns,
      animateTransition: true,
    });
  }

  function handleRotate() {
    if (!sourceFile) return;
    const nextTurns = (rotationQuarterTurns + 1) % 4;
    setRotationQuarterTurns(nextTurns);
    void runEnhancement({
      file: sourceFile,
      mode: selectedMode,
      turns: nextTurns,
      animateTransition: false,
    });
  }

  function handleRetake() {
    enhanceGenRef.current += 1;
    clearRevealTimer();
    releaseAllObjectUrls();
    setSourceFile(null);
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
    if (!sourceFile || !currentProcessed || isEnhancing) return;
    onConfirm({
      sourceFile,
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
          ? "Line up the paper contract inside the frame and capture a clear photo."
          : "Compare Original, Magic white, and B&W scan before adding this page."
      }
      maxWidthClassName="max-w-2xl"
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
            <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-panel bg-foreground">
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
              {cameraState === "ready" && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-4 sm:inset-6"
                >
                  <span className="absolute top-0 left-0 h-6 w-6 rounded-tl border-t-2 border-l-2 border-surface/90" />
                  <span className="absolute top-0 right-0 h-6 w-6 rounded-tr border-t-2 border-r-2 border-surface/90" />
                  <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl border-b-2 border-l-2 border-surface/90" />
                  <span className="absolute right-0 bottom-0 h-6 w-6 rounded-br border-r-2 border-b-2 border-surface/90" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-control-border bg-surface-muted/55 px-5 py-10 text-center">
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
              <p className="max-w-sm text-sm text-muted-foreground">
                Open your phone camera to take a photo of the signed page, then
                pick Original, Magic white, or B&amp;W scan.
              </p>
              <Button
                type="button"
                size="md"
                onClick={() => fallbackInputRef.current?.click()}
              >
                Open device camera
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => fallbackInputRef.current?.click()}
            >
              Use phone camera instead
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onClose}
              >
                Cancel
              </Button>
              {cameraState !== "fallback" && (
                <Button
                  type="button"
                  size="md"
                  loading={capturing}
                  disabled={cameraState !== "ready" || capturing}
                  onClick={() => void handleCaptureFrame()}
                >
                  Capture photo
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {enhanceError && (
            <Alert tone="danger" role="alert">
              {enhanceError}
            </Alert>
          )}

          <div className="relative flex max-h-[52dvh] min-h-[260px] w-full items-center justify-center overflow-hidden rounded-panel border border-border bg-surface-muted p-2 sm:min-h-[340px]">
            <div className="relative inline-flex max-h-[48dvh] items-center justify-center overflow-hidden rounded">
              {previousPreviewUrl && showRevealBeam && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previousPreviewUrl}
                  alt=""
                  aria-hidden="true"
                  className="max-h-[48dvh] w-auto max-w-full object-contain"
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
                      : "max-h-[48dvh] w-auto max-w-full object-contain"
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Scan filter modes"
              className="flex flex-wrap items-center gap-2"
            >
              {CONTRACT_SCAN_MODES.map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={selectedMode === mode ? "primary" : "secondary"}
                  disabled={isEnhancing}
                  aria-pressed={selectedMode === mode}
                  onClick={() => handleSelectMode(mode)}
                >
                  {CONTRACT_SCAN_MODE_LABELS[mode]}
                </Button>
              ))}
            </div>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isEnhancing}
              onClick={handleRotate}
            >
              Rotate 90&deg;
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={isEnhancing}
              onClick={handleRetake}
            >
              Retake
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="md"
                disabled={isEnhancing || !currentProcessed}
                onClick={handleConfirmScan}
              >
                Use this page
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
