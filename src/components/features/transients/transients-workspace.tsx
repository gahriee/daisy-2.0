"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useBrowserOnline } from "@/components/features/offline/offline-status-bar";
import {
  OfflineSnapshotBanner,
  OfflineSyncBadge,
  OfflineVaultUnlockDialog,
} from "@/components/features/offline/offline-vault-unlock";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableEmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { MetricCard } from "@/components/ui/metric-card";
import {
  SearchFilterBar,
  SearchFilterInput,
} from "@/components/ui/search-filter";
import { Select } from "@/components/ui/select";
import {
  RowActionMenu,
  type RowActionItem,
} from "@/components/ui/row-action-menu";
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
import {
  notifySaved,
  toast,
  type SavedFeedbackTone,
} from "@/components/ui/toaster";
import {
  archiveTransientReservationAction,
  bulkApproveBookingRequestsAction,
  bulkArchiveTransientReservationsAction,
  checkInTransientAction,
  checkOutTransientAction,
  restoreTransientReservationAction,
} from "@/features/transients/actions";
import {
  BOOKING_REQUEST_STATUS_LABELS,
  TRANSIENT_RESERVATION_STATUS_LABELS,
  type BookingRequestDto,
  type BookingRequestStatusValue,
  type TransientReservationDto,
  type TransientReservationStatusValue,
  type TransientsOverviewDto,
} from "@/features/transients/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import type { SortColumnDef } from "@/lib/table-sort";
import {
  getBrowserOfflineDb,
  getVaultCustody,
  listActiveOutboxRecords,
  listDecryptedProjections,
} from "@/offline/client";
import type { OfflineEntitySyncBadge } from "@/offline/snapshot-selectors";
import {
  loadTransientsOverviewFromVault,
  mergeTransientsOverviewWithVaultOverlay,
} from "@/offline/snapshot-selectors-extra";
import {
  DAISY_OFFLINE_VAULT_EVENT,
  getOfflineVaultClientState,
  OfflineVaultLockedError,
  resolveNeedsAttentionDiscard,
  resolveNeedsAttentionKeepMine,
  submitOfflineCapableMutation,
  triggerForegroundSyncIfUnlocked,
} from "@/offline/workspace-bridge";

type BookingRequestSortKey = "ref" | "visitor" | "dates" | "quote" | "status";
type TransientStaySortKey = "guest" | "dates" | "total" | "billing" | "status";

type TransientConfirmActionKind =
  "check-in" | "check-out" | "archive" | "restore";

function buildStayRowActions({
  stay,
  busy,
  busyId,
  isOfflineView,
  syncBadge,
  onView,
  onRequestAction,
  onCancel,
  onResolveAttention,
}: {
  stay: TransientReservationDto;
  busy: boolean;
  busyId: string | null;
  isOfflineView: boolean;
  syncBadge: OfflineEntitySyncBadge | undefined;
  onView: (stay: TransientReservationDto) => void;
  onRequestAction: (
    stay: TransientReservationDto,
    kind: TransientConfirmActionKind,
  ) => void;
  onCancel: (stay: TransientReservationDto) => void;
  onResolveAttention: (
    badge: OfflineEntitySyncBadge,
    action: "keep_mine" | "discard",
  ) => void;
}): RowActionItem[] {
  const stayActions: RowActionItem[] = [
    {
      id: "view",
      label: "View",
      onSelect: () => onView(stay),
    },
  ];
  if (syncBadge && syncBadge.status !== "pending") {
    stayActions.push(
      {
        id: "keep-mine",
        label: "Keep local draft",
        onSelect: () => onResolveAttention(syncBadge, "keep_mine"),
      },
      {
        id: "discard-local",
        label: "Discard draft",
        tone: "danger" as const,
        onSelect: () => onResolveAttention(syncBadge, "discard"),
      },
    );
  }
  const isArchived = stay.archivedAt !== null;
  if (!isArchived && stay.status === "CONFIRMED") {
    stayActions.push(
      {
        id: "check-in",
        label: "Check in",
        busy,
        disabled: busyId !== null && !busy,
        onSelect: () => onRequestAction(stay, "check-in"),
      },
      {
        id: "cancel",
        label: isOfflineView ? "Cancel (online only)" : "Cancel",
        tone: "danger" as const,
        disabled: isOfflineView || busyId !== null,
        onSelect: () => onCancel(stay),
      },
    );
  }
  if (!isArchived && stay.status === "CHECKED_IN") {
    stayActions.push({
      id: "check-out",
      label: "Check out",
      busy,
      disabled: busyId !== null && !busy,
      onSelect: () => onRequestAction(stay, "check-out"),
    });
  }
  if (
    !isArchived &&
    stay.activeInvoiceId &&
    stay.activeInvoiceStatus !== "PAID"
  ) {
    stayActions.push({
      id: "collect",
      label: "Collect payment",
      href: `/payments/new?invoiceId=${stay.activeInvoiceId}`,
    });
  }
  if (isArchived) {
    stayActions.push({
      id: "restore",
      label: isOfflineView ? "Restore (online only)" : "Restore",
      busy,
      disabled: isOfflineView || (busyId !== null && !busy),
      onSelect: () => onRequestAction(stay, "restore"),
    });
  } else if (stay.status !== "CONFIRMED" && stay.status !== "CHECKED_IN") {
    stayActions.push({
      id: "archive",
      label: isOfflineView ? "Archive (online only)" : "Archive",
      tone: "danger" as const,
      busy,
      disabled: isOfflineView || (busyId !== null && !busy),
      onSelect: () => onRequestAction(stay, "archive"),
    });
  }
  return stayActions;
}

