"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
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
  archiveTenantAction,
  bulkArchiveTenantsAction,
  restoreTenantAction,
} from "@/features/tenants/actions";
import type {
  TenantAssignmentDto,
  TenantDto,
  TenantListItemDto,
  TenantsOverviewDto,
} from "@/features/tenants/schemas";
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
import {
  loadTenantsOverviewFromVault,
  mergeTenantsOverviewWithVaultOverlay,
  type OfflineEntitySyncBadge,
} from "@/offline/snapshot-selectors";
import {
  DAISY_OFFLINE_VAULT_EVENT,
  getOfflineVaultClientState,
  OfflineVaultLockedError,
  resolveNeedsAttentionDiscard,
  resolveNeedsAttentionKeepMine,
  submitOfflineCapableMutation,
  triggerForegroundSyncIfUnlocked,
} from "@/offline/workspace-bridge";
import {
  AssignBedDialog,
  CreateTenantDialog,
  EditTenantDialog,
  MoveOutAssignmentDialog,
  TenantNotesDialog,
} from "./tenant-dialogs";

type TenantViewFilter = "all" | "occupied" | "unassigned" | "archived";

type TenantSortKey = "tenant" | "room" | "stayDates" | "monthlyRate" | "status";

const TENANT_SORT_COLUMNS: Record<
  TenantSortKey,
  SortColumnDef<TenantListItemDto>
