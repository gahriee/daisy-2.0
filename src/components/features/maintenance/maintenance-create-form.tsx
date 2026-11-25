"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OfflineVaultUnlockDialog } from "@/components/features/offline/offline-vault-unlock";
import { Alert } from "@/components/ui/alert";
import { AttachmentDropbox } from "@/components/ui/attachment-dropbox";
import { Badge } from "@/components/ui/badge";
import { BackLink, Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { createMaintenanceRequestAction } from "@/features/maintenance/actions";
import {
  CreateMaintenanceSyncPayloadSchema,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_PRIORITY_LABELS,
  type MaintenanceRequestDto,
  type MaintenanceRoomOptionDto,
} from "@/features/maintenance/schemas";
import { ROOM_BUILDING_LABELS } from "@/features/rooms/schemas";
import { navigateOfflineInMemory } from "@/offline/navigation";
import {
  cacheOfflinePoliciesMeta,
  getOfflineVaultClientState,
  OfflineVaultLockedError,
  submitOfflineCapableMutation,
} from "@/offline/workspace-bridge";
import {
  ATTACHMENT_ACCEPT_ATTR,
  MAINTENANCE_PRIORITY_TONE,
  formatByteSize,
  useAttachmentUploader,
} from "./maintenance-shared";

export function MaintenanceCreateForm({
  rooms,
  proofMaxMb,
  proofMaxFilesPerRecord,
  initialRoomId = null,
  offlineMode = false,
}: {
  rooms: MaintenanceRoomOptionDto[];
  proofMaxMb: number;
  proofMaxFilesPerRecord: number;
  initialRoomId?: string | null;
  offlineMode?: boolean;
}) {
  const router = useRouter();
  const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);

  useEffect(() => {
    if (offlineMode || !navigator.onLine) return;
    const timer = window.setTimeout(() => {
      void cacheOfflinePoliciesMeta({
        proofMaxMb,
        proofMaxFilesPerRecord,
        proofMaxBytes: proofMaxMb * 1024 * 1024,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [offlineMode, proofMaxFilesPerRecord, proofMaxMb]);

  const defaultRoomId =
    (initialRoomId && rooms.some((room) => room.id === initialRoomId)
      ? initialRoomId
      : rooms[0]?.id) ?? "";

  const [roomId, setRoomId] = useState(defaultRoomId);
  const [category, setCategory] =
    useState<MaintenanceRequestDto["category"]>("PLUMBING");
  const [priority, setPriority] =
    useState<MaintenanceRequestDto["priority"]>("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const uploader = useAttachmentUploader({
    maxMb: proofMaxMb,
    remainingSlots: proofMaxFilesPerRecord,
    offlineMode,
  });

  const selectedRoom = rooms.find((room) => room.id === roomId) ?? null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setErrorMessage(null);

    if (uploader.uploading) {
      setErrorMessage("Wait for selected attachment uploads to finish.");
      return;
    }

    startTransition(async () => {
      const vault = await getOfflineVaultClientState();
      const useOfflineBridge =
        offlineMode ||
        !vault.online ||
        (vault.vaultUnlocked && Boolean(vault.deviceId));

      if (useOfflineBridge) {
        const parsed = CreateMaintenanceSyncPayloadSchema.safeParse({
          roomId,
          bedId: null,
          title,
          description,
          category,
          priority,
          attachmentIntentIds: uploader.readyIntentIds,
        });
        if (!parsed.success) {
          setErrorMessage(
            parsed.error.issues[0]?.message ??
              "Review maintenance fields before saving.",
          );
          return;
        }
        try {
          const entityId = crypto.randomUUID();
          const nowIso = new Date().toISOString();
          const res = await submitOfflineCapableMutation({
            type: "maintenance.create",
            entityId,
            baseVersion: 0,
            payload: parsed.data,
            projectionPayload: {
              id: entityId,
              roomId: parsed.data.roomId,
              roomNumber: selectedRoom?.number ?? "—",
              bedId: parsed.data.bedId,
              bedNumber: null,
              title: parsed.data.title,
              description: parsed.data.description,
              category: parsed.data.category,
              priority: parsed.data.priority,
              status: "OPEN",
              archivedAt: null,
              createdAt: nowIso,
              updatedAt: nowIso,
              updates: [],
              attachments: uploader.queuedAttachments.map((item) => ({
                id: item.localId,
                maintenanceUpdateId: null,
                fileName: item.fileName,
                mimeType: item.mimeType,
                byteSize: item.byteSize,
                sha256: "",
                downloadPath: "",
                createdAt: nowIso,
              })),
              activeHolds: [],
            },
            ...(uploader.queuedAttachments.length > 0
              ? {
                  attachments: {
                    kind: "maintenance_attachment" as const,
                    files: uploader.queuedAttachments.map((item) => ({
                      attachmentId: item.localId,
                      clientFileId: item.localId,
                      fileName: item.fileName,
                      mimeType: item.mimeType,
                      bytes: item.queuedBytes!,
                    })),
                    maxBytes: proofMaxMb * 1024 * 1024,
                    maxFiles: proofMaxFilesPerRecord,
                  },
                }
              : {}),
            syncedMessage: "Repair request logged.",
            queuedMessage:
              "Repair request saved on this device (waiting to go online).",
          });

          if (res.delivery === "synced") {
            toast.success(res.message);
            if (offlineMode || !navigator.onLine) {
              navigateOfflineInMemory(`/maintenance/${entityId}`);
            } else {
              router.push(`/maintenance/${entityId}`);
            }
          } else {
            if (res.delivery === "needs_attention") {
              toast.warning(res.reason);
            } else {
              toast.info(res.message);
            }
            if (offlineMode || !navigator.onLine) {
              navigateOfflineInMemory("/maintenance");
            } else {
              router.push("/maintenance");
            }
          }
          if (navigator.onLine && !offlineMode) {
            router.refresh();
          }
        } catch (error) {
          if (error instanceof OfflineVaultLockedError) {
            setUnlockPromptOpen(true);
          }
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not save maintenance request locally.",
          );
        }
        return;
      }

      const result = await createMaintenanceRequestAction({
        roomId,
        bedId: null,
        title,
        description,
        category,
        priority,
        attachmentIntentIds: uploader.readyIntentIds,
      });

      if (result.status === "error") {
        setErrorMessage(result.message);
        return;
      }

      if (result.status === "saved") {
        toast.success(result.message);
        router.push(
          result.requestId
            ? `/maintenance/${result.requestId}`
            : "/maintenance",
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <BackLink href="/maintenance">Maintenance</BackLink>
        <header className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Log maintenance request
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Record a room repair issue and attach optional inspection photos or
            contractor quotes.
          </p>
        </header>
      </div>

      {rooms.length === 0 && (
        <Alert tone="warning" role="alert">
          Add or restore an active room before logging a maintenance request.{" "}
          <Link href="/rooms/new" className="underline underline-offset-2">
            Add a room
          </Link>
          .
        </Alert>
      )}

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      <CompactFormScope>
        <form
          onSubmit={handleSubmit}
          className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)] xl:items-start"
        >
          <div className="grid gap-5">
            <Card className="grid gap-4">
              <div className="grid gap-0.5">
                <h2 className="text-base font-semibold text-foreground">
                  Issue details
                </h2>
                <p className="text-xs text-muted-foreground">
                  Choose the affected room, repair category, and urgency.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="maint-create-room" label="Room" required>
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      disabled={pending || rooms.length === 0}
                    >
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          Room {room.number} (
                          {ROOM_BUILDING_LABELS[room.building]}
                          {room.floor ? `, ${room.floor}` : ""})
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field id="maint-create-category" label="Category" required>
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      value={category}
                      onChange={(e) =>
                        setCategory(
                          e.target.value as MaintenanceRequestDto["category"],
                        )
                      }
                      disabled={pending}
                    >
                      {MAINTENANCE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {MAINTENANCE_CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field id="maint-create-priority" label="Priority" required>
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      value={priority}
                      onChange={(e) =>
                        setPriority(
                          e.target.value as MaintenanceRequestDto["priority"],
                        )
                      }
                      disabled={pending}
                    >
                      {MAINTENANCE_PRIORITIES.map((prio) => (
                        <option key={prio} value={prio}>
                          {MAINTENANCE_PRIORITY_LABELS[prio]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>

              <Field id="maint-create-title" label="Issue summary" required>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Bathroom pipe leak or aircon fan rattle"
                    disabled={pending}
                  />
                )}
              </Field>

              <Field id="maint-create-desc" label="Details & location" required>
                {(fieldProps) => (
                  <Textarea
                    {...fieldProps}
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={2000}
                    placeholder="Describe what needs inspection or repair."
                    disabled={pending}
                  />
                )}
              </Field>
            </Card>

            <Card className="grid gap-4">
              <div className="grid gap-0.5">
                <h2 className="text-base font-semibold text-foreground">
                  Photos or quotes (optional)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Up to {proofMaxFilesPerRecord} files, max {proofMaxMb} MB each
                  (JPG, PNG, WebP, HEIC, or PDF).
                </p>
              </div>

              <AttachmentDropbox
                accept={ATTACHMENT_ACCEPT_ATTR}
                multiple
                disabled={
                  pending || uploader.items.length >= proofMaxFilesPerRecord
                }
                title="Drop repair photos or quotes here"
                description="Files upload right away before saving the request"
                buttonLabel="Add attachment"
                onFilesSelected={(files) => void uploader.addFiles(files)}
              />

              {uploader.notice && (
                <Alert tone="warning" role="status">
                  {uploader.notice}
                </Alert>
              )}

              {uploader.items.length > 0 && (
                <ul className="divide-y divide-border border-t border-border">
                  {uploader.items.map((item) => (
                    <li
                      key={item.localId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 last:pb-0 text-xs"
                    >
                      <div className="grid min-w-0 gap-0.5">
                        <p className="truncate font-medium text-foreground">
                          {item.fileName}
                        </p>
                        <p className="text-muted-foreground tabular-nums">
                          {formatByteSize(item.byteSize)}
                        </p>
                        <p className="text-muted-foreground">
                          {item.status === "uploading"
                            ? "Uploading…"
                            : item.status === "ready"
                              ? item.queuedBytes
                                ? "Waiting to save"
                                : "Uploaded"
                              : (item.errorMessage ?? "Error")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-danger"
                        size="sm"
                        onClick={() => uploader.removeItem(item.localId)}
                        disabled={pending}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="grid gap-4 xl:sticky xl:top-6">
            <h2 className="text-base font-semibold text-foreground">
              Request summary
            </h2>

            <dl className="grid gap-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Room</dt>
                <dd className="text-right font-medium text-foreground">
                  {selectedRoom ? `Room ${selectedRoom.number}` : "None"}
                  {selectedRoom ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {ROOM_BUILDING_LABELS[selectedRoom.building]}
                    </span>
                  ) : null}
                  {selectedRoom?.floor ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {selectedRoom.floor}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="font-medium text-foreground">
                  {MAINTENANCE_CATEGORY_LABELS[category]}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Priority</dt>
                <dd>
                  <Badge tone={MAINTENANCE_PRIORITY_TONE[priority]}>
                    {MAINTENANCE_PRIORITY_LABELS[priority]}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Attachments</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {uploader.readyCount} / {proofMaxFilesPerRecord}
                </dd>
              </div>
            </dl>

            <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
              After saving, you can place a maintenance hold to block new tenant
              assignments and transient stays while repairs are underway.
            </p>

            <div className="hidden gap-2 xl:grid">
              <Button
                type="submit"
                loading={pending}
                disabled={uploader.uploading || rooms.length === 0}
              >
                {uploader.uploading
                  ? "Uploading attachments…"
                  : "Save maintenance request"}
              </Button>
              <Link
                href="/maintenance"
                className={buttonClasses({ variant: "secondary", size: "md" })}
              >
                Cancel
              </Link>
            </div>
          </Card>

          <div className="sticky bottom-0 z-10 -mx-4 grid gap-2 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_20px_-14px_rgb(34_34_34/0.16)] sm:-mx-6 sm:px-6 xl:hidden">
            <Button
              type="submit"
              loading={pending}
              disabled={uploader.uploading || rooms.length === 0}
              className="w-full"
            >
              {uploader.uploading
                ? "Uploading attachments…"
                : "Save maintenance request"}
            </Button>
            <Link
              href="/maintenance"
              className={buttonClasses({
                variant: "secondary",
                size: "md",
                className: "w-full",
              })}
            >
              Cancel
            </Link>
          </div>
        </form>
      </CompactFormScope>

      <OfflineVaultUnlockDialog
        open={unlockPromptOpen}
        onClose={() => setUnlockPromptOpen(false)}
      />
    </div>
  );
}
