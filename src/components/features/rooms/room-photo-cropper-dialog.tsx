"use client";

import "react-easy-crop/react-easy-crop.css";

import { useCallback, useId, useRef, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  ROOM_PHOTO_ASPECT_RATIO,
  ROOM_PHOTO_OUTPUT_HEIGHT,
  ROOM_PHOTO_OUTPUT_WIDTH,
} from "@/features/rooms/schemas";
import {
  exportCroppedRoomPhoto,
  type ExportedCroppedRoomPhoto,
  type PixelCropArea,
} from "@/lib/room-photo-crop";

export type RoomPhotoCropTask = {
  taskId: string;
  target: "preview" | "gallery";
  replaceLocalId?: string;
  sourceFile: File;
  sourceUrl: string;
  fileName: string;
  batchIndex: number;
  batchTotal: number;
};

type CropperBodyProps = {
  task: RoomPhotoCropTask;
  remainingCount: number;
  onSkip: () => void;
  onCancelAll: () => void;
  onConfirm: (
    task: RoomPhotoCropTask,
    exported: ExportedCroppedRoomPhoto,
  ) => void;
  onBusyChange: (busy: boolean) => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function CropperBody({
  task,
  remainingCount,
  onSkip,
  onCancelAll,
  onConfirm,
  onBusyChange,
}: CropperBodyProps) {
  const zoomInputId = useId();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const croppedAreaPixelsRef = useRef<PixelCropArea | null>(null);

  const handleCropArea = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      croppedAreaPixelsRef.current = {
        x: croppedAreaPixels.x,
        y: croppedAreaPixels.y,
        width: croppedAreaPixels.width,
        height: croppedAreaPixels.height,
      };
    },
    [],
  );

  function handleReset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCropError(null);
  }

  async function handleConfirm() {
    if (submitting || !mediaLoaded) return;
    setCropError(null);
    setSubmitting(true);
    onBusyChange(true);

    try {
      const exported = await exportCroppedRoomPhoto({
        sourceFile: task.sourceFile,
        cropAreaPixels: croppedAreaPixelsRef.current,
        rotationDeg: rotation,
      });
      onBusyChange(false);
      onConfirm(task, exported);
    } catch (error) {
      setCropError(
        error instanceof Error
          ? error.message
          : "Could not crop this photo. Try another image.",
      );
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <div className="grid gap-4">
      {cropError && (
        <Alert tone="danger" role="alert">
          {cropError}
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate font-medium text-foreground">
          {task.fileName}
        </span>
        <div className="flex items-center gap-1.5">
          <Badge tone="neutral">
            {ROOM_PHOTO_OUTPUT_WIDTH} × {ROOM_PHOTO_OUTPUT_HEIGHT} px
          </Badge>
          <Badge tone="neutral">4:3</Badge>
        </div>
      </div>

      <div className="relative h-64 w-full overflow-hidden rounded-panel border border-border bg-foreground sm:h-80">
        <Cropper
          image={task.sourceUrl}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={ROOM_PHOTO_ASPECT_RATIO}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          cropShape="rect"
          objectFit="contain"
          showGrid
          roundCropAreaPixels
          restrictPosition
          disableAutomaticStylesInjection
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropAreaChange={handleCropArea}
          onCropComplete={handleCropArea}
          onMediaLoaded={() => setMediaLoaded(true)}
          cropperProps={{
            "aria-label":
              "Room photo crop area. Drag or use arrow keys to position the image.",
          }}
        />
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={zoomInputId}
              className="text-[13px] font-medium leading-4 text-foreground"
            >
              Zoom
            </label>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {zoom.toFixed(1)}×
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={submitting || zoom <= MIN_ZOOM}
              onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
              aria-label="Zoom out"
              className="px-3"
            >
              −
            </Button>
            <input
              id={zoomInputId}
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={zoom}
              disabled={submitting || !mediaLoaded}
              onChange={(event) =>
                setZoom(clampZoom(Number(event.target.value)))
              }
              aria-valuetext={`${Math.round(zoom * 100)}%`}
              className="h-11 min-w-0 flex-1 cursor-pointer accent-primary"
            />
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={submitting || zoom >= MAX_ZOOM}
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
              aria-label="Zoom in"
              className="px-3"
            >
              +
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={submitting || !mediaLoaded}
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              Rotate 90°
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={submitting || !mediaLoaded}
              onClick={handleReset}
            >
              Reset
            </Button>
          </div>

          <span className="text-xs text-muted-foreground">
            Drag to reframe before saving.
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border pt-3">
        <Button
          type="button"
          variant="secondary"
          size="md"
          disabled={submitting}
          onClick={onCancelAll}
        >
          {remainingCount > 1 ? "Cancel all" : "Cancel"}
        </Button>
        {remainingCount > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={submitting}
            onClick={onSkip}
          >
            Skip photo
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          size="md"
          loading={submitting}
          disabled={!mediaLoaded}
          onClick={() => void handleConfirm()}
        >
          {submitting ? "Cropping…" : "Crop & upload"}
        </Button>
      </div>
    </div>
  );
}

/**
 * On-demand image cropper dialog powered by `react-easy-crop` locking uploaded
 * transient room photos to `1200 x 900` px (`4:3`) to match `/book`.
 */
export function RoomPhotoCropperDialog({
  task,
  remainingCount,
  onSkip,
  onCancelAll,
  onConfirm,
}: {
  task: RoomPhotoCropTask | null;
  remainingCount: number;
  onSkip: () => void;
  onCancelAll: () => void;
  onConfirm: (
    task: RoomPhotoCropTask,
    exported: ExportedCroppedRoomPhoto,
  ) => void;
}) {
  const [busy, setBusy] = useState(false);

  const title = !task
    ? "Crop photo"
    : task.target === "preview"
      ? "Crop preview image"
      : task.batchTotal > 1
        ? `Crop room photo ${task.batchIndex} of ${task.batchTotal}`
        : "Crop room photo";

  return (
    <Dialog
      open={task !== null}
      onClose={onCancelAll}
      dismissDisabled={busy}
      maxWidthClassName="max-w-2xl"
      title={title}
      description={`Every image is saved at ${ROOM_PHOTO_OUTPUT_WIDTH} × ${ROOM_PHOTO_OUTPUT_HEIGHT} px (4:3) so it displays at exact proportions on /book.`}
    >
      {task && (
        <CropperBody
          key={task.taskId}
          task={task}
          remainingCount={remainingCount}
          onSkip={onSkip}
          onCancelAll={onCancelAll}
          onConfirm={onConfirm}
          onBusyChange={setBusy}
        />
      )}
    </Dialog>
  );
}