> = {
  tenant: { getValue: (tenant) => tenant.fullName },
  room: { getValue: (tenant) => tenant.activeAssignment?.roomNumber ?? null },
  stayDates: {
    getValue: (tenant) => tenant.activeAssignment?.startDateManila ?? null,
    kind: "date",
    defaultDirection: "desc",
  },
  monthlyRate: {
    getValue: (tenant) => tenant.activeAssignment?.monthlyRate ?? null,
    kind: "money",
    defaultDirection: "desc",
  },
  status: {
    getValue: (tenant) =>
      tenant.archivedAt !== null
        ? "Archived"
        : tenant.activeAssignment
          ? "Active stay"
          : "Unassigned",
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

export function TenantsWorkspace({
  initialOverview,
  offlineMode = false,
  initialLastSyncedAt = null,
  initialSyncBadges = {},
}: {
  initialOverview: TenantsOverviewDto;
  offlineMode?: boolean;
  initialLastSyncedAt?: string | null;
  initialSyncBadges?: Record<string, OfflineEntitySyncBadge>;
}) {
  const online = useBrowserOnline();
  const isOfflineView = offlineMode || !online;
  const [prevInitialOverview, setPrevInitialOverview] =
    useState<TenantsOverviewDto>(initialOverview);
  const [serverOverview, setServerOverview] =
    useState<TenantsOverviewDto>(initialOverview);
  const [overview, setOverview] = useState<TenantsOverviewDto>(initialOverview);
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
  const [viewFilter, setViewFilter] = useState<TenantViewFilter>("all");
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkArchivePending, setBulkArchivePending] = useState(false);
  const [bulkArchiveError, setBulkArchiveError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantDto | null>(null);
  const [notesTenantId, setNotesTenantId] = useState<string | null>(null);
  const notesTenant =
    overview.tenants.find((tenant) => tenant.id === notesTenantId) ?? null;
  const [assigningTenant, setAssigningTenant] = useState<TenantDto | null>(
    null,
  );
  const [movingOutTarget, setMovingOutTarget] = useState<{
    assignment: TenantAssignmentDto;
    tenantName: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [confirmingTenant, setConfirmingTenant] =
    useState<TenantListItemDto | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "warning" | "danger";
    message: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  async function handleDialogSaved(
    message: string,
    tone: SavedFeedbackTone = "success",
  ) {
    if (tone === "warning") {
      setFeedback({ tone: "warning", message });
      toast.warning(message);
    } else {
      notifySaved(message, tone);
    }
    await reloadTenants();
  }

  async function applyVaultState(base: TenantsOverviewDto = serverOverview) {
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
        const fromVault = await loadTenantsOverviewFromVault(db, key);
        setOverview(fromVault.overview);
        setSyncBadges(fromVault.syncBadges);
        setLastSyncedAt(fromVault.lastSyncedAt);
        return;
      }

      const [projections, outbox] = await Promise.all([
        listDecryptedProjections(db, key, ["tenant"]),
        listActiveOutboxRecords(db),
      ]);
      const merged = mergeTenantsOverviewWithVaultOverlay({
        baseOverview: base,
        projections,
        outbox,
      });
      setOverview(merged.overview);
      setSyncBadges(merged.syncBadges);
    } catch {
      // Ignore vault inspection failures in restricted browser environments.
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

  async function reloadTenants() {
    setRefreshing(true);
    try {
      if (offlineMode || !navigator.onLine) {
        await applyVaultState(serverOverview);
        return;
      }

      await triggerForegroundSyncIfUnlocked();
      const response = await fetch("/api/tenants", { cache: "no-store" });
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: "Could not refresh tenant directory right now.",
        });
        return;
      }
      const fresh = (await response.json()) as TenantsOverviewDto;
      setServerOverview(fresh);
      await applyVaultState(fresh);
    } catch {
      await applyVaultState(serverOverview);
      if (navigator.onLine) {
        setFeedback({
          tone: "danger",
          message: "Could not reach the server; showing local data.",
        });
      }
    } finally {
      setRefreshing(false);
    }
  }

  function handleArchiveRestore(tenant: TenantListItemDto) {
    if (rowPendingId) return;
    setFeedback(null);
    setConfirmError(null);
    setRowPendingId(tenant.id);
    startTransition(async () => {
      try {
        const vault = await getOfflineVaultClientState();
        const useOfflineBridge =
          offlineMode ||
          !vault.online ||
          (vault.vaultUnlocked && Boolean(vault.deviceId));

        if (useOfflineBridge) {
          const isArchiving = tenant.archivedAt === null;
          const nowIso = new Date().toISOString();
          try {
            const res = await submitOfflineCapableMutation({
              type: isArchiving ? "tenant.archive" : "tenant.restore",
              entityId: tenant.id,
              baseVersion: tenant.version,
              payload: {},
              projectionPayload: {
                ...tenant,
                archivedAt: isArchiving ? nowIso : null,
                updatedAt: nowIso,
              },
              syncedMessage: isArchiving
                ? "Tenant archived."
                : "Tenant restored.",
              queuedMessage: isArchiving
                ? "Archive saved on this device (waiting to go online)."
                : "Restore saved on this device (waiting to go online).",
            });
            setConfirmingTenant(null);
            if (res.delivery === "needs_attention") {
              const warningText = `Saved in Needs attention: ${res.reason}`;
              setFeedback({
                tone: "warning",
                message: warningText,
              });
              toast.warning(warningText);
            } else if (res.delivery === "queued") {
              toast.info(res.message);
            } else {
              toast.success(res.message);
            }
            await reloadTenants();
          } catch (error) {
            if (error instanceof OfflineVaultLockedError) {
              setConfirmingTenant(null);
              setUnlockPromptOpen(true);
            } else {
              setConfirmError(
                error instanceof Error
                  ? error.message
                  : "Could not update tenant offline.",
              );
            }
          }
          return;
        }

        const res =
          tenant.archivedAt === null
            ? await archiveTenantAction({
                tenantId: tenant.id,
                expectedVersion: tenant.version,
              })
            : await restoreTenantAction({
                tenantId: tenant.id,
                expectedVersion: tenant.version,
              });
        if (res.status === "saved") {
          setConfirmingTenant(null);
          toast.success(res.message);
          await reloadTenants();
        } else if (res.status === "error") {
          setConfirmError(res.message);
        }
      } finally {
        setRowPendingId(null);
      }
    });
  }

  function handleResolveAttention(
    badge: OfflineEntitySyncBadge,
    action: "keep_mine" | "discard",
  ) {
    setFeedback(null);
    startTransition(async () => {
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
        await reloadTenants();
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

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredTenants = overview.tenants.filter((tenant) => {
    const isArchived = tenant.archivedAt !== null;
    if (viewFilter === "all" && isArchived) return false;
    if (viewFilter === "archived" && !isArchived) return false;
    if (viewFilter === "occupied" && (isArchived || !tenant.activeAssignment)) {
      return false;
    }
    if (
      viewFilter === "unassigned" &&
      (isArchived || tenant.activeAssignment)
    ) {
      return false;
    }

    if (!normalizedQuery) return true;
    const haystack = [
      tenant.fullName,
      tenant.phone ?? "",
      tenant.email ?? "",
      tenant.address ?? "",
      tenant.activeAssignment
        ? `room ${tenant.activeAssignment.roomNumber} bed ${tenant.activeAssignment.bedNumber}`
        : "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const activeCount = overview.tenants.filter(
    (t) => t.archivedAt === null,
  ).length;
  const assignedCount = overview.tenants.filter(
    (t) => t.archivedAt === null && t.activeAssignment !== null,
  ).length;
  const unassignedCount = activeCount - assignedCount;
  const archivedCount = overview.tenants.length - activeCount;

  const hasFilters = normalizedQuery !== "" || viewFilter !== "all";

  const {
    sortedRows: sortedTenants,
    sort,
    sortHeaderProps,
  } = useTableSort(filteredTenants, TENANT_SORT_COLUMNS, {
    key: "tenant",
    direction: "asc",
  });

  const { paginatedRows: paginatedTenants, paginationProps } =
    useTablePagination(sortedTenants, {
      resetKey: `${normalizedQuery}|${viewFilter}|${sort?.key ?? ""}|${sort?.direction ?? ""}`,
    });

  const viewingArchived = viewFilter === "archived";
  const isTenantBulkEligible = (tenant: TenantListItemDto) =>
    viewingArchived
      ? tenant.archivedAt !== null
      : tenant.archivedAt === null && tenant.activeAssignment === null;
  const eligibleTenants = filteredTenants.filter(isTenantBulkEligible);
  const selectedEligibleTenants = eligibleTenants.filter((tenant) =>
    selectedTenantIds.includes(tenant.id),
  );
  const pageEligibleTenants = paginatedTenants.filter(isTenantBulkEligible);
  const allPageTenantsSelected =
    pageEligibleTenants.length > 0 &&
    pageEligibleTenants.every((tenant) =>
      selectedTenantIds.includes(tenant.id),
    );

  function toggleTenantSelection(tenantId: string) {
    setSelectedTenantIds((prev) =>
      prev.includes(tenantId)
        ? prev.filter((id) => id !== tenantId)
        : [...prev, tenantId],
    );
  }

  function toggleAllPageTenants() {
    if (allPageTenantsSelected) {
      const pageIds = new Set(pageEligibleTenants.map((tenant) => tenant.id));
      setSelectedTenantIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const merged = new Set([
        ...selectedTenantIds,
        ...pageEligibleTenants.map((tenant) => tenant.id),
      ]);
      setSelectedTenantIds(Array.from(merged));
    }
  }

  async function executeBulkArchiveTenants() {
    if (selectedEligibleTenants.length === 0 || bulkArchivePending) return;
    setBulkArchivePending(true);
    setBulkArchiveError(null);
    try {
      const res = await bulkArchiveTenantsAction(
        selectedEligibleTenants.map((tenant) => ({
          tenantId: tenant.id,
          expectedVersion: tenant.version,
        })),
        viewingArchived ? "restore" : "archive",
      );
      if (res.status === "saved") {
        setBulkArchiveOpen(false);
        setSelectedTenantIds([]);
        toast.success(res.message);
        await reloadTenants();
      } else if (res.status === "error") {
        setBulkArchiveError(res.message);
      }
    } finally {
      setBulkArchivePending(false);
    }
  }

  function getTenantRowActions(
    tenant: TenantListItemDto,
    isArchived: boolean,
    busy: boolean,
  ): RowActionItem[] {
    const assignment = tenant.activeAssignment;
    const syncBadge = syncBadges[tenant.id];
    const hasNeedsAttention = syncBadge && syncBadge.status !== "pending";

    return [
      ...(hasNeedsAttention
        ? [
            {
              id: "keep-mine",
              label: "Keep local draft",
              onSelect: () => handleResolveAttention(syncBadge, "keep_mine"),
            },
            {
              id: "discard-local",
              label: "Discard draft",
              tone: "danger" as const,
              onSelect: () => handleResolveAttention(syncBadge, "discard"),
            },
          ]
        : []),
      ...(!isArchived && !assignment
        ? [
            {
              id: "assign",
              label: isOfflineView
                ? "Assign room (online only)"
                : "Assign room",
              disabled: isOfflineView,
              onSelect: () => setAssigningTenant(tenant),
            },
          ]
        : []),
      ...(!isArchived && assignment
        ? [
            {
              id: "move-out",
              label: isOfflineView ? "Move out (online only)" : "Move out",
              disabled: isOfflineView,
              onSelect: () =>
                setMovingOutTarget({
                  assignment,
                  tenantName: tenant.fullName,
                }),
            },
          ]
        : []),
      {
        id: "profile",
        label: "View profile",
        href: `/tenants/${tenant.id}`,
      },
      {
        id: "notes",
        label: "Notes",
        ...(tenant.tenantNotes.length > 0
          ? { badge: tenant.tenantNotes.length }
          : {}),
        disabled: isOfflineView,
        onSelect: () => setNotesTenantId(tenant.id),
      },
      ...(!isArchived
        ? [
            {
              id: "edit",
              label: "Edit",
              onSelect: () => setEditingTenant(tenant),
            },
          ]
        : []),
      {
        id: isArchived ? "restore" : "archive",
        label: isArchived ? "Restore" : "Archive",
        tone: isArchived ? ("default" as const) : ("danger" as const),
        busy,
        disabled: !isArchived && Boolean(assignment),
        onSelect: () => {
          setConfirmError(null);
          setConfirmingTenant(tenant);
        },
      },
    ];
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Tenants
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage boarder profiles, room move-ins, and move-out history across
            your boarding house.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            onClick={() => void reloadTenants()}
          >
            {!refreshing && <RefreshIcon />}
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>
          <Button size="md" onClick={() => setCreateOpen(true)}>
            Add tenant
          </Button>
        </div>
      </header>

      <OfflineSnapshotBanner
        online={online}
        offlineMode={offlineMode}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        needsAttentionCount={needsAttentionCount}
        syncing={refreshing}
        onSyncNow={() => void reloadTenants()}
      />

      {feedback && (
        <Alert
          tone={feedback.tone}
          role={feedback.tone === "danger" ? "alert" : "status"}
        >
          {feedback.message}
        </Alert>
      )}

      <section
        aria-label="Tenant summary"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="Active tenants"
          value={activeCount}
          description="Current tenants on the active roster"
          icon={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="7" r="2.75" />
              <path d="M3.25 16a4.75 4.75 0 0 1 9.5 0" />
              <circle cx="14.25" cy="8" r="2" />
              <path d="M13.5 16h3.5a3 3 0 0 0-2.75-3" />
            </svg>
          }
        />
        <MetricCard
          label="Assigned a room"
          value={assignedCount}
          tone="info"
          description="Tenants with an active room assignment"
          icon={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="7" r="2.75" />
              <path d="M3 16a5 5 0 0 1 9.2-2.7" />
              <path d="m12.75 13.75 1.5 1.5 3-3" />
            </svg>
          }
        />
        <MetricCard
          label="Unassigned"
          value={unassignedCount}
          description="Active profiles awaiting room placement"
          icon={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8.5" cy="7" r="2.75" />
              <path d="M3.5 16a5 5 0 0 1 8.5-3.5" />
              <path d="M14.5 11.5v4" />
              <path d="M12.5 13.5h4" />
            </svg>
          }
        />
        <MetricCard
          label="Archived records"
          value={archivedCount}
          tone="muted"
          description="Moved-out or inactive tenant records"
          icon={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="14" height="3.25" rx="0.75" />
              <path d="M4.25 7.25v8a1 1 0 0 0 1 1h9.5a1 1 0 0 0 1-1v-8" />
              <path d="M8.25 10.75h3.5" />
            </svg>
          }
        />
      </section>

      <SearchFilterBar
        aria-label="Find tenants"
        hasActiveFilters={hasFilters}
        onClearAll={() => {
          setSearchQuery("");
          setViewFilter("all");
          setSelectedTenantIds([]);
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field
            id="tenants-search"
            label="Find a tenant"
            className="md:col-span-2"
          >
            {({ id }) => (
              <SearchFilterInput
                id={id}
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="Name, phone, email, or room title"
              />
            )}
          </Field>

          <Field id="tenants-view-filter" label="Status view">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={viewFilter}
                onChange={(e) => {
                  setViewFilter(e.target.value as TenantViewFilter);
                  setSelectedTenantIds([]);
                }}
              >
                <option value="all">All records</option>
                <option value="occupied">Assigned a room</option>
                <option value="unassigned">Unassigned only</option>
                <option value="archived">Archived tenants</option>
              </Select>
            )}
          </Field>
        </div>
      </SearchFilterBar>

      {filteredTenants.length === 0 ? (
        <EmptyState>
          <Image
            src={
              overview.tenants.length === 0
                ? "/illustrations/sweet-home.svg"
                : "/illustrations/document-search.svg"
            }
            alt=""
            width={176}
            height={128}
            className="h-28 w-auto"
          />
          <div className="grid gap-1.5">
            <EmptyStateTitle>
              {overview.tenants.length === 0
                ? "No tenants recorded yet"
                : "No matching tenants"}
            </EmptyStateTitle>
            <EmptyStateDescription>
              {overview.tenants.length === 0
                ? "Add a boarder profile to assign a room, track move-in dates, and calculate balances."
                : "Try changing the status view or finding a different name or room title."}
            </EmptyStateDescription>
          </div>
          <EmptyStateActions>
            {overview.tenants.length === 0 ? (
              <Button onClick={() => setCreateOpen(true)}>Add tenant</Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchQuery("");
                  setViewFilter("all");
                  setSelectedTenantIds([]);
                }}
              >
                Clear
              </Button>
            )}
          </EmptyStateActions>
        </EmptyState>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6 sm:py-3.5">
            <h2 className="text-sm font-semibold text-foreground">
              Tenant directory
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filteredTenants.length}{" "}
              {filteredTenants.length === 1 ? "record" : "records"}
            </span>
          </div>

          {selectedEligibleTenants.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent/40 px-4 py-2.5 sm:px-6">
              <span className="text-sm font-medium text-foreground">
                {selectedEligibleTenants.length}{" "}
                {selectedEligibleTenants.length === 1 ? "tenant" : "tenants"}{" "}
                selected
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedTenantIds([])}
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

          {/* Mobile card layout (360 px baseline) */}
          <div className="grid divide-y divide-border md:hidden">
            {paginatedTenants.map((tenant) => {
              const assignment = tenant.activeAssignment;
              const isArchived = tenant.archivedAt !== null;
              const busy = rowPendingId === tenant.id;
              const eligible = isTenantBulkEligible(tenant);
              return (
                <div key={tenant.id} className="grid gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${tenant.fullName}`}
                        checked={
                          eligible && selectedTenantIds.includes(tenant.id)
                        }
                        disabled={
                          !eligible || isOfflineView || bulkArchivePending
                        }
                        title={
                          !eligible && !viewingArchived
                            ? "Move out tenant before archiving."
                            : undefined
                        }
                        onChange={() => toggleTenantSelection(tenant.id)}
                        className="mt-1 size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <div className="grid gap-0.5">
                        <Link
                          href={`/tenants/${tenant.id}`}
                          className="text-sm font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          {tenant.fullName}
                        </Link>
                        {(tenant.phone || tenant.email) && (
                          <div className="grid gap-0.5 text-xs text-muted-foreground">
                            {tenant.phone && <span>{tenant.phone}</span>}
                            {tenant.email && <span>{tenant.email}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <OfflineSyncBadge badge={syncBadges[tenant.id]} />
                      {isArchived ? (
                        <Badge tone="neutral">Archived</Badge>
                      ) : assignment ? (
                        <Badge tone="info">Room {assignment.roomNumber}</Badge>
                      ) : (
                        <Badge tone="warning">Unassigned</Badge>
                      )}
                    </div>
                  </div>

                  {assignment && (
                    <div className="grid gap-0.5 text-xs text-muted-foreground tabular-nums">
                      <span>
                        {formatManilaDate(assignment.startDateManila)} –{" "}
                        {formatManilaDate(assignment.endDateManila)}
                      </span>
                      <span>
                        {formatPhpCurrency(assignment.monthlyRate)}/mo
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                    <span className="text-xs text-muted-foreground">
                      Actions
                    </span>
                    <RowActionMenu
                      label={`Actions for ${tenant.fullName}`}
                      items={getTenantRowActions(tenant, isArchived, busy)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop data table */}
          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label={
                        viewingArchived
                          ? "Select all archived tenants on this page"
                          : "Select all unassigned tenants on this page"
                      }
                      checked={allPageTenantsSelected}
                      disabled={
                        isOfflineView ||
                        bulkArchivePending ||
                        pageEligibleTenants.length === 0
                      }
                      onChange={toggleAllPageTenants}
                      className="size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </TableHead>
                  <TableHead {...sortHeaderProps("tenant")}>Tenant</TableHead>
                  <TableHead {...sortHeaderProps("room")}>Room</TableHead>
                  <TableHead {...sortHeaderProps("stayDates")}>
                    Stay dates
                  </TableHead>
                  <TableHead numeric {...sortHeaderProps("monthlyRate")}>
                    Monthly rate
                  </TableHead>
                  <TableHead {...sortHeaderProps("status")}>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTenants.map((tenant) => {
                  const assignment = tenant.activeAssignment;
                  const isArchived = tenant.archivedAt !== null;
                  const busy = rowPendingId === tenant.id;
                  const eligible = isTenantBulkEligible(tenant);
                  return (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${tenant.fullName}`}
                          checked={
                            eligible && selectedTenantIds.includes(tenant.id)
                          }
                          disabled={
                            !eligible || isOfflineView || bulkArchivePending
                          }
                          title={
                            !eligible && !viewingArchived
                              ? "Move out tenant before archiving."
                              : undefined
                          }
                          onChange={() => toggleTenantSelection(tenant.id)}
                          className="size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/tenants/${tenant.id}`}
                          className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          {tenant.fullName}
                        </Link>
                        {(tenant.phone || tenant.email) && (
                          <div className="mt-0.5 grid gap-0.5 text-xs text-muted-foreground">
                            {tenant.phone && <span>{tenant.phone}</span>}
                            {tenant.email && <span>{tenant.email}</span>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {assignment ? (
                          <div className="font-medium">
                            Room {assignment.roomNumber}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {assignment
                          ? `${formatManilaDate(assignment.startDateManila)} – ${formatManilaDate(assignment.endDateManila)}`
                          : "No active stay"}
                      </TableCell>
                      <TableCell numeric>
                        {assignment
                          ? formatPhpCurrency(assignment.monthlyRate)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isArchived ? (
                            <Badge tone="neutral">Archived</Badge>
                          ) : assignment ? (
                            <Badge tone="info">Active stay</Badge>
                          ) : (
                            <Badge tone="warning">Unassigned</Badge>
                          )}
                          <OfflineSyncBadge badge={syncBadges[tenant.id]} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActionMenu
                          label={`Actions for ${tenant.fullName}`}
                          items={getTenantRowActions(tenant, isArchived, busy)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            {...paginationProps}
            label="Tenants table pagination"
          />
        </Card>
      )}

      <CreateTenantDialog
        open={createOpen}
        offlineMode={offlineMode}
        onClose={() => setCreateOpen(false)}
        onRequireVaultUnlock={() => setUnlockPromptOpen(true)}
        onSaved={handleDialogSaved}
      />

      <EditTenantDialog
        tenant={editingTenant}
        offlineMode={offlineMode}
        onClose={() => setEditingTenant(null)}
        onRequireVaultUnlock={() => setUnlockPromptOpen(true)}
        onSaved={handleDialogSaved}
      />

      <AssignBedDialog
        tenant={assigningTenant}
        beds={overview.assignableBeds}
        onClose={() => setAssigningTenant(null)}
        onSaved={handleDialogSaved}
      />

      <MoveOutAssignmentDialog
        assignment={movingOutTarget?.assignment ?? null}
        tenantName={movingOutTarget?.tenantName ?? "tenant"}
        onClose={() => setMovingOutTarget(null)}
        onSaved={handleDialogSaved}
      />

      <TenantNotesDialog
        tenant={notesTenant}
        notes={notesTenant?.tenantNotes ?? []}
        onClose={() => setNotesTenantId(null)}
        onNotesChanged={reloadTenants}
      />
      <ConfirmDialog
        open={confirmingTenant !== null}
        onClose={() => {
          if (rowPendingId) return;
          setConfirmError(null);
          setConfirmingTenant(null);
        }}
        onConfirm={() => {
          if (confirmingTenant) handleArchiveRestore(confirmingTenant);
        }}
        title={
          confirmingTenant
            ? confirmingTenant.archivedAt === null
              ? `Archive ${confirmingTenant.fullName}?`
              : `Restore ${confirmingTenant.fullName}?`
            : "Update tenant?"
        }
        description={
          confirmingTenant?.archivedAt === null
            ? "Archiving moves this tenant out of active boarder lists. You can restore the profile anytime."
            : "Restoring returns this tenant profile to active boarder lists."
        }
        errorMessage={confirmError}
        confirmLabel={
          confirmingTenant?.archivedAt === null ? "Archive" : "Restore"
        }
        confirmVariant={
          confirmingTenant?.archivedAt === null ? "danger" : "primary"
        }
        loading={
          confirmingTenant !== null && rowPendingId === confirmingTenant.id
        }
      />

      <ConfirmDialog
        open={bulkArchiveOpen}
        onClose={() => {
          if (bulkArchivePending) return;
          setBulkArchiveError(null);
          setBulkArchiveOpen(false);
        }}
        onConfirm={() => {
          void executeBulkArchiveTenants();
        }}
        title={
          viewingArchived
            ? `Restore ${selectedEligibleTenants.length} ${selectedEligibleTenants.length === 1 ? "tenant" : "tenants"}?`
            : `Archive ${selectedEligibleTenants.length} ${selectedEligibleTenants.length === 1 ? "tenant" : "tenants"}?`
        }
        description={
          viewingArchived
            ? "Restoring returns the selected tenant profiles to active boarder lists."
            : "Archiving moves the selected unassigned tenants out of active boarder lists. You can restore them anytime."
        }
        errorMessage={bulkArchiveError}
        confirmLabel={viewingArchived ? "Restore" : "Archive"}
        confirmVariant={viewingArchived ? "primary" : "danger"}
        loading={bulkArchivePending}
      />

      <OfflineVaultUnlockDialog
        open={unlockPromptOpen}
        onClose={() => setUnlockPromptOpen(false)}
        onUnlocked={() => reloadTenants()}
      />
    </div>
  );
}
