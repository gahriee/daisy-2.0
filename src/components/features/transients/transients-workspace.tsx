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
  checkInTransientAction,
  checkOutTransientAction,
  createTransientStayInvoiceAction,
  markNoShowTransientAction,
} from "@/features/transients/actions";
import {
  BOOKING_REQUEST_STATUS_LABELS,
  TRANSIENT_RESERVATION_STATUS_LABELS,
  type BookingRequestDto,
  type BookingRequestStatusValue,
  type TransientGuestDto,
  type TransientReservationDto,
  type TransientReservationStatusValue,
  type TransientRoomOptionDto,
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
type TransientRoomSortKey = "room" | "title" | "rate" | "status";
type TransientGuestSortKey = "name" | "phone" | "email" | "notes";

type TransientConfirmActionKind =
  "check-in" | "no-show" | "check-out" | "bill-stay";

function buildStayRowActions({
  stay,
  busy,
  busyId,
  isOfflineView,
  syncBadge,
  onRequestAction,
  onCancel,
  onResolveAttention,
}: {
  stay: TransientReservationDto;
  busy: boolean;
  busyId: string | null;
  isOfflineView: boolean;
  syncBadge: OfflineEntitySyncBadge | undefined;
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
  const stayActions: RowActionItem[] = [];
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
  if (stay.status === "CONFIRMED" || stay.status === "TENTATIVE") {
    stayActions.push(
      {
        id: "check-in",
        label: "Check in",
        busy,
        disabled: busyId !== null && !busy,
        onSelect: () => onRequestAction(stay, "check-in"),
      },
      {
        id: "no-show",
        label: isOfflineView ? "No-show (online only)" : "No-show",
        tone: "danger" as const,
        busy,
        disabled: isOfflineView || (busyId !== null && !busy),
        onSelect: () => onRequestAction(stay, "no-show"),
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
  if (stay.status === "CHECKED_IN") {
    stayActions.push({
      id: "check-out",
      label: "Check out",
      busy,
      disabled: busyId !== null && !busy,
      onSelect: () => onRequestAction(stay, "check-out"),
    });
  }
  if (
    !stay.activeInvoiceId &&
    stay.status !== "CANCELLED" &&
    stay.status !== "NO_SHOW"
  ) {
    stayActions.push({
      id: "bill-stay",
      label: isOfflineView ? "Bill stay (online only)" : "Bill stay",
      busy,
      disabled: isOfflineView || (busyId !== null && !busy),
      onSelect: () => onRequestAction(stay, "bill-stay"),
    });
  }
  if (stay.activeInvoiceId && stay.activeInvoiceStatus !== "PAID") {
    stayActions.push({
      id: "collect",
      label: "Collect payment",
      href: `/payments/new?invoiceId=${stay.activeInvoiceId}`,
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

const TRANSIENT_ROOM_SORT_COLUMNS: Record<
  TransientRoomSortKey,
  SortColumnDef<TransientRoomOptionDto>
> = {
  room: { getValue: (room) => room.number },
  title: { getValue: (room) => room.transientTitle ?? room.roomTypeName },
  rate: {
    getValue: (room) => room.transientDailyRate ?? room.resolvedDailyRate,
    kind: "money",
    defaultDirection: "desc",
  },
  status: {
    getValue: (room) => (room.isTransientPublished ? "Published" : "Hidden"),
  },
};

const TRANSIENT_GUEST_SORT_COLUMNS: Record<
  TransientGuestSortKey,
  SortColumnDef<TransientGuestDto>
> = {
  name: { getValue: (guest) => guest.fullName },
  phone: { getValue: (guest) => guest.phone },
  email: { getValue: (guest) => guest.email },
  notes: { getValue: (guest) => guest.notes },
};
import {
  CancelTransientDialog,
  CreateTransientGuestDialog,
  CreateTransientReservationDialog,
  TransientPolicyNoteDialog,
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
  "warning" | "info" | "success" | "neutral" | "danger"
> = {
  TENTATIVE: "warning",
  CONFIRMED: "info",
  CHECKED_IN: "success",
  CHECKED_OUT: "neutral",
  CANCELLED: "danger",
  NO_SHOW: "danger",
};

type SectionFilter = "all" | "requests" | "stays" | "guests" | "rooms";

export function TransientsWorkspace({
  initialOverview,
  offlineMode = false,
  initialLastSyncedAt = null,
  initialSyncBadges = {},
}: {
  initialOverview: TransientsOverviewDto;
  offlineMode?: boolean;
  initialLastSyncedAt?: string | null;
  initialSyncBadges?: Record<string, OfflineEntitySyncBadge>;
}) {
  const online = useBrowserOnline();
  const isOfflineView = offlineMode || !online;
  const [serverOverview, setServerOverview] = useState(initialOverview);
  const [overview, setOverview] = useState(initialOverview);
  const [syncBadges, setSyncBadges] =
    useState<Record<string, OfflineEntitySyncBadge>>(initialSyncBadges);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initialLastSyncedAt,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);
  const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<SectionFilter>("all");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger" | "info";
    message: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [addStayOpen, setAddStayOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
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

  function handleSaved(message: string) {
    setFeedback({ tone: "success", message });
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
          setFeedback({
            tone: "success",
            message: navigator.onLine
              ? "Re-queued draft against current server state."
              : "Re-queued draft for next sync.",
          });
        } else {
          await resolveNeedsAttentionDiscard(badge.opId);
          setFeedback({
            tone: "success",
            message: "Discarded local transient draft.",
          });
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
                : "Could not resolve local draft.",
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
            syncedMessage: isCheckIn
              ? "Checked in and synced."
              : "Checked out and synced.",
            queuedMessage: isCheckIn
              ? "Check-in saved on this device (pending sync)."
              : "Check-out saved on this device (pending sync).",
          });
          setConfirmStayAction(null);
          if (res.delivery === "needs_attention") {
            setFeedback({ tone: "danger", message: res.reason });
            await reloadOverview();
          } else {
            handleSaved(res.message);
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
          : kind === "no-show"
            ? await markNoShowTransientAction({
                reservationId: stay.id,
                expectedVersion: stay.version,
              })
            : kind === "check-out"
              ? await checkOutTransientAction({
                  reservationId: stay.id,
                  expectedVersion: stay.version,
                })
              : await createTransientStayInvoiceAction({
                  reservationId: stay.id,
                  issueImmediately: true,
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

  const q = search.trim().toLowerCase();
  const matchesQuery = (...parts: Array<string | null | undefined>) =>
    q === "" || parts.some((p) => (p ?? "").toLowerCase().includes(q));

  const filteredRequests = overview.requests.filter((req) => {
    if (statusFilter !== "ALL" && req.status !== statusFilter) return false;
    return matchesQuery(
      req.referenceCode,
      req.guestName,
      req.guestPhone,
      req.guestEmail,
      req.roomNumber,
    );
  });

  const filteredStays = overview.reservations.filter((stay) => {
    if (statusFilter !== "ALL" && stay.status !== statusFilter) return false;
    return matchesQuery(
      stay.guestName,
      stay.roomNumber,
      stay.bedNumber,
      stay.activeInvoiceNumber,
    );
  });

  const filteredGuests = overview.guests.filter((guest) =>
    matchesQuery(guest.fullName, guest.phone, guest.email),
  );

  const filteredRooms = overview.rooms.filter((room) =>
    matchesQuery(room.number, room.roomTypeName, room.transientTitle),
  );

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
  const {
    sortedRows: sortedRooms,
    sortHeaderProps: roomSortHeaderProps,
    sort: roomSort,
  } = useTableSort(filteredRooms, TRANSIENT_ROOM_SORT_COLUMNS, {
    key: "room",
    direction: "asc",
  });
  const {
    sortedRows: sortedGuests,
    sortHeaderProps: guestSortHeaderProps,
    sort: guestSort,
  } = useTableSort(filteredGuests, TRANSIENT_GUEST_SORT_COLUMNS, {
    key: "name",
    direction: "asc",
  });

  const requestsPage = useTablePagination(sortedRequests, {
    resetKey: `${q}|${statusFilter}|${section}|${requestSort?.key ?? ""}|${requestSort?.direction ?? ""}`,
  });
  const staysPage = useTablePagination(sortedStays, {
    resetKey: `${q}|${statusFilter}|${section}|${staySort?.key ?? ""}|${staySort?.direction ?? ""}`,
  });
  const roomsPage = useTablePagination(sortedRooms, {
    resetKey: `${q}|${section}|${roomSort?.key ?? ""}|${roomSort?.direction ?? ""}`,
  });
  const guestsPage = useTablePagination(sortedGuests, {
    resetKey: `${q}|${section}|${guestSort?.key ?? ""}|${guestSort?.direction ?? ""}`,
  });

  const showRequests = section === "all" || section === "requests";
  const showStays = section === "all" || section === "stays";
  const showGuests = section === "all" || section === "guests";
  const showRooms = section === "all" || section === "rooms";

  function clearFilters() {
    setSearch("");
    setSection("all");
    setStatusFilter("ALL");
  }

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Transients &amp; public booking
          </h1>
          <p className="text-sm text-muted-foreground">
            Short-stay guests, unified room allocations, stay invoicing, and
            requests submitted from{" "}
            <Link
              href="/book"
              className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            >
              /book
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/transients/rooms"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Transient rooms
          </Link>
          <Button
            type="button"
            variant="secondary"
            disabled={isOfflineView}
            onClick={() => setPolicyOpen(true)}
          >
            {isOfflineView
              ? "Public policy (online only)"
              : "Public policy note"}
          </Button>
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
          Configure standard check-in and check-out times in{" "}
          <Link
            href="/settings/operations"
            className="font-semibold underline underline-offset-4"
          >
            Settings &rarr; Stays &amp; limits
          </Link>{" "}
          before booking transient stays or publishing rooms on /book.
        </Alert>
      )}

      {feedback && (
        <Alert tone={feedback.tone} role="status">
          {feedback.message}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pending requests"
          value={overview.totals.pendingRequests}
          description="From public /book"
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
          label="Upcoming / tentative"
          value={
            overview.totals.confirmedReservations +
            overview.totals.tentativeReservations
          }
          description={
            overview.totals.tentativeReservations > 0
              ? `${overview.totals.tentativeReservations} tentative offline hold(s)`
              : "Confirmed upcoming arrivals"
          }
          tone={overview.totals.tentativeReservations > 0 ? "warning" : "info"}
          icon={<span className="text-xs font-semibold">RES</span>}
        />
        <MetricCard
          label="Published rooms"
          value={overview.totals.publishedRooms}
          description="Visible on /book"
          tone="neutral"
          icon={<span className="text-xs font-semibold">PUB</span>}
        />
      </div>

      <SearchFilterBar
        aria-label="Find transient stays and requests"
        updating={isRefreshing}
        hasActiveFilters={
          search !== "" || section !== "all" || statusFilter !== "ALL"
        }
        onClearAll={clearFilters}
        actions={
          <Link
            href="/book"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Open /book
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="transients-search" label="Find a stay or request">
            {({ id }) => (
              <SearchFilterInput
                id={id}
                value={search}
                onValueChange={setSearch}
                placeholder="Reference, guest, room, or invoice"
              />
            )}
          </Field>

          <Field id="transients-section" label="Section">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={section}
                onChange={(e) => {
                  setSection(e.target.value as SectionFilter);
                  setStatusFilter("ALL");
                }}
              >
                <option value="all">All sections</option>
                <option value="requests">Public booking requests</option>
                <option value="stays">Reservations &amp; stays</option>
                <option value="guests">Transient guests</option>
                <option value="rooms">Published rooms</option>
              </Select>
            )}
          </Field>

          <Field id="transients-status" label="Status">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All statuses</option>
                <option value="PENDING">Pending request</option>
                <option value="APPROVED">Approved request</option>
                <option value="REJECTED">Rejected request</option>
                <option value="TENTATIVE">Tentative stay</option>
                <option value="CONFIRMED">Confirmed stay</option>
                <option value="CHECKED_IN">Checked in</option>
                <option value="CHECKED_OUT">Checked out</option>
              </Select>
            )}
          </Field>
        </div>
      </SearchFilterBar>

      {showRequests && (
        <section className="grid gap-3">
          {filteredRequests.length === 0 ? (
            <Card className="overflow-hidden p-0 sm:p-0">
              <TableCardHeader
                title="Public booking requests"
                count="0 requests"
              />
              <TableEmptyState
                title={
                  overview.requests.length === 0
                    ? "No booking requests yet"
                    : "No matching booking requests"
                }
                description={
                  overview.requests.length === 0
                    ? "Published rooms on /book collect visitor inquiries for your review without auto-confirming rooms."
                    : "Try clearing what you entered or changing the selected status."
                }
                actions={
                  search !== "" || statusFilter !== "ALL" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={clearFilters}
                    >
                      Clear
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <Card className="overflow-hidden p-0 sm:p-0">
              <TableCardHeader
                title="Public booking requests"
                count={`${filteredRequests.length} ${filteredRequests.length === 1 ? "request" : "requests"}`}
              />
              <div className="grid divide-y divide-border md:hidden">
                {requestsPage.paginatedRows.map((req) => (
                  <div key={req.id} className="grid gap-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid gap-0.5">
                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                          {req.referenceCode}
                        </span>
                        <span className="font-medium text-foreground">
                          {req.guestName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Room {req.roomNumber}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatManilaDate(req.checkInDateManila)} &rarr;{" "}
                          {formatManilaDate(req.checkOutDateManila)}
                        </span>
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
                              Room {req.roomNumber}
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
                label="Public booking requests table pagination"
              />
            </Card>
          )}
        </section>
      )}

      {showStays && (
        <section className="grid gap-3">
          {filteredStays.length === 0 ? (
            <Card className="overflow-hidden p-0 sm:p-0">
              <TableCardHeader
                title="Transient stays & reservations"
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
                    ? "No transient stays recorded"
                    : "No matching transient stays"
                }
                description={
                  overview.reservations.length === 0
                    ? "Add a walk-in stay directly or approve a public booking request to lock a room allocation."
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
                  ) : search !== "" || statusFilter !== "ALL" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={clearFilters}
                    >
                      Clear
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <Card className="overflow-hidden p-0 sm:p-0">
              <TableCardHeader
                title="Transient stays & reservations"
                count={`${filteredStays.length} ${filteredStays.length === 1 ? "stay" : "stays"}`}
              />
              <div className="grid divide-y divide-border md:hidden">
                {staysPage.paginatedRows.map((stay) => {
                  const busy = busyId === stay.id;
                  return (
                    <div key={stay.id} className="grid gap-2.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="grid gap-0.5">
                          <span className="font-medium text-foreground">
                            {stay.guestName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Room {stay.roomNumber}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatManilaDate(stay.checkInDateManila)} &rarr;{" "}
                            {formatManilaDate(stay.checkOutDateManila)}
                          </span>
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
                          {formatPhpCurrency(stay.totalAmount)} ({stay.nights}n)
                        </span>
                        <RowActionMenu
                          label={`Actions for ${stay.guestName}`}
                          items={buildStayRowActions({
                            stay,
                            busy,
                            busyId,
                            isOfflineView,
                            syncBadge: syncBadges[stay.id],
                            onRequestAction: (targetStay, kind) => {
                              setConfirmError(null);
                              setConfirmStayAction({ stay: targetStay, kind });
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
                      return (
                        <TableRow key={stay.id}>
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
                                Room {stay.roomNumber}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatManilaDate(stay.checkInDateManila)}{" "}
                                &rarr;{" "}
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
                                {
                                  TRANSIENT_RESERVATION_STATUS_LABELS[
                                    stay.status
                                  ]
                                }
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
                label="Transient stays table pagination"
              />
            </Card>
          )}
        </section>
      )}

      {showRooms && (
        <section className="grid gap-3">
          <Card className="overflow-hidden p-0 sm:p-0">
            <TableCardHeader
              title="Public booking room publishing"
              count={`${filteredRooms.length} ${filteredRooms.length === 1 ? "room" : "rooms"}`}
              actions={
                <Link
                  href="/transients/rooms"
                  className={buttonClasses({
                    variant: "secondary",
                    size: "sm",
                  })}
                >
                  Manage rooms
                </Link>
              }
            />
            {filteredRooms.length === 0 ? (
              <TableEmptyState
                illustration={
                  overview.rooms.length === 0 ? "sweet-home" : "document-search"
                }
                title={
                  overview.rooms.length === 0
                    ? "No transient rooms configured"
                    : "No matching transient rooms"
                }
                description={
                  overview.rooms.length === 0
                    ? "Add rooms in your Transient building first to publish nightly stays on /book."
                    : "Try clearing what you entered to view all transient rooms."
                }
                actions={
                  overview.rooms.length === 0 ? (
                    <Link
                      href="/transients/rooms/new"
                      className={buttonClasses({ size: "sm" })}
                    >
                      Add room
                    </Link>
                  ) : search !== "" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={clearFilters}
                    >
                      Clear
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="grid divide-y divide-border md:hidden">
                  {roomsPage.paginatedRows.map((room) => (
                    <div key={room.id} className="grid gap-2.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="grid min-w-0 gap-0.5">
                          <span className="font-medium text-foreground">
                            Room {room.number}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {room.roomTypeName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {room.transientTitle?.trim() ||
                              `Room ${room.number}`}
                          </span>
                        </div>
                        <Badge
                          tone={
                            room.isTransientPublished ? "success" : "neutral"
                          }
                        >
                          {room.isTransientPublished ? "Published" : "Hidden"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                        <span className="text-sm font-medium text-foreground tabular-nums">
                          {room.resolvedDailyRate
                            ? `${formatPhpCurrency(room.resolvedDailyRate)}/night`
                            : "Unset"}
                        </span>
                        <Link
                          href={`/transients/listings/${room.id}`}
                          className={buttonClasses({
                            variant: "secondary",
                            size: "sm",
                          })}
                        >
                          Edit listing
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <Table containerClassName="rounded-none border-0">
                    <TableHeader>
                      <TableRow>
                        <TableHead {...roomSortHeaderProps("room")}>
                          Room
                        </TableHead>
                        <TableHead {...roomSortHeaderProps("title")}>
                          Public title
                        </TableHead>
                        <TableHead {...roomSortHeaderProps("rate")}>
                          Nightly rate
                        </TableHead>
                        <TableHead {...roomSortHeaderProps("status")}>
                          Status
                        </TableHead>
                        <TableHead className="text-right">Configure</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roomsPage.paginatedRows.map((room) => (
                        <TableRow key={room.id}>
                          <TableCell>
                            <div className="grid gap-0.5">
                              <span className="font-medium text-foreground">
                                Room {room.number}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {room.roomTypeName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {room.transientTitle?.trim() ||
                              `Room ${room.number}`}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {room.resolvedDailyRate
                              ? formatPhpCurrency(room.resolvedDailyRate)
                              : "Unset"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              tone={
                                room.isTransientPublished
                                  ? "success"
                                  : "neutral"
                              }
                            >
                              {room.isTransientPublished
                                ? "Published"
                                : "Hidden"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Link
                              href={`/transients/listings/${room.id}`}
                              className={buttonClasses({
                                variant: "secondary",
                                size: "sm",
                              })}
                            >
                              Edit listing
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  {...roomsPage.paginationProps}
                  label="Transient rooms table pagination"
                />
              </>
            )}
          </Card>
        </section>
      )}

      {showGuests && (
        <section className="grid gap-3">
          <Card className="overflow-hidden p-0 sm:p-0">
            <TableCardHeader
              title="Transient guests"
              count={`${filteredGuests.length} ${filteredGuests.length === 1 ? "guest" : "guests"}`}
            />
            {filteredGuests.length === 0 ? (
              <TableEmptyState
                title={
                  overview.guests.length === 0
                    ? "No transient guests yet"
                    : "No matching transient guests"
                }
                description={
                  overview.guests.length === 0
                    ? "Add a walk-in guest profile or approve a public booking request to track short-stay guests."
                    : "Try clearing what you entered to view all transient guests."
                }
                actions={
                  overview.guests.length === 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setAddGuestOpen(true)}
                    >
                      Add guest
                    </Button>
                  ) : search !== "" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={clearFilters}
                    >
                      Clear
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="grid divide-y divide-border md:hidden">
                  {guestsPage.paginatedRows.map((guest) => (
                    <div key={guest.id} className="grid gap-1.5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {guest.fullName}
                        </span>
                        <OfflineSyncBadge badge={syncBadges[guest.id]} />
                      </div>
                      <div className="grid gap-0.5 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {guest.phone ?? "—"}
                        </span>
                        <span className="truncate">{guest.email ?? "—"}</span>
                        <span className="whitespace-pre-wrap">
                          {guest.notes ?? "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <Table containerClassName="rounded-none border-0">
                    <TableHeader>
                      <TableRow>
                        <TableHead {...guestSortHeaderProps("name")}>
                          Name
                        </TableHead>
                        <TableHead {...guestSortHeaderProps("phone")}>
                          Phone
                        </TableHead>
                        <TableHead {...guestSortHeaderProps("email")}>
                          Email
                        </TableHead>
                        <TableHead {...guestSortHeaderProps("notes")}>
                          Notes
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {guestsPage.paginatedRows.map((guest) => (
                        <TableRow key={guest.id}>
                          <TableCell className="font-medium text-foreground">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>{guest.fullName}</span>
                              <OfflineSyncBadge badge={syncBadges[guest.id]} />
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {guest.phone ?? "—"}
                          </TableCell>
                          <TableCell>{guest.email ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {guest.notes ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  {...guestsPage.paginationProps}
                  label="Transient guests table pagination"
                />
              </>
            )}
          </Card>
        </section>
      )}

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
          onClose={() => setAddStayOpen(false)}
          onRequireVaultUnlock={() => setUnlockPromptOpen(true)}
          onSaved={handleSaved}
        />
      )}

      {policyOpen && (
        <TransientPolicyNoteDialog
          open={policyOpen}
          initialNote={overview.transientPolicyNote}
          onClose={() => setPolicyOpen(false)}
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
            : confirmStayAction?.kind === "no-show"
              ? "Mark stay as no-show?"
              : confirmStayAction?.kind === "check-out"
                ? "Check out transient guest?"
                : "Issue transient stay invoice?"
        }
        description={
          confirmStayAction?.kind === "check-in"
            ? "Confirming marks this guest checked in and records arrival."
            : confirmStayAction?.kind === "no-show"
              ? "Marking as no-show closes this reservation and releases the room."
              : confirmStayAction?.kind === "check-out"
                ? "Confirming marks this stay checked out and releases the room."
                : "Creates and immediately issues an invoice for this stay so payments can be recorded."
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Room &amp; dates</span>
                <span className="text-foreground">
                  Room {confirmStayAction.stay.roomNumber} ·{" "}
                  {formatManilaDate(confirmStayAction.stay.checkInDateManila)}{" "}
                  &rarr;{" "}
                  {formatManilaDate(confirmStayAction.stay.checkOutDateManila)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Stay total</span>
                <span className="font-semibold text-foreground">
                  {formatPhpCurrency(confirmStayAction.stay.totalAmount)} (
                  {confirmStayAction.stay.nights}n)
                </span>
              </div>
            </>
          ) : null
        }
        errorMessage={confirmError}
        confirmLabel={
          confirmStayAction?.kind === "check-in"
            ? "Check in"
            : confirmStayAction?.kind === "no-show"
              ? "Mark no-show"
              : confirmStayAction?.kind === "check-out"
                ? "Check out"
                : "Bill stay"
        }
        confirmVariant={
          confirmStayAction?.kind === "no-show" ? "danger" : "primary"
        }
        loading={
          confirmStayAction !== null && busyId === confirmStayAction.stay.id
        }
      />

      <OfflineVaultUnlockDialog
        open={unlockPromptOpen}
        onClose={() => setUnlockPromptOpen(false)}
        onUnlocked={() => reloadOverview()}
      />
    </div>
  );
}