const BOOKING_REQUEST_SORT_COLUMNS: Record<
  BookingRequestSortKey,
  SortColumnDef<BookingRequestDto>
> = {
  ref: { getValue: (req) => req.referenceCode },
  visitor: { getValue: (req) => req.guestName },
  dates: {
    getValue: (req) => req.checkInDateManila,
    kind: "date",
    defaultDirection: "desc",
  },
  quote: {
    getValue: (req) => req.quotedTotalAmount,
    kind: "money",
    defaultDirection: "desc",
  },
  status: { getValue: (req) => BOOKING_REQUEST_STATUS_LABELS[req.status] },
};

const TRANSIENT_STAY_SORT_COLUMNS: Record<
  TransientStaySortKey,
  SortColumnDef<TransientReservationDto>
> = {
  guest: { getValue: (stay) => stay.guestName },
  dates: {
    getValue: (stay) => stay.checkInDateManila,
    kind: "date",
    defaultDirection: "desc",
  },
  total: {
    getValue: (stay) => stay.totalAmount,
    kind: "money",
    defaultDirection: "desc",
  },
  billing: {
    getValue: (stay) =>
      stay.activeInvoiceNumber
        ? `${stay.activeInvoiceNumber} ${stay.activeInvoiceStatus ?? ""}`
        : null,
  },
  status: {
    getValue: (stay) => TRANSIENT_RESERVATION_STATUS_LABELS[stay.status],
  },
};

import {
  CancelTransientDialog,
  CreateTransientGuestDialog,
  CreateTransientReservationDialog,
  TransientReservationDetailDialog,
} from "./transient-dialogs";

const REQUEST_TONE: Record<
  BookingRequestStatusValue,
  "warning" | "success" | "danger" | "neutral"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

const STAY_TONE: Record<
  TransientReservationStatusValue,
  "info" | "success" | "neutral" | "danger"
> = {
  CONFIRMED: "info",
  CHECKED_IN: "success",
  CHECKED_OUT: "neutral",
  CANCELLED: "danger",
  NO_SHOW: "danger",
};

export type TransientWorkspaceSection = "stays" | "requests";

