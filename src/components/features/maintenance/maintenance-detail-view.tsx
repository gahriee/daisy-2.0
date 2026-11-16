"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBrowserOnline } from "@/components/features/offline/offline-status-bar";
import {
  OfflineSyncBadge,
  OfflineVaultUnlockDialog,
} from "@/components/features/offline/offline-vault-unlock";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TableEmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCardHeader,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Textarea } from "@/components/ui/textarea";
import {
  addMaintenanceUpdateAction,
  archiveMaintenanceRequestAction,
  placeMaintenanceHoldAction,
  releaseMaintenanceHoldAction,
  restoreMaintenanceRequestAction,
} from "@/features/maintenance/actions";
import {
  AddMaintenanceUpdateSyncPayloadSchema,
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_STATUSES,
  type MaintenanceRequestDto,
  type MaintenanceStatusValue,
} from "@/features/maintenance/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { addManilaDays, formatManilaDate, toManilaDate } from "@/lib/dates";
import type { SortColumnDef } from "@/lib/table-sort";
import type { OfflineEntitySyncBadge } from "@/offline/snapshot-selectors";
import {
  getOfflineVaultClientState,
  OfflineVaultLockedError,
  submitOfflineCapableMutation,
} from "@/offline/workspace-bridge";
import {
  ATTACHMENT_ACCEPT_ATTR,
  MAINTENANCE_PRIORITY_TONE,
  MAINTENANCE_STATUS_TONE,
  formatByteSize,
  useAttachmentUploader,
} from "./maintenance-shared";

type MaintenanceAttachmentSortKey = "file" | "type" | "size";
type MaintenanceUpdateSortKey = "event" | "note" | "date";

const ATTACHMENT_SORT_COLUMNS: Record<
  MaintenanceAttachmentSortKey,
  SortColumnDef<MaintenanceRequestDto["attachments"][number]>
> = {
  file: { getValue: (att) => att.fileName },
  type: { getValue: (att) => att.mimeType },
  size: {
    getValue: (att) => att.byteSize,
    kind: "number",
    defaultDirection: "desc",
  },
};

const UPDATE_SORT_COLUMNS: Record<
  MaintenanceUpdateSortKey,
  SortColumnDef<MaintenanceRequestDto["updates"][number]>
> = {
  event: {
    getValue: (upd) =>
      upd.statusTo
        ? `Status -> ${MAINTENANCE_STATUS_LABELS[upd.statusTo]}`
        : "Progress note",
  },
  note: { getValue: (upd) => upd.note ?? "" },
  date: {
    getValue: (upd) => upd.createdAt,
    kind: "date",
    defaultDirection: "desc",
  },
};

