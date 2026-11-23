"use client";

import { useState, type ChangeEvent } from "react";
import {
  MAINTENANCE_ATTACHMENT_ALLOWED_MIME_TYPES,
  type MaintenanceAttachmentMimeType,
  type MaintenancePriorityValue,
  type MaintenanceStatusValue,
} from "@/features/maintenance/schemas";
import { getOfflineVaultClientState } from "@/offline/workspace-bridge";

export const MAINTENANCE_STATUS_TONE: Record<
  MaintenanceStatusValue,
  "info" | "warning" | "success" | "neutral"
> = {
  OPEN: "info",
  IN_PROGRESS: "warning",
  WAITING_PARTS: "warning",
  RESOLVED: "success",
  CANCELLED: "neutral",
};

export const MAINTENANCE_PRIORITY_TONE: Record<
  MaintenancePriorityValue,
  "neutral" | "info" | "warning" | "danger"
> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
};

export const ATTACHMENT_ACCEPT_ATTR =
  MAINTENANCE_ATTACHMENT_ALLOWED_MIME_TYPES.join(",");

export type UploadedAttachmentItem = {
  localId: string;
  fileName: string;
  mimeType: MaintenanceAttachmentMimeType;
  byteSize: number;
  status: "uploading" | "ready" | "error";
  intentId: string | null;
  queuedBytes?: Uint8Array;
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

function resolveAttachmentMimeType(
  file: File,
): MaintenanceAttachmentMimeType | null {
  const raw = file.type.trim().toLowerCase();
  if (
    (MAINTENANCE_ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(
      raw,
    )
  ) {
    return raw as MaintenanceAttachmentMimeType;
  }
  const lower = file.name.trim().toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return null;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function useAttachmentUploader(params: {
  maxMb: number;
  remainingSlots: number;
  offlineMode?: boolean;
}) {
  const [items, setItems] = useState<UploadedAttachmentItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setNotice(null);

    const maxBytes = params.maxMb * 1024 * 1024;
    if (items.length + files.length > params.remainingSlots) {
      setNotice(
        `Maximum of ${params.remainingSlots} additional attachment(s) allowed on this request.`,
      );
      return;
    }

    for (const file of files) {
      const localId = crypto.randomUUID();
      const mimeType = resolveAttachmentMimeType(file);
      if (!mimeType) {
        setItems((prev) => [
          ...prev,
          {
            localId,
            fileName: file.name,
            mimeType: "image/jpeg",
            byteSize: file.size,
            status: "error",
            intentId: null,
            errorMessage: "Use JPG, PNG, WebP, HEIC images or PDF files.",
          },
        ]);
        continue;
      }

      if (file.size <= 0 || file.size > maxBytes) {
        setItems((prev) => [
          ...prev,
          {
            localId,
            fileName: file.name,
            mimeType,
            byteSize: file.size,
            status: "error",
            intentId: null,
            errorMessage: `File exceeds the configured ${params.maxMb} MB limit.`,
          },
        ]);
        continue;
      }

      const vaultState = await getOfflineVaultClientState();
      if (
        params.offlineMode ||
        !vaultState.online ||
        (vaultState.vaultUnlocked && Boolean(vaultState.deviceId))
      ) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        setItems((prev) => [
          ...prev,
          {
            localId,
            fileName: file.name,
            mimeType,
            byteSize: file.size,
            status: "ready",
            intentId: null,
            queuedBytes: bytes,
            errorMessage: null,
          },
        ]);
        continue;
      }

      setItems((prev) => [
        ...prev,
        {
          localId,
          fileName: file.name,
          mimeType,
          byteSize: file.size,
          status: "uploading",
          intentId: null,
          errorMessage: null,
        },
      ]);

      try {
        const sha256 = await computeFileSha256Hex(file);
        const intentRes = await fetch("/api/maintenance/attachments/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            mimeType,
            byteSize: file.size,
            sha256,
          }),
        });
        const intentBody = (await intentRes.json()) as {
          intentId?: string;
          uploadUrl?: string;
          message?: string;
        };
        if (!intentRes.ok || !intentBody.intentId || !intentBody.uploadUrl) {
          throw new Error(
            intentBody.message ?? "Could not prepare attachment upload.",
          );
        }

        const relayRes = await fetch(intentBody.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: file,
        });
        if (!relayRes.ok) {
          const relayErr = (await relayRes.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(
            relayErr?.message ?? "Failed to upload attachment to storage.",
          );
        }

        setItems((prev) =>
          prev.map((row) =>
            row.localId === localId
              ? { ...row, status: "ready", intentId: intentBody.intentId! }
              : row,
          ),
        );
      } catch (error) {
        setItems((prev) =>
          prev.map((row) =>
            row.localId === localId
              ? {
                  ...row,
                  status: "error",
                  errorMessage:
                    error instanceof Error
                      ? error.message
                      : "Attachment upload failed.",
                }
              : row,
          ),
        );
      }
    }
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    await addFiles(files);
  }

  function removeItem(localId: string) {
    setItems((prev) => prev.filter((item) => item.localId !== localId));
  }

  function reset() {
    setItems([]);
    setNotice(null);
  }

  const readyIntentIds = items
    .filter((i) => i.status === "ready" && i.intentId && !i.queuedBytes)
    .map((i) => i.intentId!);
  const queuedAttachments = items.filter(
    (i) => i.status === "ready" && Boolean(i.queuedBytes),
  );
  const readyCount = readyIntentIds.length + queuedAttachments.length;
  const uploading = items.some((i) => i.status === "uploading");

  return {
    items,
    notice,
    uploading,
    readyIntentIds,
    queuedAttachments,
    readyCount,
    addFiles,
    handleFileSelect,
    removeItem,
    reset,
  };
}
