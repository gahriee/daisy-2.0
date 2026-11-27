"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { MetricCard } from "@/components/ui/metric-card";
import {
  SearchFilterBar,
  SearchFilterInput,
} from "@/components/ui/search-filter";
import {
  RowActionMenu,
  type RowActionItem,
} from "@/components/ui/row-action-menu";
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
import { toast } from "@/components/ui/toaster";
import {
  addMaintenanceUpdateAction,
  archiveMaintenanceRequestAction,
  bulkArchiveMaintenanceRequestsAction,
  restoreMaintenanceRequestAction,
} from "@/features/maintenance/actions";
import {
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_STATUSES,
  type MaintenanceOverviewDto,
  type MaintenancePriorityValue,
  type MaintenanceRequestDto,
} from "@/features/maintenance/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatManilaDate, toManilaDate } from "@/lib/dates";
import type { SortColumnDef } from "@/lib/table-sort";
import {
  getBrowserOfflineDb,
  getVaultCustody,
  listActiveOutboxRecords,
  listDecryptedProjections,
} from "@/offline/client";
import {
  loadMaintenanceOverviewFromVault,
  mergeMaintenanceOverviewWithVaultOverlay,
  type OfflineEntitySyncBadge,
} from "@/offline/snapshot-selectors";
import {
  cacheOfflinePoliciesMeta,
  DAISY_OFFLINE_VAULT_EVENT,
  getOfflineVaultClientState,
  OfflineVaultLockedError,
  resolveNeedsAttentionDiscard,
  resolveNeedsAttentionKeepMine,
  triggerForegroundSyncIfUnlocked,
} from "@/offline/workspace-bridge";
import {
  MAINTENANCE_PRIORITY_TONE,
  MAINTENANCE_STATUS_TONE,
} from "./maintenance-shared";

const MAINTENANCE_PRIORITY_RANK: Record<MaintenancePriorityValue, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

type MaintenanceSortKey =
  "issue" | "location" | "priority" | "status" | "holdsFiles" | "logged";

const MAINTENANCE_SORT_COLUMNS: Record<
  MaintenanceSortKey,
  SortColumnDef<MaintenanceRequestDto>
> = {
  issue: { getValue: (req) => req.title },
  location: { getValue: (req) => req.roomNumber },
  priority: {
    getValue: (req) => MAINTENANCE_PRIORITY_RANK[req.priority],
    kind: "number",
    defaultDirection: "desc",
  },
  status: {
    getValue: (req) =>
      req.archivedAt
        ? `${MAINTENANCE_STATUS_LABELS[req.status]} Archived`
        : MAINTENANCE_STATUS_LABELS[req.status],
  },
  holdsFiles: {
    getValue: (req) => req.activeHolds.length * 1000 + req.attachments.length,
    kind: "number",
    defaultDirection: "desc",
  },
  logged: {
    getValue: (req) => req.createdAt,
    kind: "date",
    defaultDirection: "desc",
  },
};

function RefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16.25 10a6.25 6.25 0 1 1-1.6-4.18" />
      <path d="M16.5 3.5v3.25h-3.25" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
    </svg>
  );
}

function UrgentIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="m10.29 3.86-8.4 14.54A2 2 0 0 0 3.62 21h16.76a2 2 0 0 0 1.73-2.6l-8.4-14.54a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}

function HoldIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function PartsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function MaintenanceWorkspace({
  initialOverview,
  offlineMode = false,
  initialLastSyncedAt = null,
  initialSyncBadges = {},
}: {
  initialOverview: MaintenanceOverviewDto;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkArchivePending, setBulkArchivePending] = useState(false);
  const [bulkArchiveError, setBulkArchiveError] = useState<string | null>(null);
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [confirmRowAction, setConfirmRowAction] = useState<{
    req: MaintenanceRequestDto;
    kind: "resolve" | "archive" | "restore";
  } | null>(null);
  const [confirmRowError, setConfirmRowError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function applyVaultState(
    base: MaintenanceOverviewDto = serverOverview,
  ) {
    try {
      if (!offlineMode && navigator.onLine) {
        void cacheOfflinePoliciesMeta({
          proofMaxMb: base.proofMaxMb,
          proofMaxFilesPerRecord: base.proofMaxFilesPerRecord,
        });
      }

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
        const fromVault = await loadMaintenanceOverviewFromVault(db, key);
        setOverview(fromVault.overview);
        setSyncBadges(fromVault.syncBadges);
        setLastSyncedAt(fromVault.lastSyncedAt);
        return;
      }

      const [projections, outbox] = await Promise.all([
        listDecryptedProjections(db, key, ["maintenance_request"]),
        listActiveOutboxRecords(db),
      ]);
      const merged = mergeMaintenanceOverviewWithVaultOverlay({
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

  async function reloadMaintenance() {
    startRefresh(async () => {
      try {
        if (offlineMode || !navigator.onLine) {
          await applyVaultState(serverOverview);
          return;
        }
        await triggerForegroundSyncIfUnlocked();
        const res = await fetch("/api/maintenance", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Could not refresh maintenance requests.");
        }
        const next = (await res.json()) as MaintenanceOverviewDto;
        setServerOverview(next);
        await applyVaultState(next);
      } catch (error) {
        await applyVaultState(serverOverview);
        if (navigator.onLine) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not refresh maintenance requests.",
          );
        }
      }
    });
  }

  function handleResolveAttention(
    badge: OfflineEntitySyncBadge,
    action: "keep_mine" | "discard",
  ) {
    setErrorMessage(null);
    startRefresh(async () => {
      try {
        if (action === "keep_mine") {
          await resolveNeedsAttentionKeepMine(badge.opId);
          toast.info(
            navigator.onLine
              ? "Marked your repair draft to try saving again."
              : "Marked your repair draft to save once online.",
          );
        } else {
          await resolveNeedsAttentionDiscard(badge.opId);
          toast.success("Removed saved repair draft.");
        }
        await reloadMaintenance();
      } catch (error) {
        if (error instanceof OfflineVaultLockedError) {
          setUnlockPromptOpen(true);
        } else {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not resolve maintenance draft.",
          );
        }
      }
    });
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredRequests = overview.requests.filter((req) => {
    if (statusFilter === "ALL") {
      if (
        req.archivedAt !== null ||
        (req.status !== "OPEN" &&
          req.status !== "IN_PROGRESS" &&
          req.status !== "RESOLVED")
      ) {
        return false;
      }
    } else if (statusFilter === "ARCHIVED") {
      if (req.archivedAt === null) return false;
    } else if (req.archivedAt !== null || req.status !== statusFilter) {
      return false;
    }

    if (priorityFilter !== "ALL" && req.priority !== priorityFilter) {
      return false;
    }

    if (!normalizedQuery) return true;
    const haystack = [
      req.title,
      req.description,
      `room ${req.roomNumber}`,
      req.bedNumber ? `bed ${req.bedNumber}` : "whole room",
      MAINTENANCE_CATEGORY_LABELS[req.category],
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const hasActiveFilters =
    normalizedQuery !== "" ||
    statusFilter !== "ALL" ||
    priorityFilter !== "ALL";

  const {
    sortedRows: sortedRequests,
    sortHeaderProps,
    sort,
  } = useTableSort(filteredRequests, MAINTENANCE_SORT_COLUMNS, {
    key: "logged",
    direction: "desc",
  });

  const {
    paginatedRows: paginatedRequests,
    paginationProps: requestsPaginationProps,
  } = useTablePagination(sortedRequests, {
    resetKey: `${normalizedQuery}|${statusFilter}|${priorityFilter}|${sort?.key ?? ""}|${sort?.direction ?? ""}`,
  });

  const activeQueueCount =
    overview.totals.openCount + overview.totals.inProgressCount;
  const resolvedCount = overview.requests.filter(
    (req) => req.archivedAt === null && req.status === "RESOLVED",
  ).length;

  const viewingArchived = statusFilter === "ARCHIVED";
  const isRequestBulkEligible = (req: MaintenanceRequestDto) =>
    viewingArchived
      ? req.archivedAt !== null
      : req.archivedAt === null && req.activeHolds.length === 0;
  const eligibleRequests = filteredRequests.filter(isRequestBulkEligible);
  const selectedEligibleRequests = eligibleRequests.filter((req) =>
    selectedRequestIds.includes(req.id),
  );
  const pageEligibleRequests = paginatedRequests.filter(isRequestBulkEligible);
  const allPageRequestsSelected =
    pageEligibleRequests.length > 0 &&
    pageEligibleRequests.every((req) => selectedRequestIds.includes(req.id));

  function toggleRequestSelection(requestId: string) {
    setSelectedRequestIds((prev) =>
      prev.includes(requestId)
        ? prev.filter((id) => id !== requestId)
        : [...prev, requestId],
    );
  }

  function toggleAllPageRequests() {
    if (allPageRequestsSelected) {
      const pageIds = new Set(pageEligibleRequests.map((req) => req.id));
      setSelectedRequestIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const merged = new Set([
        ...selectedRequestIds,
        ...pageEligibleRequests.map((req) => req.id),
      ]);
      setSelectedRequestIds(Array.from(merged));
    }
  }

  async function executeBulkArchiveRequests() {
    if (selectedEligibleRequests.length === 0 || bulkArchivePending) return;
    setBulkArchivePending(true);
    setBulkArchiveError(null);
    try {
      const res = await bulkArchiveMaintenanceRequestsAction(
        selectedEligibleRequests.map((req) => ({
          requestId: req.id,
          expectedVersion: req.version,
        })),
        viewingArchived ? "restore" : "archive",
      );
      if (res.status === "saved") {
        setBulkArchiveOpen(false);
        setSelectedRequestIds([]);
        toast.success(res.message);
        await reloadMaintenance();
      } else if (res.status === "error") {
        setBulkArchiveError(res.message);
      }
    } finally {
      setBulkArchivePending(false);
    }
  }

  async function executeQuickInProgress(req: MaintenanceRequestDto) {
    if (rowPendingId) return;
    setErrorMessage(null);
    setRowPendingId(req.id);
    try {
      const res = await addMaintenanceUpdateAction({
        requestId: req.id,
        expectedVersion: req.version,
        statusTo: "IN_PROGRESS",
        note: "",
        attachmentIntentIds: [],
      });
      if (res.status === "saved") {
        toast.success("Marked request as in progress.");
        await reloadMaintenance();
      } else if (res.status === "error") {
        setErrorMessage(res.message);
      }
    } finally {
      setRowPendingId(null);
    }
  }

  async function executeConfirmRowAction() {
    if (!confirmRowAction || rowPendingId) return;
    const { req, kind } = confirmRowAction;
    setConfirmRowError(null);
    setRowPendingId(req.id);
    try {
      const res =
        kind === "resolve"
          ? await addMaintenanceUpdateAction({
              requestId: req.id,
              expectedVersion: req.version,
              statusTo: "RESOLVED",
              note: "",
              attachmentIntentIds: [],
            })
          : kind === "archive"
            ? await archiveMaintenanceRequestAction({
                requestId: req.id,
                expectedVersion: req.version,
              })
            : await restoreMaintenanceRequestAction({
                requestId: req.id,
                expectedVersion: req.version,
              });
      if (res.status === "saved") {
        setConfirmRowAction(null);
        toast.success(
          kind === "resolve" ? "Marked request as resolved." : res.message,
        );
        await reloadMaintenance();
      } else if (res.status === "error") {
        setConfirmRowError(res.message);
      }
    } finally {
      setRowPendingId(null);
    }
  }

  function formatRoomLabel(roomTitle: string) {
    return /^room\s/i.test(roomTitle) ? roomTitle : `Room ${roomTitle}`;
  }

  function getMaintenanceRowActions(
    req: MaintenanceRequestDto,
  ): RowActionItem[] {
    const isArchived = req.archivedAt !== null;
    const busy = rowPendingId === req.id;
    const badge = syncBadges[req.id];
    const hasNeedsAttention = badge && badge.status !== "pending";

    return [
      ...(hasNeedsAttention
        ? [
            {
              id: "keep-draft",
              label: "Keep draft",
              onSelect: () => handleResolveAttention(badge, "keep_mine"),
            },
            {
              id: "discard-draft",
              label: "Discard draft",
              tone: "danger" as const,
              onSelect: () => handleResolveAttention(badge, "discard"),
            },
          ]
        : []),
      {
        id: "manage",
        label: "Manage",
        href: `/maintenance/${req.id}`,
      },
      ...(!isArchived && req.status === "OPEN"
        ? [
            {
              id: "in-progress",
              label: isOfflineView
                ? "Mark in progress (online only)"
                : "Mark in progress",
              busy,
              disabled: isOfflineView || Boolean(rowPendingId),
              onSelect: () => {
                void executeQuickInProgress(req);
              },
            },
          ]
        : []),
      ...(!isArchived && req.status === "IN_PROGRESS"
        ? [
            {
              id: "resolve",
              label: isOfflineView
                ? "Mark resolved (online only)"
                : "Mark resolved",
              busy,
              disabled: isOfflineView || Boolean(rowPendingId),
              onSelect: () => {
                setConfirmRowError(null);
                setConfirmRowAction({ req, kind: "resolve" });
              },
            },
          ]
        : []),
      {
        id: isArchived ? "restore" : "archive",
        label: isArchived
          ? isOfflineView
            ? "Restore (online only)"
            : "Restore"
          : isOfflineView
            ? "Archive (online only)"
            : "Archive",
        tone: isArchived ? ("default" as const) : ("danger" as const),
        busy,
        disabled:
          isOfflineView ||
          Boolean(rowPendingId) ||
          (!isArchived && req.activeHolds.length > 0),
        onSelect: () => {
          setConfirmRowError(null);
          setConfirmRowAction({
            req,
            kind: isArchived ? "restore" : "archive",
          });
        },
      },
    ];
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Maintenance &amp; holds
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Track room repairs, attach photos, log updates, and lock unavailable
            rooms with maintenance holds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            onClick={() => reloadMaintenance()}
          >
            <RefreshIcon />
            Refresh
          </Button>
          {overview.rooms.length > 0 ? (
            <Link
              href="/maintenance/new"
              className={buttonClasses({ size: "md" })}
            >
              Log request
            </Link>
          ) : (
            <Button size="md" disabled>
              Log request
            </Button>
          )}
        </div>
      </header>

      <OfflineSnapshotBanner
        online={online}
        offlineMode={offlineMode}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        needsAttentionCount={needsAttentionCount}
        syncing={refreshing}
        onSyncNow={() => void reloadMaintenance()}
      />

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active repairs"
          value={activeQueueCount}
          description="Open or in progress"
          icon={<WrenchIcon />}
          tone={activeQueueCount > 0 ? "info" : "neutral"}
        />
        <MetricCard
          label="Urgent priority"
          value={overview.totals.urgentOpenCount}
          description="Needs attention right away"
          icon={<UrgentIcon />}
          tone={overview.totals.urgentOpenCount > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Resolved"
          value={resolvedCount}
          description="Completed repairs"
          icon={<PartsIcon />}
        />
        <MetricCard
          label="Active room holds"
          value={overview.totals.activeHoldsCount}
          description="Rooms blocked from new bookings"
          icon={<HoldIcon />}
          tone={overview.totals.activeHoldsCount > 0 ? "warning" : "neutral"}
        />
      </div>

      <SearchFilterBar
        aria-label="Find maintenance requests"
        updating={refreshing}
        hasActiveFilters={hasActiveFilters}
        onClearAll={() => {
          setSearchQuery("");
          setStatusFilter("ALL");
          setPriorityFilter("ALL");
          setSelectedRequestIds([]);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Field id="maint-search" label="Find a request">
              {({ id }) => (
                <SearchFilterInput
                  id={id}
                  placeholder="Issue, room title, or category"
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
              )}
            </Field>
          </div>

          <Field id="maint-filter-status" label="Status">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setSelectedRequestIds([]);
                }}
              >
                <option value="ALL">All requests</option>
                {MAINTENANCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {MAINTENANCE_STATUS_LABELS[status]}
                  </option>
                ))}
                <option value="ARCHIVED">Archived</option>
              </Select>
            )}
          </Field>

          <Field id="maint-filter-priority" label="Priority">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="ALL">All priorities</option>
                {MAINTENANCE_PRIORITIES.map((prio) => (
                  <option key={prio} value={prio}>
                    {MAINTENANCE_PRIORITY_LABELS[prio]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </SearchFilterBar>

      {filteredRequests.length === 0 ? (
        <EmptyState>
          <Image
            src="/illustrations/document-search.svg"
            alt=""
            width={160}
            height={112}
            className="h-28 w-auto"
          />
          <EmptyStateTitle>
            {overview.requests.length === 0
              ? "No maintenance requests yet"
              : "No matching requests"}
          </EmptyStateTitle>
          <EmptyStateDescription>
            {overview.requests.length === 0
              ? "Log your first room repair request to track updates, attachments, and room holds."
              : "Reset what you entered or broaden your status selections to inspect other requests."}
          </EmptyStateDescription>
          <EmptyStateActions>
            {hasActiveFilters ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("ALL");
                  setPriorityFilter("ALL");
                }}
              >
                Clear
              </Button>
            ) : (
              overview.rooms.length > 0 && (
                <Link
                  href="/maintenance/new"
                  className={buttonClasses({ size: "md" })}
                >
                  Log request
                </Link>
              )
            )}
          </EmptyStateActions>
        </EmptyState>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <TableCardHeader
            title="Maintenance requests"
            count={`${filteredRequests.length} ${filteredRequests.length === 1 ? "record" : "records"}`}
          />
          {selectedEligibleRequests.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent/40 px-4 py-2.5 sm:px-6">
              <span className="text-sm font-medium text-foreground">
                {selectedEligibleRequests.length}{" "}
                {selectedEligibleRequests.length === 1 ? "request" : "requests"}{" "}
                selected
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedRequestIds([])}
                  disabled={bulkArchivePending}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewingArchived ? "primary" : "danger"}
                  disabled={isOfflineView || bulkArchivePending}
                  onClick={() => {
                    setBulkArchiveError(null);
                    setBulkArchiveOpen(true);
                  }}
                >
                  {viewingArchived
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
          {/* 360px Mobile stacked cards */}
          <div className="grid divide-y divide-border md:hidden">
            {paginatedRequests.map((req) => {
              const eligible = isRequestBulkEligible(req);
              return (
                <div key={req.id} className="grid gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${req.title}`}
                        checked={
                          eligible && selectedRequestIds.includes(req.id)
                        }
                        disabled={
                          !eligible || isOfflineView || bulkArchivePending
                        }
                        title={
                          !eligible && !viewingArchived
                            ? "Release active maintenance holds before archiving."
                            : undefined
                        }
                        onChange={() => toggleRequestSelection(req.id)}
                        className="mt-1 size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <div className="grid min-w-0 gap-0.5">
                        <Link
                          href={`/maintenance/${req.id}`}
                          className="text-sm font-semibold text-foreground hover:text-primary"
                        >
                          {req.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatRoomLabel(req.roomNumber)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {MAINTENANCE_CATEGORY_LABELS[req.category]}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <OfflineSyncBadge badge={syncBadges[req.id]} />
                      <Badge tone={MAINTENANCE_STATUS_TONE[req.status]}>
                        {MAINTENANCE_STATUS_LABELS[req.status]}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={MAINTENANCE_PRIORITY_TONE[req.priority]}>
                      {MAINTENANCE_PRIORITY_LABELS[req.priority]}
                    </Badge>
                    {req.activeHolds.length > 0 && (
                      <Badge tone="warning">
                        {req.activeHolds.length} hold(s)
                      </Badge>
                    )}
                    {req.attachments.length > 0 && (
                      <Badge tone="neutral">
                        {req.attachments.length} file(s)
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5 text-xs">
                    <span className="text-muted-foreground tabular-nums">
                      {formatManilaDate(toManilaDate(new Date(req.createdAt)))}
                    </span>
                    <RowActionMenu
                      label={`Actions for ${req.title}`}
                      items={getMaintenanceRowActions(req)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label={
                        viewingArchived
                          ? "Select all archived requests on this page"
                          : "Select all eligible requests on this page"
                      }
                      checked={allPageRequestsSelected}
                      disabled={
                        isOfflineView ||
                        bulkArchivePending ||
                        pageEligibleRequests.length === 0
                      }
                      onChange={toggleAllPageRequests}
                      className="size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </TableHead>
                  <TableHead {...sortHeaderProps("logged")}>Issue</TableHead>
                  <TableHead {...sortHeaderProps("location")}>
                    Location
                  </TableHead>
                  <TableHead {...sortHeaderProps("priority")}>
                    Priority
                  </TableHead>
                  <TableHead {...sortHeaderProps("status")}>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRequests.map((req) => {
                  const eligible = isRequestBulkEligible(req);
                  const roomDetails = [
                    req.activeHolds.length > 0
                      ? `${req.activeHolds.length} active hold`
                      : null,
                    req.attachments.length > 0
                      ? `${req.attachments.length} ${req.attachments.length === 1 ? "file" : "files"}`
                      : null,
                  ].filter(Boolean);
                  return (
                    <TableRow key={req.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${req.title}`}
                          checked={
                            eligible && selectedRequestIds.includes(req.id)
                          }
                          disabled={
                            !eligible || isOfflineView || bulkArchivePending
                          }
                          title={
                            !eligible && !viewingArchived
                              ? "Release active maintenance holds before archiving."
                              : undefined
                          }
                          onChange={() => toggleRequestSelection(req.id)}
                          className="size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-0.5">
                          <Link
                            href={`/maintenance/${req.id}`}
                            className="font-medium text-foreground hover:text-primary"
                          >
                            {req.title}
                          </Link>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {MAINTENANCE_CATEGORY_LABELS[req.category]} ·{" "}
                            {formatManilaDate(
                              toManilaDate(new Date(req.createdAt)),
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-0.5">
                          <span>{formatRoomLabel(req.roomNumber)}</span>
                          {roomDetails.length > 0 && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {roomDetails.join(" · ")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone={MAINTENANCE_PRIORITY_TONE[req.priority]}>
                          {MAINTENANCE_PRIORITY_LABELS[req.priority]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone={MAINTENANCE_STATUS_TONE[req.status]}>
                            {MAINTENANCE_STATUS_LABELS[req.status]}
                          </Badge>
                          {req.archivedAt && (
                            <Badge tone="neutral">Archived</Badge>
                          )}
                          <OfflineSyncBadge badge={syncBadges[req.id]} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActionMenu
                          label={`Actions for ${req.title}`}
                          items={getMaintenanceRowActions(req)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            {...requestsPaginationProps}
            label="Maintenance requests table pagination"
          />
        </Card>
      )}

      <ConfirmDialog
        open={bulkArchiveOpen}
        onClose={() => {
          if (bulkArchivePending) return;
          setBulkArchiveError(null);
          setBulkArchiveOpen(false);
        }}
        onConfirm={() => {
          void executeBulkArchiveRequests();
        }}
        title={
          viewingArchived
            ? `Restore ${selectedEligibleRequests.length} ${selectedEligibleRequests.length === 1 ? "request" : "requests"}?`
            : `Archive ${selectedEligibleRequests.length} ${selectedEligibleRequests.length === 1 ? "request" : "requests"}?`
        }
        description={
          viewingArchived
            ? "Restoring returns the selected maintenance requests to active repair lists."
            : "Archiving moves the selected maintenance requests out of active lists. You can restore them anytime."
        }
        errorMessage={bulkArchiveError}
        confirmLabel={viewingArchived ? "Restore" : "Archive"}
        confirmVariant={viewingArchived ? "primary" : "danger"}
        loading={bulkArchivePending}
      />

      <ConfirmDialog
        open={confirmRowAction !== null}
        onClose={() => {
          if (rowPendingId) return;
          setConfirmRowError(null);
          setConfirmRowAction(null);
        }}
        onConfirm={() => {
          void executeConfirmRowAction();
        }}
        title={
          confirmRowAction
            ? confirmRowAction.kind === "resolve"
              ? `Mark "${confirmRowAction.req.title}" as resolved?`
              : confirmRowAction.kind === "archive"
                ? `Archive "${confirmRowAction.req.title}"?`
                : `Restore "${confirmRowAction.req.title}"?`
            : "Update request?"
        }
        description={
          confirmRowAction?.kind === "resolve"
            ? confirmRowAction.req.activeHolds.length > 0
              ? "Resolving this request will automatically release its active room hold(s)."
              : "This marks the maintenance request as completed."
            : confirmRowAction?.kind === "archive"
              ? "Archiving moves this maintenance request out of active repair lists. You can restore it anytime."
              : "Restoring returns this maintenance request to active repair lists."
        }
        errorMessage={confirmRowError}
        confirmLabel={
          confirmRowAction?.kind === "resolve"
            ? "Mark resolved"
            : confirmRowAction?.kind === "archive"
              ? "Archive"
              : "Restore"
        }
        confirmVariant={
          confirmRowAction?.kind === "archive" ? "danger" : "primary"
        }
        loading={
          confirmRowAction !== null && rowPendingId === confirmRowAction.req.id
        }
      />

      <OfflineVaultUnlockDialog
        open={unlockPromptOpen}
        onClose={() => setUnlockPromptOpen(false)}
        onUnlocked={() => reloadMaintenance()}
      />
    </div>
  );
}