export function MaintenanceDetailView({
  request,
  proofMaxMb,
  proofMaxFilesPerRecord,
  justCreated = false,
  offlineMode = false,
  syncBadge,
  onRefreshVault,
}: {
  request: MaintenanceRequestDto;
  proofMaxMb: number;
  proofMaxFilesPerRecord: number;
  justCreated?: boolean;
  offlineMode?: boolean;
  syncBadge?: OfflineEntitySyncBadge;
  onRefreshVault?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const online = useBrowserOnline();
  const isOfflineView = offlineMode || !online;
  const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);
  const [statusTo, setStatusTo] = useState<"" | MaintenanceStatusValue>("");
  const [note, setNote] = useState("");
  const [holdFormOpen, setHoldFormOpen] = useState(false);
  const [holdStartDate, setHoldStartDate] = useState(() =>
    toManilaDate(new Date()),
  );
  const [holdEndDate, setHoldEndDate] = useState(() =>
    addManilaDays(toManilaDate(new Date()), 3),
  );
  const [holdNotes, setHoldNotes] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(
    justCreated
      ? {
          tone: "success",
          message: `Logged maintenance request for Room ${request.roomNumber}.`,
        }
      : null,
  );
  const [pending, startTransition] = useTransition();

  const isArchived = request.archivedAt !== null;
  const remainingAttachmentSlots = Math.max(
    0,
    proofMaxFilesPerRecord - request.attachments.length,
  );
  const uploader = useAttachmentUploader({
    maxMb: proofMaxMb,
    remainingSlots: remainingAttachmentSlots,
    offlineMode,
  });

  const attachmentsSort = useTableSort(
    request.attachments,
    ATTACHMENT_SORT_COLUMNS,
  );
  const attachmentsPage = useTablePagination(attachmentsSort.sortedRows, {
    resetKey: `${attachmentsSort.sort?.key ?? ""}|${attachmentsSort.sort?.direction ?? ""}`,
  });

  const updatesSort = useTableSort(request.updates, UPDATE_SORT_COLUMNS);
  const updatesPage = useTablePagination(updatesSort.sortedRows, {
    resetKey: `${updatesSort.sort?.key ?? ""}|${updatesSort.sort?.direction ?? ""}`,
  });

  function handleUpdateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFeedback(null);

    if (uploader.uploading) {
      setFeedback({
        tone: "danger",
        message: "Wait for attachment uploads to finish.",
      });
      return;
    }

    startTransition(async () => {
      const vault = await getOfflineVaultClientState();
      const useOfflineBridge =
        offlineMode ||
        !vault.online ||
        (vault.vaultUnlocked && Boolean(vault.deviceId));

      if (useOfflineBridge) {
        const parsed = AddMaintenanceUpdateSyncPayloadSchema.safeParse({
          statusTo: statusTo === "" ? null : statusTo,
          note,
          attachmentIntentIds: uploader.readyIntentIds,
        });
        if (!parsed.success) {
          setFeedback({
            tone: "danger",
            message:
              parsed.error.issues[0]?.message ??
              "Enter an update note, status change, or attachment.",
          });
          return;
        }
        try {
          const nowIso = new Date().toISOString();
          const res = await submitOfflineCapableMutation({
            type: "maintenance.update",
            entityId: request.id,
            baseVersion: request.version,
            payload: parsed.data,
            projectionPayload: {
              ...request,
              status: parsed.data.statusTo ?? request.status,
              updatedAt: nowIso,
              updates: [
                {
                  id: crypto.randomUUID(),
                  statusFrom: request.status,
                  statusTo: parsed.data.statusTo,
                  note: parsed.data.note ?? "",
                  createdByActorType: "owner",
                  createdAt: nowIso,
                },
                ...request.updates,
              ],
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
                    maxFiles: remainingAttachmentSlots,
                  },
                }
              : {}),
            syncedMessage: "Maintenance update saved and synced.",
            queuedMessage: "Update saved on this device (pending sync).",
          });
          setStatusTo("");
          setNote("");
          uploader.reset();
          setFeedback({
            tone: res.delivery === "needs_attention" ? "danger" : "success",
            message:
              res.delivery === "needs_attention" ? res.reason : res.message,
          });
          await onRefreshVault?.();
          if (navigator.onLine && !offlineMode) {
            router.refresh();
          }
        } catch (error) {
          if (error instanceof OfflineVaultLockedError) {
            setUnlockPromptOpen(true);
          }
          setFeedback({
            tone: "danger",
            message:
              error instanceof Error
                ? error.message
                : "Could not save update offline.",
          });
        }
        return;
      }

      const result = await addMaintenanceUpdateAction({
        requestId: request.id,
        expectedVersion: request.version,
        statusTo: statusTo === "" ? null : statusTo,
        note,
        attachmentIntentIds: uploader.readyIntentIds,
      });

      if (result.status === "error") {
        setFeedback({ tone: "danger", message: result.message });
        return;
      }

      if (result.status === "saved") {
        setStatusTo("");
        setNote("");
        uploader.reset();
        setFeedback({ tone: "success", message: result.message });
        router.refresh();
      }
    });
  }

  function handlePlaceHold(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFeedback(null);

    startTransition(async () => {
      const result = await placeMaintenanceHoldAction({
        requestId: request.id,
        expectedVersion: request.version,
        scope: "WHOLE_ROOM",
        bedId: null,
        startDateManila: holdStartDate,
        endDateManila: holdEndDate,
        notes: holdNotes || null,
      });

      if (result.status === "error") {
        setFeedback({ tone: "danger", message: result.message });
        return;
      }

      if (result.status === "saved") {
        setHoldFormOpen(false);
        setHoldNotes("");
        setFeedback({ tone: "success", message: result.message });
        router.refresh();
      }
    });
  }

  const [pendingConfirm, setPendingConfirm] = useState<
    "archive" | "restore" | "complete-hold" | "cancel-hold" | null
  >(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function handleReleaseHold(action: "COMPLETE" | "CANCEL") {
    if (pending) return;
    setFeedback(null);
    setConfirmError(null);

    startTransition(async () => {
      const result = await releaseMaintenanceHoldAction({
        requestId: request.id,
        expectedVersion: request.version,
        action,
      });

      if (result.status === "error") {
        setConfirmError(result.message);
        return;
      }

      if (result.status === "saved") {
        setPendingConfirm(null);
        setFeedback({ tone: "success", message: result.message });
        router.refresh();
      }
    });
  }

  function handleArchiveToggle() {
    if (pending) return;
    setFeedback(null);
    setConfirmError(null);

    startTransition(async () => {
      const vault = await getOfflineVaultClientState();
      const useOfflineBridge =
        offlineMode ||
        !vault.online ||
        (vault.vaultUnlocked && Boolean(vault.deviceId));

      if (useOfflineBridge) {
        try {
          const nowIso = new Date().toISOString();
          const res = await submitOfflineCapableMutation({
            type: isArchived ? "maintenance.restore" : "maintenance.archive",
            entityId: request.id,
            baseVersion: request.version,
            payload: {},
            projectionPayload: {
              ...request,
              archivedAt: isArchived ? null : nowIso,
              updatedAt: nowIso,
            },
            syncedMessage: isArchived
              ? "Maintenance request restored and synced."
              : "Maintenance request archived and synced.",
            queuedMessage: isArchived
              ? "Restore saved on this device (pending sync)."
              : "Archive saved on this device (pending sync).",
          });
          setPendingConfirm(null);
          setFeedback({
            tone: res.delivery === "needs_attention" ? "danger" : "success",
            message:
              res.delivery === "needs_attention" ? res.reason : res.message,
          });
          await onRefreshVault?.();
          if (navigator.onLine && !offlineMode) {
            router.refresh();
          }
        } catch (error) {
          if (error instanceof OfflineVaultLockedError) {
            setPendingConfirm(null);
            setUnlockPromptOpen(true);
          } else {
            setConfirmError(
              error instanceof Error
                ? error.message
                : "Could not update request offline.",
            );
          }
        }
        return;
      }

      const result = isArchived
        ? await restoreMaintenanceRequestAction({
            requestId: request.id,
            expectedVersion: request.version,
          })
        : await archiveMaintenanceRequestAction({
            requestId: request.id,
            expectedVersion: request.version,
          });

      if (result.status === "error") {
        setConfirmError(result.message);
        return;
      }

      if (result.status === "saved") {
        setPendingConfirm(null);
        setFeedback({ tone: "success", message: result.message });
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {request.title}
            </h1>
            <Badge tone={MAINTENANCE_STATUS_TONE[request.status]}>
              {MAINTENANCE_STATUS_LABELS[request.status]}
            </Badge>
            <Badge tone={MAINTENANCE_PRIORITY_TONE[request.priority]}>
              {MAINTENANCE_PRIORITY_LABELS[request.priority]} priority
            </Badge>
            <Badge tone="neutral">
              {MAINTENANCE_CATEGORY_LABELS[request.category]}
            </Badge>
            {isArchived && <Badge tone="neutral">Archived</Badge>}
            <OfflineSyncBadge badge={syncBadge} />
          </div>

          <div className="grid gap-0.5 text-sm text-muted-foreground">
            <span>
              <Link
                href={`/rooms/${request.roomId}`}
                className="font-medium text-foreground hover:text-primary"
              >
                Room {request.roomNumber}
              </Link>
            </span>
            <span className="tabular-nums">
              Logged{" "}
              {formatManilaDate(toManilaDate(new Date(request.createdAt)))}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={isArchived ? "secondary" : "danger"}
            size="md"
            loading={pending}
            disabled={uploader.uploading}
            onClick={() => {
              setConfirmError(null);
              setPendingConfirm(isArchived ? "restore" : "archive");
            }}
          >
            {isArchived ? "Restore request" : "Archive"}
          </Button>
          <Link
            href="/maintenance"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Back to maintenance
          </Link>
        </div>
      </header>

      {feedback && (
        <Alert
          tone={feedback.tone === "success" ? "success" : "danger"}
          role={feedback.tone === "success" ? "status" : "alert"}
        >
          {feedback.message}
        </Alert>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)] xl:items-start">
        <div className="grid gap-5">
          <Card className="grid gap-3">
            <h2 className="text-base font-semibold text-foreground">
              Issue description
            </h2>
            <p className="rounded-control border border-border bg-surface-muted px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap text-foreground">
              {request.description}
            </p>
            {(request.resolvedAt || request.cancelledAt) && (
              <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {request.resolvedAt && (
                  <div>
                    <dt className="inline font-medium text-foreground">
                      Resolved:{" "}
                    </dt>
                    <dd className="inline tabular-nums">
                      {formatManilaDate(
                        toManilaDate(new Date(request.resolvedAt)),
                      )}
                    </dd>
                  </div>
                )}
                {request.cancelledAt && (
                  <div>
                    <dt className="inline font-medium text-foreground">
                      Cancelled:{" "}
                    </dt>
                    <dd className="inline tabular-nums">
                      {formatManilaDate(
                        toManilaDate(new Date(request.cancelledAt)),
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </Card>

          <Card className="overflow-hidden p-0 sm:p-0">
            <TableCardHeader
              title="Attachments"
              count={`${request.attachments.length} of ${proofMaxFilesPerRecord} files`}
            />

            {request.attachments.length === 0 ? (
              <TableEmptyState
                title="No attachments uploaded"
                description="No photos or documents attached yet."
              />
            ) : (
              <>
                <div className="grid divide-y divide-border md:hidden">
                  {attachmentsPage.paginatedRows.map((att) => (
                    <div key={att.id} className="grid gap-2.5 p-4">
                      <div className="grid min-w-0 gap-0.5">
                        <span className="truncate font-medium text-foreground">
                          {att.fileName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {att.mimeType}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatByteSize(att.byteSize)}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        <a
                          href={att.downloadPath}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonClasses({
                            variant: "secondary",
                            size: "sm",
                          })}
                        >
                          View file
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block">
                  <Table containerClassName="rounded-none border-0">
                    <TableHeader>
                      <TableRow>
                        <TableHead {...attachmentsSort.sortHeaderProps("file")}>
                          File
                        </TableHead>
                        <TableHead {...attachmentsSort.sortHeaderProps("type")}>
                          Type
                        </TableHead>
                        <TableHead
                          numeric
                          {...attachmentsSort.sortHeaderProps("size")}
                        >
                          Size
                        </TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attachmentsPage.paginatedRows.map((att) => (
                        <TableRow key={att.id}>
                          <TableCell className="font-medium text-foreground">
                            {att.fileName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {att.mimeType}
                          </TableCell>
                          <TableCell numeric className="text-muted-foreground">
                            {formatByteSize(att.byteSize)}
                          </TableCell>
                          <TableCell className="text-right">
                            <a
                              href={att.downloadPath}
                              target="_blank"
                              rel="noreferrer"
                              className={buttonClasses({
                                variant: "secondary",
                                size: "sm",
                              })}
                            >
                              View file
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  {...attachmentsPage.paginationProps}
                  label="Attachments table pagination"
                />
              </>
            )}
          </Card>

          <Card className="overflow-hidden p-0 sm:p-0">
            <TableCardHeader
              title="Updates"
              count={`${request.updates.length} ${request.updates.length === 1 ? "update" : "updates"}`}
            />

            {request.updates.length === 0 ? (
              <TableEmptyState
                title="No updates posted"
                description="No updates posted yet."
              />
            ) : (
              <>
                <div className="grid divide-y divide-border md:hidden">
                  {updatesPage.paginatedRows.map((upd) => (
                    <div key={upd.id} className="grid gap-1.5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {upd.statusTo
                            ? `Status -> ${MAINTENANCE_STATUS_LABELS[upd.statusTo]}`
                            : "Progress note"}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatManilaDate(
                            toManilaDate(new Date(upd.createdAt)),
                          )}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {upd.note ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block">
                  <Table containerClassName="rounded-none border-0">
                    <TableHeader>
                      <TableRow>
                        <TableHead {...updatesSort.sortHeaderProps("event")}>
                          Event
                        </TableHead>
                        <TableHead {...updatesSort.sortHeaderProps("note")}>
                          Note
                        </TableHead>
                        <TableHead {...updatesSort.sortHeaderProps("date")}>
                          Date
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {updatesPage.paginatedRows.map((upd) => (
                        <TableRow key={upd.id}>
                          <TableCell className="font-medium whitespace-nowrap text-foreground">
                            {upd.statusTo
                              ? `Status -> ${MAINTENANCE_STATUS_LABELS[upd.statusTo]}`
                              : "Progress note"}
                          </TableCell>
                          <TableCell className="whitespace-pre-wrap text-foreground">
                            {upd.note ?? "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                            {formatManilaDate(
                              toManilaDate(new Date(upd.createdAt)),
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  {...updatesPage.paginationProps}
                  label="Updates table pagination"
                />
              </>
            )}
          </Card>

          {!isArchived && (
            <Card className="grid gap-4">
              <div className="grid gap-0.5">
                <h2 className="text-base font-semibold text-foreground">
                  Add status update or note
                </h2>
                <p className="text-xs text-muted-foreground">
                  Updates append to the audit timeline and cannot be edited once
                  posted.
                </p>
              </div>

              <CompactFormScope>
                <form onSubmit={handleUpdateSubmit} className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="maint-update-status" label="New status">
                      {(fieldProps) => (
                        <Select
                          {...fieldProps}
                          value={statusTo}
                          onChange={(e) =>
                            setStatusTo(
                              e.target.value as "" | MaintenanceStatusValue,
                            )
                          }
                          disabled={pending}
                        >
                          <option value="">Keep current status</option>
                          {MAINTENANCE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {MAINTENANCE_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>

                    {remainingAttachmentSlots > 0 && (
                      <Field
                        id="maint-update-files"
                        label="Add photos/files"
                        description={`${remainingAttachmentSlots} slot(s) remaining (max ${proofMaxMb} MB)`}
                      >
                        {(fieldProps) => (
                          <Input
                            {...fieldProps}
                            type="file"
                            multiple
                            accept={ATTACHMENT_ACCEPT_ATTR}
                            onChange={uploader.handleFileSelect}
                            disabled={pending}
                          />
                        )}
                      </Field>
                    )}
                  </div>

                  {uploader.notice && (
                    <Alert tone="warning" role="status">
                      {uploader.notice}
                    </Alert>
                  )}

                  {uploader.items.length > 0 && (
                    <ul className="grid gap-2">
                      {uploader.items.map((item) => (
                        <li
                          key={item.localId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-2 text-xs"
                        >
                          <div className="grid min-w-0 gap-0.5">
                            <span className="truncate font-medium text-foreground">
                              {item.fileName}
                            </span>
                            <span className="text-muted-foreground">
                              {item.status === "uploading"
                                ? "Uploading…"
                                : item.status === "ready"
                                  ? item.queuedBytes
                                    ? "Queued for sync"
                                    : "Uploaded"
                                  : (item.errorMessage ?? "Error")}
                            </span>
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

                  <Field id="maint-update-note" label="Progress note">
                    {(fieldProps) => (
                      <Textarea
                        {...fieldProps}
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={1500}
                        placeholder="Parts ordered, technician visit notes, or completion summary..."
                        disabled={pending}
                      />
                    )}
                  </Field>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="submit"
                      loading={pending}
                      disabled={uploader.uploading}
                    >
                      {uploader.uploading ? "Uploading…" : "Post update"}
                    </Button>
                  </div>
                </form>
              </CompactFormScope>
            </Card>
          )}
        </div>

        <Card className="grid gap-4 xl:sticky xl:top-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-0.5">
              <h2 className="text-base font-semibold text-foreground">
                Maintenance holds
              </h2>
              <p className="text-xs text-muted-foreground">
                Blocks overlapping tenant assignments and transient bookings.
              </p>
            </div>
            {!isArchived &&
              request.status !== "RESOLVED" &&
              request.status !== "CANCELLED" &&
              request.activeHolds.length === 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isOfflineView}
                  onClick={() => setHoldFormOpen((open) => !open)}
                >
                  {isOfflineView
                    ? "Place hold (online only)"
                    : holdFormOpen
                      ? "Close hold form"
                      : "Place hold"}
                </Button>
              )}
          </div>

          {request.activeHolds.length > 0 ? (
            <div className="grid gap-3 rounded-control border border-warning-border bg-warning-surface px-3.5 py-3">
              <div className="grid gap-1 text-xs">
                <p className="font-semibold text-foreground">
                  Room {request.roomNumber} under active maintenance hold
                </p>
                {request.activeHolds[0] && (
                  <>
                    <p className="text-muted-foreground tabular-nums">
                      {formatManilaDate(request.activeHolds[0].startDateManila)}{" "}
                      to{" "}
                      {formatManilaDate(request.activeHolds[0].endDateManila)}
                    </p>
                    {request.activeHolds[0].notes && (
                      <p className="text-foreground">
                        {request.activeHolds[0].notes}
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="grid gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={pending}
                  disabled={isOfflineView}
                  onClick={() => {
                    setConfirmError(null);
                    setPendingConfirm("complete-hold");
                  }}
                >
                  {isOfflineView
                    ? "Return to service (online only)"
                    : "Return to service"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  loading={pending}
                  disabled={isOfflineView}
                  onClick={() => {
                    setConfirmError(null);
                    setPendingConfirm("cancel-hold");
                  }}
                >
                  {isOfflineView ? "Cancel hold (online only)" : "Cancel hold"}
                </Button>
              </div>
            </div>
          ) : holdFormOpen ? (
            <CompactFormScope>
              <form
                onSubmit={handlePlaceHold}
                className="grid gap-3 rounded-control border border-border bg-surface-muted p-3.5"
              >
                <div className="grid gap-3">
                  <Field id="maint-hold-start" label="Hold start date" required>
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        type="date"
                        value={holdStartDate}
                        onChange={(e) => setHoldStartDate(e.target.value)}
                        disabled={pending}
                      />
                    )}
                  </Field>
                  <Field id="maint-hold-end" label="Hold end date" required>
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        type="date"
                        value={holdEndDate}
                        onChange={(e) => setHoldEndDate(e.target.value)}
                        disabled={pending}
                      />
                    )}
                  </Field>
                  <Field id="maint-hold-notes" label="Hold notes">
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        value={holdNotes}
                        onChange={(e) => setHoldNotes(e.target.value)}
                        maxLength={500}
                        placeholder="Optional reason or contractor schedule"
                        disabled={pending}
                      />
                    )}
                  </Field>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setHoldFormOpen(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={pending}>
                    Confirm hold
                  </Button>
                </div>
              </form>
            </CompactFormScope>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              No active room hold is placed for this issue.
              {(isArchived ||
                request.status === "RESOLVED" ||
                request.status === "CANCELLED") &&
                " Reopen or restore the request if a room hold is needed."}
            </p>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={pendingConfirm !== null}
        onClose={() => {
          if (!pending) {
            setConfirmError(null);
            setPendingConfirm(null);
          }
        }}
        onConfirm={() => {
          if (pendingConfirm === "archive" || pendingConfirm === "restore") {
            handleArchiveToggle();
          } else if (pendingConfirm === "complete-hold") {
            handleReleaseHold("COMPLETE");
          } else if (pendingConfirm === "cancel-hold") {
            handleReleaseHold("CANCEL");
          }
        }}
        title={
          pendingConfirm === "archive"
            ? "Archive maintenance request?"
            : pendingConfirm === "restore"
              ? "Restore maintenance request?"
              : pendingConfirm === "complete-hold"
                ? `Return Room ${request.roomNumber} to service?`
                : `Cancel Room ${request.roomNumber} hold?`
        }
        description={
          pendingConfirm === "archive"
            ? "Archiving hides this request from active maintenance views. You can restore it anytime."
            : pendingConfirm === "restore"
              ? "Restoring returns this maintenance request to active queues."
              : pendingConfirm === "complete-hold"
                ? "Completing the hold marks the repair complete and restores room availability."
                : "Cancelling the hold immediately ends the maintenance block and restores room availability."
        }
        errorMessage={confirmError}
        confirmLabel={
          pendingConfirm === "archive"
            ? "Archive"
            : pendingConfirm === "restore"
              ? "Restore request"
              : pendingConfirm === "complete-hold"
                ? "Return to service"
                : "Cancel hold"
        }
        confirmVariant={
          pendingConfirm === "archive" || pendingConfirm === "cancel-hold"
            ? "danger"
            : "primary"
        }
        loading={pending}
      />

      <OfflineVaultUnlockDialog
        open={unlockPromptOpen}
        onClose={() => setUnlockPromptOpen(false)}
      />
    </div>
  );
}
