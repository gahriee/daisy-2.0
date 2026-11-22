"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ROOM_PHOTO_ALLOWED_MIME_TYPES,
  ROOM_PHOTO_MAX_CAPTION_LENGTH,
  ROOM_PHOTO_OUTPUT_HEIGHT,
  ROOM_PHOTO_OUTPUT_WIDTH,
  type RoomPhotoAllowedMimeType,
  type RoomPhotoDto,
  type RoomPhotoManifestInput,
  type RoomPhotoManifestItem,
} from "@/features/rooms/schemas";
import type { ExportedCroppedRoomPhoto } from "@/lib/room-photo-crop";
import type { RoomPhotoCropTask } from "./room-photo-cropper-dialog";

const RoomPhotoCropperDialog = dynamic(
  () =>
    import("./room-photo-cropper-dialog").then(
      (mod) => mod.RoomPhotoCropperDialog,
    ),
  {
    ssr: false,
    loading: () => (
      <div role="status" className="py-1 text-xs text-muted-foreground">
        Loading photo cropper…
      </div>
    ),
  },
);

const MAX_RAW_PICKED_BYTES = 50 * 1024 * 1024;
const PHOTO_ACCEPT_ATTR = ROOM_PHOTO_ALLOWED_MIME_TYPES.join(",");

type EditablePhotoItem = {
  localId: string;
  uploadToken: string;
  source: "existing" | "intent";
  photoId: string | null;
  intentId: string | null;
  previewUrl: string;
  fileName: string;
  byteSize: number;
  dimensionsLabel: string | null;
  caption: string;
  sourceFile?: File;
  croppedFile?: File;
  status: "uploading" | "ready" | "error";
  errorMessage: string | null;
};

async function computeFileSha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function resolveImageMimeType(file: File): RoomPhotoAllowedMimeType | null {
  const raw = file.type.trim().toLowerCase();
  if ((ROOM_PHOTO_ALLOWED_MIME_TYPES as readonly string[]).includes(raw)) {
    return raw as RoomPhotoAllowedMimeType;
  }
  const lower = file.name.trim().toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function photoDtoToEditable(dto: RoomPhotoDto): EditablePhotoItem {
  return {
    localId: `existing-${dto.id}`,
    uploadToken: dto.id,
    source: "existing",
    photoId: dto.id,
    intentId: null,
    previewUrl: dto.url,
    fileName: dto.fileName,
    byteSize: dto.byteSize,
    dimensionsLabel: null,
    caption: dto.caption ?? "",
    status: "ready",
    errorMessage: null,
  };
}

function toManifestItem(item: EditablePhotoItem): RoomPhotoManifestItem | null {
  if (item.status !== "ready") return null;
  const trimmedCaption = item.caption.trim();
  const caption = trimmedCaption ? trimmedCaption : null;
  if (item.source === "existing" && item.photoId) {
    return { kind: "existing", photoId: item.photoId, caption };
  }
  if (item.source === "intent" && item.intentId) {
    return { kind: "intent", intentId: item.intentId, caption };
  }
  return null;
}

async function uploadRoomPhotoFile(params: {
  roomId?: string;
  file: File;
  mimeType: RoomPhotoAllowedMimeType;
}): Promise<{ intentId: string }> {
  const sha256 = await computeFileSha256Hex(params.file);
  const intentResponse = await fetch("/api/rooms/photos/intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(params.roomId ? { roomId: params.roomId } : {}),
      fileName: params.file.name || "room-photo.jpg",
      mimeType: params.mimeType,
      byteSize: params.file.size,
      sha256,
    }),
  });

  if (!intentResponse.ok) {
    const body = (await intentResponse.json().catch(() => null)) as {
      error?: { message?: string };
      message?: string;
    } | null;
    throw new Error(
      body?.error?.message ??
        body?.message ??
        "Could not start the photo upload.",
    );
  }

  const intentData = (await intentResponse.json()) as {
    intentId: string;
    uploadUrl: string;
  };

  const putResponse = await fetch(intentData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": params.mimeType },
    body: params.file,
  });

  if (!putResponse.ok) {
    const body = (await putResponse.json().catch(() => null)) as {
      error?: { message?: string };
      message?: string;
    } | null;
    throw new Error(
      body?.error?.message ??
        body?.message ??
        "Could not upload photo bytes right now.",
    );
  }

  return { intentId: intentData.intentId };
}

