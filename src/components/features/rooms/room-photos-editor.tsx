"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ROOM_PHOTO_ALLOWED_MIME_TYPES,
  ROOM_PHOTO_MAX_CAPTION_LENGTH,
  ROOM_PHOTO_MAX_GALLERY_ITEMS,
  type RoomPhotoAllowedMimeType,
  type RoomPhotoDto,
  type RoomPhotoManifestInput,
  type RoomPhotoManifestItem,
} from "@/features/rooms/schemas";

const DEFAULT_MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_ACCEPT_ATTR = ROOM_PHOTO_ALLOWED_MIME_TYPES.join(",");

type EditablePhotoItem = {
  localId: string;
  source: "existing" | "intent";
  photoId: string | null;
  intentId: string | null;
  previewUrl: string;
  fileName: string;
  byteSize: number;
  caption: string;
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
    source: "existing",
    photoId: dto.id,
    intentId: null,
    previewUrl: dto.url,
    fileName: dto.fileName,
    byteSize: dto.byteSize,
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
 * Reusable preview-image + captioned multi-shot gallery editor for Add/Edit
 * Room and Public Listing modals. Uploads images into private object storage
 * via intent + relay and emits a `roomPhotosJson` hidden FormData field.
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

  function registerObjectUrl(file: File): string {
    const url = URL.createObjectURL(file);
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

  function validateFileBeforeUpload(file: File): RoomPhotoAllowedMimeType {
    const mimeType = resolveImageMimeType(file);
    if (!mimeType) {
      throw new Error(
        `Unsupported image "${file.name}". Use JPEG, PNG, or WebP.`,
      );
    }
    if (file.size <= 0) {
      throw new Error(`"${file.name}" is empty.`);
    }
    if (file.size > DEFAULT_MAX_PHOTO_BYTES) {
      throw new Error(
        `"${file.name}" exceeds the 5 MB room image upload limit.`,
      );
    }
    return mimeType;
  }

  async function handlePreviewFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPickerError(null);

    let mimeType: RoomPhotoAllowedMimeType;
    try {
      mimeType = validateFileBeforeUpload(file);
    } catch (error) {
      setPickerError(
        error instanceof Error ? error.message : "Invalid image file.",
      );
      return;
    }

    const localId = `intent-${crypto.randomUUID()}`;
    const previewUrl = registerObjectUrl(file);
    releaseObjectUrl(previewItem?.previewUrl);

    setPreviewItem({
      localId,
      source: "intent",
      photoId: null,
      intentId: null,
      previewUrl,
      fileName: file.name || "preview.jpg",
      byteSize: file.size,
      caption: "",
      status: "uploading",
      errorMessage: null,
    });

    try {
      const uploaded = await uploadRoomPhotoFile({
        ...(roomId ? { roomId } : {}),
        file,
        mimeType,
      });
      if (!mountedRef.current) return;
      setPreviewItem((current) =>
        current && current.localId === localId
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
        current && current.localId === localId
          ? { ...current, status: "error", errorMessage: message }
          : current,
      );
      setPickerError(message);
    }
  }

  function handleRemovePreview() {
    releaseObjectUrl(previewItem?.previewUrl);
    setPreviewItem(null);
    setPickerError(null);
  }

  async function handleGalleryFilesChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;
    setPickerError(null);

    const remainingSlots = ROOM_PHOTO_MAX_GALLERY_ITEMS - galleryItems.length;
    if (remainingSlots <= 0) {
      setPickerError(
        `Rooms can hold up to ${ROOM_PHOTO_MAX_GALLERY_ITEMS} gallery shots.`,
      );
      return;
    }

    const slice = picked.slice(0, remainingSlots);
    if (picked.length > remainingSlots) {
      setPickerError(
        `Only the first ${remainingSlots} selected shot(s) were added (max ${ROOM_PHOTO_MAX_GALLERY_ITEMS}).`,
      );
    }

    const queued: Array<{
      localId: string;
      file: File;
      mimeType: RoomPhotoAllowedMimeType;
      item: EditablePhotoItem;
    }> = [];

    for (const file of slice) {
      let mimeType: RoomPhotoAllowedMimeType;
      try {
        mimeType = validateFileBeforeUpload(file);
      } catch (error) {
        setPickerError(
          error instanceof Error ? error.message : "Invalid image file.",
        );
        continue;
      }

      const localId = `intent-${crypto.randomUUID()}`;
      const previewUrl = registerObjectUrl(file);
      queued.push({
        localId,
        file,
        mimeType,
        item: {
          localId,
          source: "intent",
          photoId: null,
          intentId: null,
          previewUrl,
          fileName: file.name || "room-shot.jpg",
          byteSize: file.size,
          caption: "",
          status: "uploading",
          errorMessage: null,
        },
      });
    }

    if (queued.length === 0) return;
    setGalleryItems((prev) => [...prev, ...queued.map((q) => q.item)]);

    await Promise.all(
      queued.map(async (entry) => {
        try {
          const uploaded = await uploadRoomPhotoFile({
            ...(roomId ? { roomId } : {}),
            file: entry.file,
            mimeType: entry.mimeType,
          });
          if (!mountedRef.current) return;
          setGalleryItems((prev) =>
            prev.map((item) =>
              item.localId === entry.localId
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
          const message =
            error instanceof Error ? error.message : "Upload failed.";
          setGalleryItems((prev) =>
            prev.map((item) =>
              item.localId === entry.localId
                ? { ...item, status: "error", errorMessage: message }
                : item,
            ),
          );
          setPickerError(message);
        }
      }),
    );
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

  return (
    <div className="grid gap-3 rounded-panel border border-border bg-background/60 p-3">
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
        <div className="flex items-center justify-between gap-2">
          <div className="grid gap-0.5">
            <span className="text-[13px] font-medium leading-4 text-foreground">
              Preview image
            </span>
            <span className="text-xs leading-4 text-muted-foreground">
              Shown on room cards on the public /book page.
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
          <div className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface p-2">
            <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-control border border-border bg-surface-muted">
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
                  ? "Uploading image…"
                  : previewItem.status === "error"
                    ? previewItem.errorMessage || "Upload failed"
                    : `${formatByteSize(previewItem.byteSize)} · Card preview`}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
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

      {/* Multi-shot gallery with captions */}
      <div className="grid gap-2 border-t border-border pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="grid gap-0.5">
            <span className="text-[13px] font-medium leading-4 text-foreground">
              Room shots ({galleryItems.length}/{ROOM_PHOTO_MAX_GALLERY_ITEMS})
            </span>
            <span className="text-xs leading-4 text-muted-foreground">
              Add captioned shots guests can browse in the public photo gallery.
            </span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={
              disabled || galleryItems.length >= ROOM_PHOTO_MAX_GALLERY_ITEMS
            }
            onClick={() => galleryInputRef.current?.click()}
          >
            Add shots
          </Button>
        </div>

        {galleryItems.length > 0 && (
          <div className="grid gap-2">
            {galleryItems.map((item, index) => (
              <div
                key={item.localId}
                className="flex flex-col gap-2 rounded-control border border-border bg-surface p-2 sm:flex-row sm:items-start"
              >
                <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-control border border-border bg-surface-muted">
                  <Image
                    src={item.previewUrl}
                    alt={
                      item.caption.trim()
                        ? item.caption.trim()
                        : `Room shot ${index + 1}`
                    }
                    fill
                    unoptimized
                    sizes="80px"
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
                          : `${item.fileName} (${formatByteSize(item.byteSize)})`}
                    </span>

                    <div className="flex shrink-0 items-center gap-1">
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
    </div>
  );
}