export function TransientsWorkspace({
  initialOverview,
  section = "stays",
  offlineMode = false,
  initialLastSyncedAt = null,
  initialSyncBadges = {},
}: {
  initialOverview: TransientsOverviewDto;
  section?: TransientWorkspaceSection;
  offlineMode?: boolean;
  initialLastSyncedAt?: string | null;
  initialSyncBadges?: Record<string, OfflineEntitySyncBadge>;
}) {
  const online = useBrowserOnline();
  const isOfflineView = offlineMode || !online;
  const [prevInitialOverview, setPrevInitialOverview] =
    useState(initialOverview);
  const [serverOverview, setServerOverview] = useState(initialOverview);
  const [overview, setOverview] = useState(initialOverview);
  if (initialOverview !== prevInitialOverview) {
    setPrevInitialOverview(initialOverview);
    setServerOverview(initialOverview);
    setOverview(initialOverview);
  }
  const [syncBadges, setSyncBadges] =
    useState<Record<string, OfflineEntitySyncBadge>>(initialSyncBadges);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initialLastSyncedAt,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);
  const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);
  const [requestSearch, setRequestSearch] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("PENDING");
  const [staySearch, setStaySearch] = useState("");
  const [stayStatusFilter, setStayStatusFilter] = useState("ALL");
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkApprovePending, setBulkApprovePending] = useState(false);
  const [bulkApproveError, setBulkApproveError] = useState<string | null>(null);
  const [selectedStayIds, setSelectedStayIds] = useState<string[]>([]);
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkArchivePending, setBulkArchivePending] = useState(false);
  const [bulkArchiveError, setBulkArchiveError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "warning" | "danger";
    message: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [addStayOpen, setAddStayOpen] = useState(false);
  const [viewingStay, setViewingStay] =
    useState<TransientReservationDto | null>(null);
  const [cancellingStay, setCancellingStay] =
    useState<TransientReservationDto | null>(null);
  const [confirmStayAction, setConfirmStayAction] = useState<{
    stay: TransientReservationDto;
    kind: TransientConfirmActionKind;
  } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function applyVaultState(base: TransientsOverviewDto = serverOverview) {
    try {
      const vault = await getOfflineVaultClientState();
      setPendingCount(vault.status.pendingCount);
      setNeedsAttentionCount(vault.status.needsAttentionCount);
      setLastSyncedAt(vault.status.lastSyncedAt);

      const custody = getVaultCustody();
      if (!custody.isUnlocked()) {
        setOverview(base);
        setSyncBadges({});
        return;
      }

      const db = getBrowserOfflineDb();
      const key = custody.getKey();
      if (offlineMode || !navigator.onLine) {
        const fromVault = await loadTransientsOverviewFromVault(db, key);
        setOverview(fromVault.overview);
        setSyncBadges(fromVault.syncBadges);
        setLastSyncedAt(fromVault.lastSyncedAt);
        return;
      }

      const [projections, outbox] = await Promise.all([
        listDecryptedProjections(db, key, [
          "transient_guest",
          "transient_reservation",
        ]),
        listActiveOutboxRecords(db),
      ]);
      const merged = mergeTransientsOverviewWithVaultOverlay({
        baseOverview: base,
        projections,
        outbox,
      });
      setOverview(merged.overview);
      setSyncBadges(merged.syncBadges);
    } catch {
      // Ignore vault inspection failures cleanly.
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void applyVaultState(serverOverview);
    }, 0);
    const onVaultChange = () => {
      void applyVaultState(serverOverview);
    };
    window.addEventListener(DAISY_OFFLINE_VAULT_EVENT, onVaultChange);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener(DAISY_OFFLINE_VAULT_EVENT, onVaultChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineMode, online, serverOverview]);

  async function reloadOverview() {
    if (offlineMode || !navigator.onLine) {
      await applyVaultState(serverOverview);
      return;
    }
    await triggerForegroundSyncIfUnlocked();
    const res = await fetch("/api/transients", { cache: "no-store" });
    if (res.ok) {
      const next = (await res.json()) as TransientsOverviewDto;
      setServerOverview(next);
      await applyVaultState(next);
    }
  }

  function handleSaved(message: string, tone: SavedFeedbackTone = "success") {
    if (tone === "warning") {
      setFeedback({ tone: "warning", message });
      toast.warning(message);
    } else {
      notifySaved(message, tone);
    }
    startRefresh(async () => {
      await reloadOverview();
    });
  }

  function handleResolveAttention(
    badge: OfflineEntitySyncBadge,
    action: "keep_mine" | "discard",
  ) {
    setFeedback(null);
    startRefresh(async () => {
      try {
        if (action === "keep_mine") {
          await resolveNeedsAttentionKeepMine(badge.opId);
          toast.info(
            navigator.onLine
              ? "Marked your draft to try saving again."
              : "Marked your draft to save once online.",
          );
        } else {
          await resolveNeedsAttentionDiscard(badge.opId);
          toast.success("Removed saved draft.");
        }
        await reloadOverview();
      } catch (error) {
        if (error instanceof OfflineVaultLockedError) {
          setUnlockPromptOpen(true);
        } else {
          setFeedback({
            tone: "danger",
            message:
              error instanceof Error
                ? error.message
                : "Could not resolve saved draft.",
          });
        }
      }
    });
  }

  async function executeConfirmedStayAction() {
    if (!confirmStayAction || busyId) return;
    const { stay, kind } = confirmStayAction;
    setBusyId(stay.id);
    setFeedback(null);
    setConfirmError(null);
    try {
      const vault = await getOfflineVaultClientState();
      const supportsOfflineBridge = kind === "check-in" || kind === "check-out";
      const useOfflineBridge =
        supportsOfflineBridge &&
        (offlineMode ||
          !vault.online ||
          (vault.vaultUnlocked && Boolean(vault.deviceId)));

      if (useOfflineBridge) {
        const nowIso = new Date().toISOString();
        const isCheckIn = kind === "check-in";
        try {
          const res = await submitOfflineCapableMutation({
            type: isCheckIn
              ? "transient_reservation.checkin"
              : "transient_reservation.checkout",
            entityId: stay.id,
            baseVersion: stay.version,
            payload: {},
            projectionPayload: {
              ...stay,
              status: isCheckIn ? "CHECKED_IN" : "CHECKED_OUT",
              ...(isCheckIn
                ? { checkedInAt: nowIso }
                : { checkedOutAt: nowIso }),
              updatedAt: nowIso,
            },
            syncedMessage: isCheckIn ? "Checked in." : "Checked out.",
            queuedMessage: isCheckIn
              ? "Check-in saved on this device (waiting to go online)."
              : "Check-out saved on this device (waiting to go online).",
          });
          setConfirmStayAction(null);
          if (res.delivery === "needs_attention") {
            setFeedback({ tone: "danger", message: res.reason });
            toast.warning(res.reason);
            await reloadOverview();
          } else {
            handleSaved(
              res.message,
              res.delivery === "queued" ? "info" : "success",
            );
          }
        } catch (error) {
          if (error instanceof OfflineVaultLockedError) {
            setConfirmStayAction(null);
            setUnlockPromptOpen(true);
          } else {
            setConfirmError(
              error instanceof Error
                ? error.message
                : "Could not save stay action locally.",
            );
          }
        }
        return;
      }

      const res =
        kind === "check-in"
          ? await checkInTransientAction({
              reservationId: stay.id,
              expectedVersion: stay.version,
            })
          : kind === "check-out"
            ? await checkOutTransientAction({
                reservationId: stay.id,
                expectedVersion: stay.version,
              })
            : kind === "archive"
              ? await archiveTransientReservationAction({
                  reservationId: stay.id,
                  expectedVersion: stay.version,
                })
              : await restoreTransientReservationAction({
                  reservationId: stay.id,
                  expectedVersion: stay.version,
                });
      if (res.status === "saved") {
        setConfirmStayAction(null);
        handleSaved(res.message ?? "Updated.");
      } else if (res.status === "error") {
        setConfirmError(res.message);
      } else {
        setConfirmError("Action could not be completed.");
      }
    } finally {
      setBusyId(null);
    }
  }

  const scheduleMissing =
    !overview.checkInTimeManila || !overview.checkOutTimeManila;

  const requestQuery = requestSearch.trim().toLowerCase();
  const matchesRequestQuery = (...parts: Array<string | null | undefined>) =>
    requestQuery === "" ||
    parts.some((p) => (p ?? "").toLowerCase().includes(requestQuery));

  const stayQuery = staySearch.trim().toLowerCase();
  const matchesStayQuery = (...parts: Array<string | null | undefined>) =>
    stayQuery === "" ||
    parts.some((p) => (p ?? "").toLowerCase().includes(stayQuery));

  const filteredRequests = overview.requests.filter((req) => {
    if (requestStatusFilter !== "ALL" && req.status !== requestStatusFilter) {
      return false;
    }
    return matchesRequestQuery(
      req.referenceCode,
      req.guestName,
      req.guestPhone,
      req.guestEmail,
      req.roomNumber,
    );
  });

  const filteredStays = overview.reservations.filter((stay) => {
    if (stayStatusFilter === "ARCHIVED") {
      if (stay.archivedAt === null) return false;
    } else {
      if (stay.archivedAt !== null) return false;
      if (stayStatusFilter !== "ALL" && stay.status !== stayStatusFilter) {
        return false;
      }
    }
    return matchesStayQuery(
      stay.guestName,
      stay.guestPhone,
      stay.guestEmail,
      stay.roomNumber,
      stay.bedNumber,
      stay.activeInvoiceNumber,
    );
  });

  const {
    sortedRows: sortedRequests,
    sortHeaderProps: requestSortHeaderProps,
    sort: requestSort,
  } = useTableSort(filteredRequests, BOOKING_REQUEST_SORT_COLUMNS, {
    key: "dates",
    direction: "desc",
  });
  const {
    sortedRows: sortedStays,
    sortHeaderProps: staySortHeaderProps,
    sort: staySort,
  } = useTableSort(filteredStays, TRANSIENT_STAY_SORT_COLUMNS, {
    key: "dates",
    direction: "desc",
  });

  const requestsPage = useTablePagination(sortedRequests, {
    resetKey: `${requestQuery}|${requestStatusFilter}|${section}|${requestSort?.key ?? ""}|${requestSort?.direction ?? ""}`,
  });
  const staysPage = useTablePagination(sortedStays, {
    resetKey: `${stayQuery}|${stayStatusFilter}|${section}|${staySort?.key ?? ""}|${staySort?.direction ?? ""}`,
  });

  function clearRequestFilters() {
    setRequestSearch("");
    setRequestStatusFilter("PENDING");
  }

  function clearStayFilters() {
    setStaySearch("");
    setStayStatusFilter("ALL");
    setSelectedStayIds([]);
  }

  const pagePendingRequests = requestsPage.paginatedRows.filter(
    (req) => req.status === "PENDING",
  );
  const selectedPendingRequests = overview.requests.filter(
    (req) => req.status === "PENDING" && selectedRequestIds.includes(req.id),
  );
  const allPagePendingSelected =
    pagePendingRequests.length > 0 &&
    pagePendingRequests.every((req) => selectedRequestIds.includes(req.id));

  function toggleRequestSelection(requestId: string) {
    setSelectedRequestIds((prev) =>
      prev.includes(requestId)
        ? prev.filter((id) => id !== requestId)
        : [...prev, requestId],
    );
  }

  function toggleAllPageRequests() {
    if (allPagePendingSelected) {
      const pageIds = new Set(pagePendingRequests.map((r) => r.id));
      setSelectedRequestIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const merged = new Set([
        ...selectedRequestIds,
        ...pagePendingRequests.map((r) => r.id),
      ]);
      setSelectedRequestIds(Array.from(merged));
    }
  }

  async function executeBulkApproveRequests() {
    if (selectedPendingRequests.length === 0 || bulkApprovePending) return;
    setBulkApprovePending(true);
    setBulkApproveError(null);
    try {
      const res = await bulkApproveBookingRequestsAction(
        selectedPendingRequests.map((req) => ({
          requestId: req.id,
          expectedVersion: req.version,
        })),
      );
      if (res.status === "saved") {
        setBulkApproveOpen(false);
        setSelectedRequestIds([]);
        handleSaved(res.message);
      } else if (res.status === "error") {
        setBulkApproveError(res.message);
      }
    } finally {
      setBulkApprovePending(false);
    }
  }

  const viewingArchivedStays = stayStatusFilter === "ARCHIVED";
  const isStayBulkEligible = (stay: TransientReservationDto) =>
    viewingArchivedStays
      ? stay.archivedAt !== null
      : stay.archivedAt === null &&
        stay.status !== "CONFIRMED" &&
        stay.status !== "CHECKED_IN";

  const pageEligibleStays = staysPage.paginatedRows.filter(isStayBulkEligible);
  const selectedEligibleStays = overview.reservations.filter(
    (stay) => isStayBulkEligible(stay) && selectedStayIds.includes(stay.id),
  );
  const allPageStaysSelected =
    pageEligibleStays.length > 0 &&
    pageEligibleStays.every((stay) => selectedStayIds.includes(stay.id));

  function toggleStaySelection(stayId: string) {
    setSelectedStayIds((prev) =>
      prev.includes(stayId)
        ? prev.filter((id) => id !== stayId)
        : [...prev, stayId],
    );
  }

  function toggleAllPageStays() {
    if (allPageStaysSelected) {
      const pageIds = new Set(pageEligibleStays.map((s) => s.id));
      setSelectedStayIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const merged = new Set([
        ...selectedStayIds,
        ...pageEligibleStays.map((s) => s.id),
      ]);
      setSelectedStayIds(Array.from(merged));
    }
  }

  async function executeBulkArchiveStays() {
    if (selectedEligibleStays.length === 0 || bulkArchivePending) return;
    setBulkArchivePending(true);
    setBulkArchiveError(null);
    try {
      const res = await bulkArchiveTransientReservationsAction(
        selectedEligibleStays.map((stay) => ({
          reservationId: stay.id,
          expectedVersion: stay.version,
        })),
        viewingArchivedStays ? "restore" : "archive",
      );
      if (res.status === "saved") {
        setBulkArchiveOpen(false);
        setSelectedStayIds([]);
        handleSaved(res.message);
      } else if (res.status === "error") {
        setBulkArchiveError(res.message);
      }
    } finally {
      setBulkArchivePending(false);
    }
  }

  const viewingStayGuest = viewingStay
    ? (overview.guests.find((guest) => guest.id === viewingStay.guestId) ??
      null)
    : null;

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Stays &amp; requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Review pending booking requests from{" "}
            <Link
              href="/book"
              className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            >
              /book
            </Link>{" "}
            and manage active guest stays.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/book"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Open /book
          </Link>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAddGuestOpen(true)}
          >
            Add guest
          </Button>
          <Button
            type="button"
            onClick={() => setAddStayOpen(true)}
            disabled={scheduleMissing}
          >
            Book stay
          </Button>
        </div>
      </div>

      <OfflineSnapshotBanner
        online={online}
        offlineMode={offlineMode}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        needsAttentionCount={needsAttentionCount}
        syncing={isRefreshing}
        onSyncNow={() =>
          startRefresh(async () => {
            await reloadOverview();
          })
        }
      />

      {scheduleMissing && (
        <Alert tone="warning" title="Stay schedule required">
          Set check-in and check-out times in{" "}
          <Link
            href="/settings"
            className="font-semibold underline underline-offset-4"
          >
            Settings
          </Link>{" "}
          before booking transient stays or publishing rooms on /book.
        </Alert>
      )}

      {feedback && (
        <Alert
          tone={feedback.tone}
          role={feedback.tone === "danger" ? "alert" : "status"}
        >
          {feedback.message}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Pending bookings"
          value={overview.totals.pendingRequests}
          description="Waiting for your approval"
          tone={overview.totals.pendingRequests > 0 ? "warning" : "neutral"}
          icon={<span className="text-xs font-semibold">REQ</span>}
        />
        <MetricCard
          label="Checked in now"
          value={overview.totals.checkedInReservations}
          description="Active transient occupants"
          tone="success"
          icon={<span className="text-xs font-semibold">IN</span>}
        />
        <MetricCard
          label="Confirmed upcoming"
          value={overview.totals.confirmedReservations}
          description="Confirmed upcoming arrivals"
          tone="info"
          icon={<span className="text-xs font-semibold">RES</span>}
        />
      </div>

      {/* Table 1: Pending bookings */}
      <section className="grid gap-3">
        <SearchFilterBar
          aria-label="Find booking requests"
          updating={isRefreshing}
          hasActiveFilters={
            requestSearch !== "" || requestStatusFilter !== "PENDING"
          }
          onClearAll={clearRequestFilters}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="transients-requests-search"
              label="Find a booking request"
            >
              {({ id }) => (
                <SearchFilterInput
                  id={id}
                  value={requestSearch}
                  onValueChange={setRequestSearch}
                  placeholder="Reference, guest, phone, email, or room"
                />
              )}
            </Field>

            <Field id="transients-requests-status" label="Request status">
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  variant="filter"
                  value={requestStatusFilter}
                  onChange={(e) => setRequestStatusFilter(e.target.value)}
                >
                  <option value="PENDING">Pending bookings</option>
                  <option value="ALL">All requests</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </Select>
              )}
            </Field>
          </div>
        </SearchFilterBar>

        {filteredRequests.length === 0 ? (
          <Card className="overflow-hidden p-0 sm:p-0">
            <TableCardHeader
              title={
                requestStatusFilter === "PENDING"
                  ? "Pending bookings"
                  : "Booking requests"
              }
              count="0 requests"
            />
            <TableEmptyState
              title={
                overview.requests.length === 0
                  ? "No booking requests yet"
                  : requestStatusFilter === "PENDING" && requestSearch === ""
                    ? "No pending bookings right now"
                    : "No matching booking requests"
              }
              description={
                overview.requests.length === 0
                  ? "Published rooms on /book collect guest booking requests for your review."
                  : requestStatusFilter === "PENDING" && requestSearch === ""
                    ? "All submitted booking requests have been reviewed."
                    : "Try clearing what you entered or changing the selected status."
              }
              actions={
                requestSearch !== "" || requestStatusFilter !== "PENDING" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={clearRequestFilters}
                  >
                    Reset
                  </Button>
                ) : overview.requests.length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setRequestStatusFilter("ALL")}
                  >
                    Show all requests
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden p-0 sm:p-0">
            <TableCardHeader
              title={
                requestStatusFilter === "PENDING"
                  ? "Pending bookings"
                  : "Booking requests"
              }
              count={`${filteredRequests.length} ${filteredRequests.length === 1 ? "request" : "requests"}`}
            />
            {selectedPendingRequests.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent/40 px-4 py-2.5 sm:px-6">
                <span className="text-sm font-medium text-foreground">
                  {selectedPendingRequests.length}{" "}
                  {selectedPendingRequests.length === 1
                    ? "booking"
                    : "bookings"}{" "}
                  selected
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedRequestIds([])}
                    disabled={bulkApprovePending}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isOfflineView || bulkApprovePending}
                    onClick={() => {
                      setBulkApproveError(null);
                      setBulkApproveOpen(true);
                    }}
                  >
                    {isOfflineView
                      ? "Approve selected (online only)"
                      : "Approve selected"}
                  </Button>
                </div>
              </div>
            )}
            <div className="grid divide-y divide-border md:hidden">
              {requestsPage.paginatedRows.map((req) => (
                <div key={req.id} className="grid gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      {req.status === "PENDING" && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${req.guestName} (${req.referenceCode})`}
                          checked={selectedRequestIds.includes(req.id)}
                          disabled={isOfflineView || bulkApprovePending}
                          onChange={() => toggleRequestSelection(req.id)}
                          className="mt-1 size-4 cursor-pointer rounded border-control-border accent-primary"
                        />
                      )}
                      <div className="grid gap-0.5">
                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                          {req.referenceCode}
                        </span>
                        <span className="font-medium text-foreground">
                          {req.guestName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {req.roomNumber}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatManilaDate(req.checkInDateManila)} &rarr;{" "}
                          {formatManilaDate(req.checkOutDateManila)}
                        </span>
                      </div>
                    </div>
                    <Badge tone={REQUEST_TONE[req.status]}>
                      {BOOKING_REQUEST_STATUS_LABELS[req.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold tabular-nums">
                      {formatPhpCurrency(req.quotedTotalAmount)}
                    </span>
                    <Link
                      href={`/transients/requests/${req.id}`}
                      className={buttonClasses({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      Review request
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all pending bookings on this page"
                        checked={allPagePendingSelected}
                        disabled={
                          pagePendingRequests.length === 0 ||
                          isOfflineView ||
                          bulkApprovePending
                        }
                        onChange={toggleAllPageRequests}
                        className="size-4 cursor-pointer rounded border-control-border accent-primary"
                      />
                    </TableHead>
                    <TableHead {...requestSortHeaderProps("ref")}>
                      Reference
                    </TableHead>
                    <TableHead {...requestSortHeaderProps("visitor")}>
                      Visitor
                    </TableHead>
                    <TableHead {...requestSortHeaderProps("dates")}>
                      Room &amp; dates
                    </TableHead>
                    <TableHead {...requestSortHeaderProps("quote")}>
                      Quote
                    </TableHead>
                    <TableHead {...requestSortHeaderProps("status")}>
                      Status
                    </TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestsPage.paginatedRows.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${req.guestName} (${req.referenceCode})`}
                          checked={selectedRequestIds.includes(req.id)}
                          disabled={
                            req.status !== "PENDING" ||
                            isOfflineView ||
                            bulkApprovePending
                          }
                          onChange={() => toggleRequestSelection(req.id)}
                          className="size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold">
                        {req.referenceCode}
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-0.5">
                          <span className="font-medium text-foreground">
                            {req.guestName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {req.guestPhone ?? req.guestEmail ?? "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <div className="grid gap-0.5">
                          <span className="font-medium text-foreground">
                            {req.roomNumber}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatManilaDate(req.checkInDateManila)} &rarr;{" "}
                            {formatManilaDate(req.checkOutDateManila)} (
                            {req.nights}n)
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatPhpCurrency(req.quotedTotalAmount)}
                        {req.rateChangedSinceSubmit && (
                          <span className="block text-xs text-warning">
                            Rate changed
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge tone={REQUEST_TONE[req.status]}>
                          {BOOKING_REQUEST_STATUS_LABELS[req.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/transients/requests/${req.id}`}
                          className={buttonClasses({
                            variant: "secondary",
                            size: "sm",
                          })}
                        >
                          Review
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              {...requestsPage.paginationProps}
              label="Pending bookings table pagination"
            />
          </Card>
        )}
      </section>

      {/* Table 2: Active guests */}
      <section className="grid gap-3">
        <SearchFilterBar
          aria-label="Find active guests and stays"
          updating={isRefreshing}
          hasActiveFilters={staySearch !== "" || stayStatusFilter !== "ALL"}
          onClearAll={clearStayFilters}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="transients-stays-search" label="Find a guest or stay">
              {({ id }) => (
                <SearchFilterInput
                  id={id}
                  value={staySearch}
                  onValueChange={setStaySearch}
                  placeholder="Guest, phone, room, bed, or invoice"
                />
              )}
            </Field>

            <Field id="transients-stays-status" label="Stay status">
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  variant="filter"
                  value={stayStatusFilter}
                  onChange={(e) => {
                    setStayStatusFilter(e.target.value);
                    setSelectedStayIds([]);
                  }}
                >
                  <option value="ALL">All stays</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="CHECKED_IN">Checked in</option>
                  <option value="CHECKED_OUT">Checked out</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              )}
            </Field>
          </div>
        </SearchFilterBar>

        {filteredStays.length === 0 ? (
          <Card className="overflow-hidden p-0 sm:p-0">
            <TableCardHeader
              title={viewingArchivedStays ? "Archived guests" : "Active guests"}
              count="0 stays"
            />
            <TableEmptyState
              illustration={
                overview.reservations.length === 0
                  ? "sweet-home"
                  : "document-search"
              }
              title={
                overview.reservations.length === 0
                  ? "No active guests yet"
                  : viewingArchivedStays && staySearch === ""
                    ? "No archived stays"
                    : "No matching guest stays"
              }
              description={
                overview.reservations.length === 0
                  ? "Add a walk-in stay directly or approve a pending booking above to reserve a room."
                  : viewingArchivedStays && staySearch === ""
                    ? "Archived guest stays will appear here once you archive completed or cancelled stays."
                    : "Try clearing what you entered or changing the selected status."
              }
              actions={
                overview.reservations.length === 0 ? (
                  <Button
                    type="button"
                    onClick={() => setAddStayOpen(true)}
                    disabled={scheduleMissing}
                  >
                    Book stay
                  </Button>
                ) : staySearch !== "" || stayStatusFilter !== "ALL" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={clearStayFilters}
                  >
                    Reset
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden p-0 sm:p-0">
            <TableCardHeader
              title={viewingArchivedStays ? "Archived guests" : "Active guests"}
              count={`${filteredStays.length} ${filteredStays.length === 1 ? "stay" : "stays"}`}
            />
            {selectedEligibleStays.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent/40 px-4 py-2.5 sm:px-6">
                <span className="text-sm font-medium text-foreground">
                  {selectedEligibleStays.length}{" "}
                  {selectedEligibleStays.length === 1 ? "stay" : "stays"}{" "}
                  selected
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedStayIds([])}
                    disabled={bulkArchivePending}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={viewingArchivedStays ? "primary" : "danger"}
                    disabled={isOfflineView || bulkArchivePending}
                    onClick={() => {
                      setBulkArchiveError(null);
                      setBulkArchiveOpen(true);
                    }}
                  >
                    {viewingArchivedStays
                      ? isOfflineView
                        ? "Restore selected (online only)"
                        : "Restore selected"
                      : isOfflineView
                        ? "Archive selected (online only)"
                        : "Archive selected"}
                  </Button>
                </div>
              </div>
            )}
            <div className="grid divide-y divide-border md:hidden">
              {staysPage.paginatedRows.map((stay) => {
                const busy = busyId === stay.id;
                const eligible = isStayBulkEligible(stay);
                return (
                  <div key={stay.id} className="grid gap-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        {eligible && (
                          <input
                            type="checkbox"
                            aria-label={`Select stay for ${stay.guestName}`}
                            checked={selectedStayIds.includes(stay.id)}
                            disabled={isOfflineView || bulkArchivePending}
                            onChange={() => toggleStaySelection(stay.id)}
                            className="mt-1 size-4 cursor-pointer rounded border-control-border accent-primary"
                          />
                        )}
                        <div className="grid gap-0.5">
                          <span className="font-medium text-foreground">
                            {stay.guestName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {stay.roomNumber}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatManilaDate(stay.checkInDateManila)} &rarr;{" "}
                            {formatManilaDate(stay.checkOutDateManila)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <OfflineSyncBadge badge={syncBadges[stay.id]} />
                        <Badge tone={STAY_TONE[stay.status]}>
                          {TRANSIENT_RESERVATION_STATUS_LABELS[stay.status]}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5 text-sm">
                      <span className="font-semibold tabular-nums">
                        {formatPhpCurrency(stay.totalAmount)} ({stay.nights}
                        n)
                      </span>
                      <RowActionMenu
                        label={`Actions for ${stay.guestName}`}
                        items={buildStayRowActions({
                          stay,
                          busy,
                          busyId,
                          isOfflineView,
                          syncBadge: syncBadges[stay.id],
                          onView: setViewingStay,
                          onRequestAction: (targetStay, kind) => {
                            setConfirmError(null);
                            setConfirmStayAction({
                              stay: targetStay,
                              kind,
                            });
                          },
                          onCancel: setCancellingStay,
                          onResolveAttention: handleResolveAttention,
                        })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label={
                          viewingArchivedStays
                            ? "Select all archived stays on this page"
                            : "Select all archivable stays on this page"
                        }
                        checked={allPageStaysSelected}
                        disabled={
                          pageEligibleStays.length === 0 ||
                          isOfflineView ||
                          bulkArchivePending
                        }
                        onChange={toggleAllPageStays}
                        className="size-4 cursor-pointer rounded border-control-border accent-primary"
                      />
                    </TableHead>
                    <TableHead {...staySortHeaderProps("guest")}>
                      Guest
                    </TableHead>
                    <TableHead {...staySortHeaderProps("dates")}>
                      Room &amp; stay
                    </TableHead>
                    <TableHead {...staySortHeaderProps("total")}>
                      Total
                    </TableHead>
                    <TableHead {...staySortHeaderProps("billing")}>
                      Billing
                    </TableHead>
                    <TableHead {...staySortHeaderProps("status")}>
                      Status
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staysPage.paginatedRows.map((stay) => {
                    const busy = busyId === stay.id;
                    const eligible = isStayBulkEligible(stay);
                    return (
                      <TableRow key={stay.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Select stay for ${stay.guestName}`}
                            title={
                              !eligible && !viewingArchivedStays
                                ? "Check out or cancel this stay before archiving."
                                : undefined
                            }
                            checked={selectedStayIds.includes(stay.id)}
                            disabled={
                              !eligible || isOfflineView || bulkArchivePending
                            }
                            onChange={() => toggleStaySelection(stay.id)}
                            className="size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-0.5">
                            <span className="font-medium text-foreground">
                              {stay.guestName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {stay.guestPhone ?? stay.guestEmail ?? "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          <div className="grid gap-0.5">
                            <span className="font-medium text-foreground">
                              {stay.roomNumber}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatManilaDate(stay.checkInDateManila)} &rarr;{" "}
                              {formatManilaDate(stay.checkOutDateManila)} (
                              {stay.nights}n)
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums font-medium">
                          {formatPhpCurrency(stay.totalAmount)}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {stay.activeInvoiceId ? (
                            <div className="grid gap-0.5">
                              <span className="font-mono font-semibold text-foreground">
                                {stay.activeInvoiceNumber ?? "Draft"}
                              </span>
                              <span className="text-muted-foreground">
                                Bal{" "}
                                {formatPhpCurrency(
                                  stay.activeInvoiceBalance ?? "0",
                                )}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              Not billed
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={STAY_TONE[stay.status]}>
                              {TRANSIENT_RESERVATION_STATUS_LABELS[stay.status]}
                            </Badge>
                            <OfflineSyncBadge badge={syncBadges[stay.id]} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionMenu
                            label={`Actions for ${stay.guestName}`}
                            items={buildStayRowActions({
                              stay,
                              busy,
                              busyId,
                              isOfflineView,
                              syncBadge: syncBadges[stay.id],
                              onView: setViewingStay,
                              onRequestAction: (targetStay, kind) => {
                                setConfirmError(null);
                                setConfirmStayAction({
                                  stay: targetStay,
                                  kind,
                                });
                              },
                              onCancel: setCancellingStay,
                              onResolveAttention: handleResolveAttention,
                            })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              {...staysPage.paginationProps}
              label="Active guests table pagination"
            />
          </Card>
        )}
      </section>

      <TransientReservationDetailDialog
        reservation={viewingStay}
        guest={viewingStayGuest}
        {...(viewingStay && syncBadges[viewingStay.id]
          ? { syncBadge: syncBadges[viewingStay.id] }
          : {})}
        onClose={() => setViewingStay(null)}
      />

      {addGuestOpen && (
        <CreateTransientGuestDialog
          open={addGuestOpen}
          offlineMode={offlineMode}
          onClose={() => setAddGuestOpen(false)}
          onRequireVaultUnlock={() => setUnlockPromptOpen(true)}
          onSaved={handleSaved}
        />
      )}

      {addStayOpen && (
        <CreateTransientReservationDialog
          open={addStayOpen}
          offlineMode={offlineMode}
          guests={overview.guests}
          rooms={overview.rooms}
          reservations={overview.reservations}
          onClose={() => setAddStayOpen(false)}
          onRequireVaultUnlock={() => setUnlockPromptOpen(true)}
          onSaved={handleSaved}
        />
      )}

      <CancelTransientDialog
        reservation={cancellingStay}
        onClose={() => setCancellingStay(null)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={confirmStayAction !== null}
        onClose={() => {
          if (busyId) return;
          setConfirmError(null);
          setConfirmStayAction(null);
        }}
        onConfirm={() => void executeConfirmedStayAction()}
        title={
          confirmStayAction?.kind === "check-in"
            ? "Check in transient guest?"
            : confirmStayAction?.kind === "check-out"
              ? "Check out transient guest?"
              : confirmStayAction?.kind === "archive"
                ? "Archive this guest stay?"
                : "Restore this guest stay?"
        }
        description={
          confirmStayAction?.kind === "check-in"
            ? "Confirming marks this guest checked in and records arrival."
            : confirmStayAction?.kind === "check-out"
              ? "Confirming marks this stay checked out and releases the room."
              : confirmStayAction?.kind === "archive"
                ? "Archiving hides this completed stay from the active list. You can restore it anytime from the Archived filter."
                : "Restoring returns this stay to the active stays list."
        }
        details={
          confirmStayAction ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Guest</span>
                <span className="font-medium text-foreground">
                  {confirmStayAction.stay.guestName}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">Room &amp; dates</span>
                <div className="grid justify-items-end gap-0.5 text-right text-foreground">
                  <span className="font-medium">
                    {confirmStayAction.stay.roomNumber}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatManilaDate(confirmStayAction.stay.checkInDateManila)}{" "}
                    &rarr;{" "}
                    {formatManilaDate(
                      confirmStayAction.stay.checkOutDateManila,
                    )}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Stay total</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatPhpCurrency(confirmStayAction.stay.totalAmount)}
                  </span>
                  <Badge tone="neutral">
                    {confirmStayAction.stay.nights}{" "}
                    {confirmStayAction.stay.nights === 1 ? "night" : "nights"}
                  </Badge>
                </div>
              </div>
            </>
          ) : null
        }
        errorMessage={confirmError}
        confirmLabel={
          confirmStayAction?.kind === "check-in"
            ? "Check in"
            : confirmStayAction?.kind === "check-out"
              ? "Check out"
              : confirmStayAction?.kind === "archive"
                ? "Archive"
                : "Restore"
        }
        confirmVariant={
          confirmStayAction?.kind === "archive" ? "danger" : "primary"
        }
        loading={
          confirmStayAction !== null && busyId === confirmStayAction.stay.id
        }
      />

      <ConfirmDialog
        open={bulkApproveOpen}
        onClose={() => {
          if (!bulkApprovePending) {
            setBulkApproveError(null);
            setBulkApproveOpen(false);
          }
        }}
        onConfirm={() => void executeBulkApproveRequests()}
        title={`Approve ${selectedPendingRequests.length} ${selectedPendingRequests.length === 1 ? "pending booking" : "pending bookings"}?`}
        description="Each selected booking will be confirmed and moved into the Active guests table, and guests with an email address will receive a confirmation email."
        errorMessage={bulkApproveError}
        confirmLabel="Approve selected"
        confirmVariant="primary"
        loading={bulkApprovePending}
      />

      <ConfirmDialog
        open={bulkArchiveOpen}
        onClose={() => {
          if (!bulkArchivePending) {
            setBulkArchiveError(null);
            setBulkArchiveOpen(false);
          }
        }}
        onConfirm={() => void executeBulkArchiveStays()}
        title={
          viewingArchivedStays
            ? `Restore ${selectedEligibleStays.length} ${selectedEligibleStays.length === 1 ? "stay" : "stays"}?`
            : `Archive ${selectedEligibleStays.length} ${selectedEligibleStays.length === 1 ? "stay" : "stays"}?`
        }
        description={
          viewingArchivedStays
            ? "Restored stays will return to the All stays list."
            : "Archived stays will be hidden from All stays and can be viewed or restored anytime from the Archived filter."
        }
        errorMessage={bulkArchiveError}
        confirmLabel={
          viewingArchivedStays ? "Restore selected" : "Archive selected"
        }
        confirmVariant={viewingArchivedStays ? "primary" : "danger"}
        loading={bulkArchivePending}
      />

      <OfflineVaultUnlockDialog
        open={unlockPromptOpen}
        onClose={() => setUnlockPromptOpen(false)}
        onUnlocked={() => reloadOverview()}
      />
    </div>
  );
}