/**
 * Reusable preview-image + unlimited captioned multi-shot gallery editor for
 * Transient Room and Public Listing pages. Opens an on-demand 4:3 (`1200 x 900`)
 * cropper before uploading to private object storage via intent + relay and
 * emits a `roomPhotosJson` hidden FormData field.
 */
export function RoomPhotosEditor({
  roomId,
  initialPreviewPhoto = null,
  initialGalleryPhotos = [],
  disabled = false,
  onUploadingChange,
}: {
  roomId?: string;
  initialPreviewPhoto?: RoomPhotoDto | null;
  initialGalleryPhotos?: RoomPhotoDto[];
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [previewItem, setPreviewItem] = useState<EditablePhotoItem | null>(
    () =>
      initialPreviewPhoto ? photoDtoToEditable(initialPreviewPhoto) : null,
  );
  const [galleryItems, setGalleryItems] = useState<EditablePhotoItem[]>(() =>
    initialGalleryPhotos.map(photoDtoToEditable),
  );
  const [cropQueue, setCropQueue] = useState<RoomPhotoCropTask[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const previewInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const urls = objectUrlsRef.current;
    return () => {
      mountedRef.current = false;
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  const isUploading =
    previewItem?.status === "uploading" ||
    galleryItems.some((item) => item.status === "uploading");

  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  function registerObjectUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  }

  function releaseObjectUrl(url: string | null | undefined) {
    if (!url || !url.startsWith("blob:")) return;
    if (objectUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      objectUrlsRef.current.delete(url);
    }
  }

  function validateRawPickedImage(file: File) {
    const mimeType = resolveImageMimeType(file);
    if (!mimeType) {
      throw new Error(
        `Unsupported image "${file.name}". Use JPEG, PNG, or WebP.`,
      );
    }
    if (file.size <= 0) {
      throw new Error(`"${file.name}" is empty.`);
    }
    if (file.size > MAX_RAW_PICKED_BYTES) {
      throw new Error(
        `"${file.name}" is too large to crop in the browser (max 50 MB source file).`,
      );
    }
  }

  async function runPreviewUpload(
    localId: string,
    uploadToken: string,
    file: File,
  ) {
    try {
      const uploaded = await uploadRoomPhotoFile({
        ...(roomId ? { roomId } : {}),
        file,
        mimeType: "image/jpeg",
      });
      if (!mountedRef.current) return;
      setPreviewItem((current) =>
        current &&
        current.localId === localId &&
        current.uploadToken === uploadToken
          ? {
              ...current,
              intentId: uploaded.intentId,
              status: "ready",
              errorMessage: null,
            }
          : current,
      );
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : "Upload failed.";
      setPreviewItem((current) =>
        current &&
        current.localId === localId &&
        current.uploadToken === uploadToken
          ? { ...current, status: "error", errorMessage: message }
          : current,
      );
      setPickerError(message);
    }
  }

  async function runGalleryUpload(
    localId: string,
    uploadToken: string,
    file: File,
  ) {
    try {
      const uploaded = await uploadRoomPhotoFile({
        ...(roomId ? { roomId } : {}),
        file,
        mimeType: "image/jpeg",
      });
      if (!mountedRef.current) return;
      setGalleryItems((prev) =>
        prev.map((item) =>
          item.localId === localId && item.uploadToken === uploadToken
            ? {
                ...item,
                intentId: uploaded.intentId,
                status: "ready",
                errorMessage: null,
              }
            : item,
        ),
      );
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : "Upload failed.";
      setGalleryItems((prev) =>
        prev.map((item) =>
          item.localId === localId && item.uploadToken === uploadToken
            ? { ...item, status: "error", errorMessage: message }
            : item,
        ),
      );
      setPickerError(message);
    }
  }

  function handlePreviewFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPickerError(null);

    try {
      validateRawPickedImage(file);
    } catch (error) {
      setPickerError(
        error instanceof Error ? error.message : "Invalid image file.",
      );
      return;
    }

    const sourceUrl = registerObjectUrl(file);
    setCropQueue((prev) => [
      ...prev,
      {
        taskId: crypto.randomUUID(),
        target: "preview",
        sourceFile: file,
        sourceUrl,
        fileName: file.name || "preview.jpg",
        batchIndex: 1,
        batchTotal: 1,
      },
    ]);
  }

  function handleGalleryFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;
    setPickerError(null);

    const validFiles: File[] = [];
    for (const file of picked) {
      try {
        validateRawPickedImage(file);
        validFiles.push(file);
      } catch (error) {
        setPickerError(
          error instanceof Error ? error.message : "Invalid image file.",
        );
      }
    }
    if (validFiles.length === 0) return;

    const batchTotal = validFiles.length;
    const tasks: RoomPhotoCropTask[] = validFiles.map((file, idx) => ({
      taskId: crypto.randomUUID(),
      target: "gallery",
      sourceFile: file,
      sourceUrl: registerObjectUrl(file),
      fileName: file.name || `room-shot-${idx + 1}.jpg`,
      batchIndex: idx + 1,
      batchTotal,
    }));

    setCropQueue((prev) => [...prev, ...tasks]);
  }

  function handleRecropPreview() {
    if (!previewItem?.sourceFile || disabled) return;
    setPickerError(null);
    const sourceUrl = registerObjectUrl(previewItem.sourceFile);
    setCropQueue((prev) => [
      ...prev,
      {
        taskId: crypto.randomUUID(),
        target: "preview",
        sourceFile: previewItem.sourceFile!,
        sourceUrl,
        fileName: previewItem.sourceFile!.name || previewItem.fileName,
        batchIndex: 1,
        batchTotal: 1,
      },
    ]);
  }

  function handleRecropGalleryItem(item: EditablePhotoItem) {
    if (!item.sourceFile || disabled) return;
    setPickerError(null);
    const sourceUrl = registerObjectUrl(item.sourceFile);
    setCropQueue((prev) => [
      ...prev,
      {
        taskId: crypto.randomUUID(),
        target: "gallery",
        replaceLocalId: item.localId,
        sourceFile: item.sourceFile!,
        sourceUrl,
        fileName: item.sourceFile!.name || item.fileName,
        batchIndex: 1,
        batchTotal: 1,
      },
    ]);
  }

  function handleCropConfirm(
    task: RoomPhotoCropTask,
    exported: ExportedCroppedRoomPhoto,
  ) {
    releaseObjectUrl(task.sourceUrl);
    setCropQueue((prev) => prev.filter((item) => item.taskId !== task.taskId));

    const previewUrl = registerObjectUrl(exported.file);
    const uploadToken = crypto.randomUUID();
    const dimensionsLabel = `${exported.width} × ${exported.height} px`;

    if (task.target === "preview") {
      const localId = `intent-${crypto.randomUUID()}`;
      releaseObjectUrl(previewItem?.previewUrl);
      setPreviewItem({
        localId,
        uploadToken,
        source: "intent",
        photoId: null,
        intentId: null,
        previewUrl,
        fileName: exported.file.name,
        byteSize: exported.file.size,
        dimensionsLabel,
        caption: "",
        sourceFile: task.sourceFile,
        croppedFile: exported.file,
        status: "uploading",
        errorMessage: null,
      });
      void runPreviewUpload(localId, uploadToken, exported.file);
      return;
    }

    if (task.replaceLocalId) {
      const targetLocalId = task.replaceLocalId;
      setGalleryItems((prev) =>
        prev.map((item) => {
          if (item.localId !== targetLocalId) return item;
          releaseObjectUrl(item.previewUrl);
          return {
            ...item,
            uploadToken,
            source: "intent",
            photoId: null,
            intentId: null,
            previewUrl,
            fileName: exported.file.name,
            byteSize: exported.file.size,
            dimensionsLabel,
            sourceFile: task.sourceFile,
            croppedFile: exported.file,
            status: "uploading",
            errorMessage: null,
          };
        }),
      );
      void runGalleryUpload(targetLocalId, uploadToken, exported.file);
      return;
    }

    const localId = `intent-${crypto.randomUUID()}`;
    setGalleryItems((prev) => [
      ...prev,
      {
        localId,
        uploadToken,
        source: "intent",
        photoId: null,
        intentId: null,
        previewUrl,
        fileName: exported.file.name,
        byteSize: exported.file.size,
        dimensionsLabel,
        caption: "",
        sourceFile: task.sourceFile,
        croppedFile: exported.file,
        status: "uploading",
        errorMessage: null,
      },
    ]);
    void runGalleryUpload(localId, uploadToken, exported.file);
  }

  function handleCropSkip() {
    const active = cropQueue[0];
    if (!active) return;
    releaseObjectUrl(active.sourceUrl);
    setCropQueue((prev) => prev.slice(1));
  }

  function handleCropCancelAll() {
    for (const task of cropQueue) {
      releaseObjectUrl(task.sourceUrl);
    }
    setCropQueue([]);
  }

  function handleRetryPreviewUpload() {
    if (!previewItem?.croppedFile || disabled) return;
    const uploadToken = crypto.randomUUID();
    const localId = previewItem.localId;
    setPickerError(null);
    setPreviewItem((current) =>
      current && current.localId === localId
        ? { ...current, uploadToken, status: "uploading", errorMessage: null }
        : current,
    );
    void runPreviewUpload(localId, uploadToken, previewItem.croppedFile);
  }

  function handleRetryGalleryUpload(item: EditablePhotoItem) {
    if (!item.croppedFile || disabled) return;
    const uploadToken = crypto.randomUUID();
    setPickerError(null);
    setGalleryItems((prev) =>
      prev.map((candidate) =>
        candidate.localId === item.localId
          ? {
              ...candidate,
              uploadToken,
              status: "uploading",
              errorMessage: null,
            }
          : candidate,
      ),
    );
    void runGalleryUpload(item.localId, uploadToken, item.croppedFile);
  }

  function handleRemovePreview() {
    releaseObjectUrl(previewItem?.previewUrl);
    setPreviewItem(null);
    setPickerError(null);
  }

  function updateGalleryCaption(localId: string, caption: string) {
    setGalleryItems((prev) =>
      prev.map((item) =>
        item.localId === localId ? { ...item, caption } : item,
      ),
    );
  }

  function moveGalleryItem(index: number, direction: -1 | 1) {
    setGalleryItems((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      if (!moved) return prev;
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function removeGalleryItem(localId: string) {
    setGalleryItems((prev) => {
      const victim = prev.find((item) => item.localId === localId);
      releaseObjectUrl(victim?.previewUrl);
      return prev.filter((item) => item.localId !== localId);
    });
  }

  const manifestJson = useMemo(() => {
    const manifest: RoomPhotoManifestInput = {
      preview: previewItem ? toManifestItem(previewItem) : null,
      gallery: galleryItems
        .map((item) => toManifestItem(item))
        .filter((item): item is RoomPhotoManifestItem => item !== null),
    };
    return JSON.stringify(manifest);
  }, [previewItem, galleryItems]);

  const activeCropTask = cropQueue[0] ?? null;

  return (
    <div className="grid gap-4">
      <input type="hidden" name="roomPhotosJson" value={manifestJson} />

      <input
        ref={previewInputRef}
        type="file"
        accept={PHOTO_ACCEPT_ATTR}
        disabled={disabled}
        onChange={handlePreviewFileChange}
        className="sr-only"
      />
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        accept={PHOTO_ACCEPT_ATTR}
        disabled={disabled}
        onChange={handleGalleryFilesChange}
        className="sr-only"
      />

      {pickerError && (
        <Alert tone="danger" role="alert">
          {pickerError}
        </Alert>
      )}

      {/* Preview card image */}
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid gap-0.5">
            <span className="text-[13px] font-medium leading-4 text-foreground">
              Preview image
            </span>
            <span className="text-xs leading-4 text-muted-foreground">
              Cropped to {ROOM_PHOTO_OUTPUT_WIDTH} × {ROOM_PHOTO_OUTPUT_HEIGHT}{" "}
              px (4:3) to match the /book room cards.
            </span>
          </div>
          {!previewItem && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => previewInputRef.current?.click()}
            >
              Upload preview
            </Button>
          )}
        </div>

        {previewItem && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-control bg-surface-muted">
              <Image
                src={previewItem.previewUrl}
                alt="Room card preview"
                fill
                unoptimized
                sizes="96px"
                className="object-cover"
              />
            </div>

            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-xs font-medium text-foreground">
                {previewItem.fileName}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {previewItem.status === "uploading"
                  ? "Uploading cropped photo…"
                  : previewItem.status === "error"
                    ? previewItem.errorMessage || "Upload failed"
                    : `${formatByteSize(previewItem.byteSize)}${previewItem.dimensionsLabel ? ` · ${previewItem.dimensionsLabel}` : ""} · Card preview`}
              </span>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {previewItem.status === "error" && previewItem.croppedFile && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={handleRetryPreviewUpload}
                >
                  Retry
                </Button>
              )}
              {previewItem.sourceFile && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled || previewItem.status === "uploading"}
                  onClick={handleRecropPreview}
                >
                  Re-crop
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled || previewItem.status === "uploading"}
                onClick={() => previewInputRef.current?.click()}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="text-danger"
                size="sm"
                disabled={disabled}
                onClick={handleRemovePreview}
              >
                Remove
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Unlimited multi-shot gallery with captions */}
      <div className="grid gap-2 border-t border-border pt-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid gap-0.5">
            <span className="text-[13px] font-medium leading-4 text-foreground tabular-nums">
              Room shots ({galleryItems.length})
            </span>
            <span className="text-xs leading-4 text-muted-foreground">
              Add as many captioned shots as needed. Each image crops to{" "}
              {ROOM_PHOTO_OUTPUT_WIDTH} × {ROOM_PHOTO_OUTPUT_HEIGHT} px (4:3)
              for /book.
            </span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => galleryInputRef.current?.click()}
          >
            Add shots
          </Button>
        </div>

        {galleryItems.length > 0 && (
          <div className="divide-y divide-border border-t border-border">
            {galleryItems.map((item, index) => (
              <div
                key={item.localId}
                className="flex flex-col gap-2.5 py-3 last:pb-0 sm:flex-row sm:items-start"
              >
                <div className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                  <Image
                    src={item.previewUrl}
                    alt={
                      item.caption.trim()
                        ? item.caption.trim()
                        : `Room shot ${index + 1}`
                    }
                    fill
                    unoptimized
                    sizes="96px"
                    className="object-cover"
                  />
                </div>

                <div className="grid min-w-0 flex-1 gap-1.5">
                  <Input
                    variant="filter"
                    value={item.caption}
                    onChange={(event) =>
                      updateGalleryCaption(item.localId, event.target.value)
                    }
                    maxLength={ROOM_PHOTO_MAX_CAPTION_LENGTH}
                    disabled={disabled || item.status === "error"}
                    placeholder={`Caption for shot ${index + 1} (optional)`}
                    aria-label={`Caption for room shot ${index + 1}`}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {item.status === "uploading"
                        ? "Uploading…"
                        : item.status === "error"
                          ? item.errorMessage || "Upload failed"
                          : `${item.fileName} (${formatByteSize(item.byteSize)}${item.dimensionsLabel ? ` · ${item.dimensionsLabel}` : ""})`}
                    </span>

                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {item.status === "error" && item.croppedFile && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={disabled}
                          onClick={() => handleRetryGalleryUpload(item)}
                        >
                          Retry
                        </Button>
                      )}
                      {item.sourceFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={disabled || item.status === "uploading"}
                          onClick={() => handleRecropGalleryItem(item)}
                          aria-label={`Re-crop room shot ${index + 1}`}
                        >
                          Re-crop
                        </Button>
                      )}
                      {galleryItems.length > 1 && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={disabled || index === 0}
                            onClick={() => moveGalleryItem(index, -1)}
                            aria-label={`Move room shot ${index + 1} earlier`}
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={
                              disabled || index === galleryItems.length - 1
                            }
                            onClick={() => moveGalleryItem(index, 1)}
                            aria-label={`Move room shot ${index + 1} later`}
                          >
                            Down
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-danger"
                        size="sm"
                        disabled={disabled}
                        onClick={() => removeGalleryItem(item.localId)}
                        aria-label={`Remove room shot ${index + 1}`}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeCropTask && (
        <RoomPhotoCropperDialog
          task={activeCropTask}
          remainingCount={cropQueue.length}
          onSkip={handleCropSkip}
          onCancelAll={handleCropCancelAll}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
