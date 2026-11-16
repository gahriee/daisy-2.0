"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  OfflineSnapshotBanner,
  useOfflineSnapshotState,
} from "@/components/features/offline/offline-vault-unlock";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  archiveNoticeAction,
  restoreNoticeAction,
} from "@/features/notices/actions";
import {
  NOTICE_AUDIENCE_LABELS,
  NOTICE_AUDIENCES,
  NOTICE_LIFECYCLE_LABELS,
  NOTICE_LIFECYCLE_STATUSES,
  type NoticeDto,
  type NoticeOverviewDto,
} from "@/features/notices/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatManilaDate } from "@/lib/dates";
import type { SortColumnDef } from "@/lib/table-sort";
import { loadNoticesOverviewFromVault } from "@/offline/snapshot-selectors-extra";
import { NOTICE_LIFECYCLE_TONE, NoticeFormDialog } from "./notice-dialogs";

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

function ActiveNoticeIcon() {
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
      <path d="M3 11v2a2 2 0 0 0 2 2h3l6 4V5l-6 4H5a2 2 0 0 0-2 2Z" />
      <path d="M18.5 9.5a4.5 4.5 0 0 1 0 5" />
    </svg>
  );
}

function ScheduledIcon() {
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
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function ExpiredIcon() {
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

function ArchiveIcon() {
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
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 13h4" />
    </svg>
  );
}

function formatAudienceTarget(notice: NoticeDto): string {
  if (notice.audience === "ROOM") {
    return notice.roomNumber ? `Room ${notice.roomNumber}` : "Specific room";
  }
  if (notice.audience === "TENANT") {
    return notice.tenantName ?? "Specific tenant";
  }
  return "Everyone";
}

type NoticeSortKey = "title" | "audience" | "dates" | "status";

const NOTICE_SORT_COLUMNS: Record<NoticeSortKey, SortColumnDef<NoticeDto>> = {
  title: { getValue: (notice) => notice.title },
  audience: {
    getValue: (notice) =>
      notice.audience === "EVERYONE"
        ? "Everyone"
        : `${NOTICE_AUDIENCE_LABELS[notice.audience]} ${formatAudienceTarget(notice)}`,
  },
  dates: {
    getValue: (notice) => notice.startDateManila,
    kind: "date",
    defaultDirection: "desc",
  },
  status: { getValue: (notice) => notice.lifecycleStatus },
};

export function NoticesWorkspace({
  initialOverview,
  offlineMode = false,
  initialLastSyncedAt = null,
}: {
  initialOverview: NoticeOverviewDto;
  offlineMode?: boolean;
  initialLastSyncedAt?: string | null;
}) {
  const {
    data: overview,
    online,
    isOfflineView,
    lastSyncedAt,
    pendingCount,
    needsAttentionCount,
    reload,
  } = useOfflineSnapshotState<NoticeOverviewDto>({
    initialData: initialOverview,
    offlineMode,
    initialLastSyncedAt,
    loadFromVault: async (db, key) => {
      const res = await loadNoticesOverviewFromVault(db, key);
      return { data: res.overview, lastSyncedAt: res.lastSyncedAt };
    },
    fetchOnline: async () => {
      const res = await fetch("/api/notices", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Could not refresh notices.");
      }
      return (await res.json()) as NoticeOverviewDto;
    },
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("CURRENT");
  const [audienceFilter, setAudienceFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<NoticeDto | null>(null);
  const [dialogSessionKey, setDialogSessionKey] = useState(0);
  const [busyNoticeId, setBusyNoticeId] = useState<string | null>(null);
  const [confirmingNotice, setConfirmingNotice] = useState<NoticeDto | null>(
    null,
  );
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function reloadNotices() {
    startRefresh(async () => {
      try {
        await reload();
      } catch (error) {
        setFeedback({
          tone: "danger",
          message:
            error instanceof Error
              ? error.message
              : "Could not refresh notices.",
        });
      }
    });
  }

  function handleArchiveToggle(notice: NoticeDto) {
    setBusyNoticeId(notice.id);
    setFeedback(null);
    setConfirmError(null);
    startRefresh(async () => {
      try {
        const result = notice.archivedAt
          ? await restoreNoticeAction({
              noticeId: notice.id,
              expectedVersion: notice.version,
            })
          : await archiveNoticeAction({
              noticeId: notice.id,
              expectedVersion: notice.version,
            });
        if (result.status === "error") {
          setConfirmError(result.message);
        } else if (result.status === "saved") {
          setConfirmingNotice(null);
          setFeedback({ tone: "success", message: result.message });
          await reloadNotices();
        }
      } finally {
        setBusyNoticeId(null);
      }
    });
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredNotices = overview.notices.filter((notice) => {
    if (statusFilter === "CURRENT") {
      if (notice.archivedAt !== null) return false;
    } else if (statusFilter !== "ALL") {
      if (notice.lifecycleStatus !== statusFilter) return false;
    }

    if (audienceFilter !== "ALL" && notice.audience !== audienceFilter) {
      return false;
    }

    if (!normalizedQuery) return true;
    const haystack = [
      notice.title,
      notice.body,
      formatAudienceTarget(notice),
      notice.startDateManila,
      notice.endDateManila,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const {
    sortedRows: sortedNotices,
    sortHeaderProps,
    sort,
  } = useTableSort(filteredNotices, NOTICE_SORT_COLUMNS, {
    key: "dates",
    direction: "desc",
  });

  const {
    paginatedRows: paginatedNotices,
    paginationProps: noticesPaginationProps,
  } = useTablePagination(sortedNotices, {
    resetKey: `${normalizedQuery}|${statusFilter}|${audienceFilter}|${sort?.key ?? ""}|${sort?.direction ?? ""}`,
  });

  const hasActiveFilters =
    normalizedQuery !== "" ||
    statusFilter !== "CURRENT" ||
    audienceFilter !== "ALL";

  function getNoticeRowActions(notice: NoticeDto): RowActionItem[] {
    return [
      ...(!notice.archivedAt
        ? [
            {
              id: "edit",
              label: isOfflineView ? "Edit (online only)" : "Edit",
              disabled: isOfflineView,
              onSelect: () => {
                setEditingNotice(notice);
                setDialogSessionKey((k) => k + 1);
                setDialogOpen(true);
              },
            },
          ]
        : []),
      {
        id: notice.archivedAt ? "restore" : "archive",
        label: notice.archivedAt
          ? isOfflineView
            ? "Restore (online only)"
            : "Restore"
          : isOfflineView
            ? "Archive (online only)"
            : "Archive",
        tone: notice.archivedAt ? ("default" as const) : ("danger" as const),
        busy: busyNoticeId === notice.id,
        disabled: isOfflineView,
        onSelect: () => {
          setConfirmError(null);
          setConfirmingNotice(notice);
        },
      },
    ];
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Notices &amp; announcements
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Publish property-wide, room, or individual tenant notices with
            effective date ranges.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            onClick={reloadNotices}
          >
            <RefreshIcon />
            Refresh
          </Button>
          <Button
            size="md"
            disabled={isOfflineView}
            onClick={() => {
              setEditingNotice(null);
              setDialogSessionKey((k) => k + 1);
              setDialogOpen(true);
            }}
          >
            {isOfflineView ? "New notice (online only)" : "New notice"}
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
        onSyncNow={reloadNotices}
      />

      {feedback && (
        <Alert
          tone={feedback.tone === "success" ? "success" : "danger"}
          role={feedback.tone === "success" ? "status" : "alert"}
        >
          {feedback.message}
        </Alert>
      )}

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active today"
          value={overview.totals.activeCount}
          description={`Visible on ${formatManilaDate(overview.todayManila)}`}
          icon={<ActiveNoticeIcon />}
          tone={overview.totals.activeCount > 0 ? "success" : "neutral"}
        />
        <MetricCard
          label="Scheduled"
          value={overview.totals.scheduledCount}
          description="Upcoming start date"
          icon={<ScheduledIcon />}
          tone={overview.totals.scheduledCount > 0 ? "info" : "neutral"}
        />
        <MetricCard
          label="Expired"
          value={overview.totals.expiredCount}
          description="Past visible window"
          icon={<ExpiredIcon />}
        />
        <MetricCard
          label="Archived"
          value={overview.totals.archivedCount}
          description="Hidden notices retained in history"
          icon={<ArchiveIcon />}
        />
      </div>

      <SearchFilterBar
        aria-label="Find notices"
        updating={refreshing}
        hasActiveFilters={hasActiveFilters}
        onClearAll={() => {
          setSearchQuery("");
          setStatusFilter("CURRENT");
          setAudienceFilter("ALL");
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Field id="notices-search" label="Find a notice">
              {({ id }) => (
                <SearchFilterInput
                  id={id}
                  placeholder="Title, message, room, or tenant"
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
              )}
            </Field>
          </div>

          <Field id="notices-filter-status" label="Status">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="CURRENT">
                  Unarchived (active, scheduled, expired)
                </option>
                <option value="ALL">All notices</option>
                {NOTICE_LIFECYCLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {NOTICE_LIFECYCLE_LABELS[status]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="notices-filter-audience" label="Audience">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={audienceFilter}
                onChange={(e) => setAudienceFilter(e.target.value)}
              >
                <option value="ALL">All audiences</option>
                {NOTICE_AUDIENCES.map((aud) => (
                  <option key={aud} value={aud}>
                    {NOTICE_AUDIENCE_LABELS[aud]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </SearchFilterBar>

      {filteredNotices.length === 0 ? (
        <EmptyState>
          <Image
            src="/illustrations/document-search.svg"
            alt=""
            width={160}
            height={112}
            className="h-28 w-auto"
          />
          <EmptyStateTitle>
            {overview.notices.length === 0
              ? "No notices published yet"
              : "No matching notices"}
          </EmptyStateTitle>
          <EmptyStateDescription>
            {overview.notices.length === 0
              ? "Publish property advisories, maintenance reminders, or room/tenant notices here."
              : "Reset what you entered or change the status or audience selection."}
          </EmptyStateDescription>
          <EmptyStateActions>
            {hasActiveFilters ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("CURRENT");
                  setAudienceFilter("ALL");
                }}
              >
                Clear
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setEditingNotice(null);
                  setDialogSessionKey((k) => k + 1);
                  setDialogOpen(true);
                }}
              >
                New notice
              </Button>
            )}
          </EmptyStateActions>
        </EmptyState>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <TableCardHeader
            title="Notices"
            count={`${filteredNotices.length} ${filteredNotices.length === 1 ? "record" : "records"}`}
          />
          {/* 360px Mobile stacked cards */}
          <div className="grid divide-y divide-border md:hidden">
            {paginatedNotices.map((notice) => (
              <div key={notice.id} className="grid gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {notice.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatAudienceTarget(notice)}
                    </p>
                  </div>
                  <Badge tone={NOTICE_LIFECYCLE_TONE[notice.lifecycleStatus]}>
                    {NOTICE_LIFECYCLE_LABELS[notice.lifecycleStatus]}
                  </Badge>
                </div>

                <p className="line-clamp-3 text-xs leading-5 text-foreground">
                  {notice.body}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-xs">
                  <span className="text-muted-foreground tabular-nums">
                    {formatManilaDate(notice.startDateManila)} –{" "}
                    {formatManilaDate(notice.endDateManila)}
                  </span>
                  <RowActionMenu
                    label={`Actions for ${notice.title}`}
                    items={getNoticeRowActions(notice)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead {...sortHeaderProps("title")}>
                    Title &amp; message
                  </TableHead>
                  <TableHead {...sortHeaderProps("audience")}>
                    Audience
                  </TableHead>
                  <TableHead {...sortHeaderProps("dates")}>
                    Visible dates
                  </TableHead>
                  <TableHead {...sortHeaderProps("status")}>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedNotices.map((notice) => (
                  <TableRow key={notice.id}>
                    <TableCell className="max-w-md">
                      <div className="grid gap-0.5">
                        <span className="font-medium text-foreground">
                          {notice.title}
                        </span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {notice.body}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <span className="text-sm text-foreground">
                          {formatAudienceTarget(notice)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {NOTICE_AUDIENCE_LABELS[notice.audience]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatManilaDate(notice.startDateManila)} –{" "}
                      {formatManilaDate(notice.endDateManila)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone={NOTICE_LIFECYCLE_TONE[notice.lifecycleStatus]}
                      >
                        {NOTICE_LIFECYCLE_LABELS[notice.lifecycleStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionMenu
                        label={`Actions for ${notice.title}`}
                        items={getNoticeRowActions(notice)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            {...noticesPaginationProps}
            label="Notices table pagination"
          />
        </Card>
      )}

      {dialogOpen && (
        <NoticeFormDialog
          key={dialogSessionKey}
          open={dialogOpen}
          notice={editingNotice}
          todayManila={overview.todayManila}
          rooms={overview.rooms}
          tenants={overview.tenants}
          onClose={() => {
            setDialogOpen(false);
            setEditingNotice(null);
          }}
          onSaved={async (message) => {
            setFeedback({ tone: "success", message });
            await reloadNotices();
          }}
        />
      )}
      <ConfirmDialog
        open={confirmingNotice !== null}
        onClose={() => {
          if (busyNoticeId) return;
          setConfirmError(null);
          setConfirmingNotice(null);
        }}
        onConfirm={() => {
          if (confirmingNotice) handleArchiveToggle(confirmingNotice);
        }}
        title={
          confirmingNotice
            ? confirmingNotice.archivedAt
              ? `Restore notice "${confirmingNotice.title}"?`
              : `Archive notice "${confirmingNotice.title}"?`
            : "Update notice?"
        }
        description={
          confirmingNotice?.archivedAt
            ? "Restoring makes this announcement visible again within its configured date range."
            : "Archiving hides this notice from active boards. You can restore it later."
        }
        errorMessage={confirmError}
        confirmLabel={confirmingNotice?.archivedAt ? "Restore" : "Archive"}
        confirmVariant={confirmingNotice?.archivedAt ? "primary" : "danger"}
        loading={
          confirmingNotice !== null && busyNoticeId === confirmingNotice.id
        }
      />
    </div>
  );
}
