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
import { toast } from "@/components/ui/toaster";
import {
  archiveNoticeAction,
  bulkArchiveNoticesAction,
  restoreNoticeAction,
  sendNoticeSmsAction,
} from "@/features/notices/actions";
import {
  formatNoticeSmsText,
  NOTICE_AUDIENCE_LABELS,
  NOTICE_AUDIENCES,
  NOTICE_LIFECYCLE_LABELS,
  NOTICE_LIFECYCLE_STATUSES,
  type NoticeDto,
  type NoticeOverviewDto,
} from "@/features/notices/schemas";
import { estimateSmsSegments } from "@/features/sms/schemas";
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
    return notice.tenantName ?? "Specific boarder";
  }
  return "All boarders";
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
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [audienceFilter, setAudienceFilter] = useState("ALL");
  const [selectedNoticeIds, setSelectedNoticeIds] = useState<string[]>([]);
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkArchivePending, setBulkArchivePending] = useState(false);
  const [bulkArchiveError, setBulkArchiveError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<NoticeDto | null>(null);
  const [dialogSessionKey, setDialogSessionKey] = useState(0);
  const [busyNoticeId, setBusyNoticeId] = useState<string | null>(null);
  const [confirmingNotice, setConfirmingNotice] = useState<NoticeDto | null>(
    null,
  );
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [smsTargetNotice, setSmsTargetNotice] = useState<NoticeDto | null>(
    null,
  );
  const [smsConfirmError, setSmsConfirmError] = useState<string | null>(null);
  const [sendingSms, setSendingSms] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function handleCopyNotice(notice: NoticeDto) {
    const text = `${notice.title}\n\n${notice.body}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Notice copied to clipboard.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  async function handleSendNoticeSms(notice: NoticeDto) {
    if (sendingSms) return;
    setSendingSms(true);
    setSmsConfirmError(null);
    try {
      const result = await sendNoticeSmsAction({ noticeId: notice.id });
      if (result.status === "error") {
        setSmsConfirmError(result.message);
        return;
      }
      if (result.status === "saved") {
        setSmsTargetNotice(null);
        toast.success(result.message);
      }
    } finally {
      setSendingSms(false);
    }
  }

  async function reloadNotices() {
    startRefresh(async () => {
      try {
        await reload();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not refresh notices.",
        );
      }
    });
  }

  function handleArchiveToggle(notice: NoticeDto) {
    setBusyNoticeId(notice.id);
    setErrorMessage(null);
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
          toast.success(result.message);
          await reloadNotices();
        }
      } finally {
        setBusyNoticeId(null);
      }
    });
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredNotices = overview.notices.filter((notice) => {
    if (statusFilter === "ALL") {
      if (notice.lifecycleStatus === "ARCHIVED") return false;
    } else if (notice.lifecycleStatus !== statusFilter) {
      return false;
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
    statusFilter !== "ALL" ||
    audienceFilter !== "ALL";

  const viewingArchived = statusFilter === "ARCHIVED";
  const isNoticeBulkEligible = (notice: NoticeDto) =>
    viewingArchived ? notice.archivedAt !== null : notice.archivedAt === null;
  const eligibleNotices = filteredNotices.filter(isNoticeBulkEligible);
  const selectedEligibleNotices = eligibleNotices.filter((notice) =>
    selectedNoticeIds.includes(notice.id),
  );
  const pageEligibleNotices = paginatedNotices.filter(isNoticeBulkEligible);
  const allPageNoticesSelected =
    pageEligibleNotices.length > 0 &&
    pageEligibleNotices.every((notice) =>
      selectedNoticeIds.includes(notice.id),
    );

  function toggleNoticeSelection(noticeId: string) {
    setSelectedNoticeIds((prev) =>
      prev.includes(noticeId)
        ? prev.filter((id) => id !== noticeId)
        : [...prev, noticeId],
    );
  }

  function toggleAllPageNotices() {
    if (allPageNoticesSelected) {
      const pageIds = new Set(pageEligibleNotices.map((notice) => notice.id));
      setSelectedNoticeIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const merged = new Set([
        ...selectedNoticeIds,
        ...pageEligibleNotices.map((notice) => notice.id),
      ]);
      setSelectedNoticeIds(Array.from(merged));
    }
  }

  async function executeBulkArchiveNotices() {
    if (selectedEligibleNotices.length === 0 || bulkArchivePending) return;
    setBulkArchivePending(true);
    setBulkArchiveError(null);
    try {
      const res = await bulkArchiveNoticesAction(
        selectedEligibleNotices.map((notice) => ({
          noticeId: notice.id,
          expectedVersion: notice.version,
        })),
        viewingArchived ? "restore" : "archive",
      );
      if (res.status === "saved") {
        setBulkArchiveOpen(false);
        setSelectedNoticeIds([]);
        toast.success(res.message);
        await reloadNotices();
      } else if (res.status === "error") {
        setBulkArchiveError(res.message);
      }
    } finally {
      setBulkArchivePending(false);
    }
  }

  function getNoticeRowActions(notice: NoticeDto): RowActionItem[] {
    return [
      ...(!notice.archivedAt
        ? [
            {
              id: "send-sms",
              label: isOfflineView
                ? "Send via SMS (online only)"
                : !overview.smsConfigured
                  ? "Send via SMS (connect Semaphore)"
                  : notice.smsSentAt
                    ? "Resend via SMS"
                    : "Send via SMS",
              disabled: isOfflineView || !overview.smsConfigured,
              onSelect: () => {
                setSmsConfirmError(null);
                setSmsTargetNotice(notice);
              },
            },
            {
              id: "copy",
              label: "Copy message",
              onSelect: () => void handleCopyNotice(notice),
            },
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
        : [
            {
              id: "copy",
              label: "Copy message",
              onSelect: () => void handleCopyNotice(notice),
            },
          ]),
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
            Write announcements for everyone, a room, or a tenant, and send them
            by text via Semaphore.
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

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      {!isOfflineView && !overview.smsConfigured && (
        <Alert tone="info">
          Text notices are not connected yet. You can still save any notice and
          copy it for Messenger or Viber.
        </Alert>
      )}

      <div className="grid gap-3.5 sm:grid-cols-3">
        <MetricCard
          label="Sent"
          value={overview.totals.sentCount}
          description="Notices sent to boarders"
          icon={<ActiveNoticeIcon />}
          tone={overview.totals.sentCount > 0 ? "success" : "neutral"}
        />
        <MetricCard
          label="Scheduled"
          value={overview.totals.scheduledCount}
          description="Upcoming scheduled send date"
          icon={<ScheduledIcon />}
          tone={overview.totals.scheduledCount > 0 ? "info" : "neutral"}
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
          setStatusFilter("ALL");
          setAudienceFilter("ALL");
          setSelectedNoticeIds([]);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Field id="notices-search" label="Find a notice">
              {({ id }) => (
                <SearchFilterInput
                  id={id}
                  placeholder="Title, message, room, or boarder"
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
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setSelectedNoticeIds([]);
                }}
              >
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
                  setStatusFilter("ALL");
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
          {selectedEligibleNotices.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent/40 px-4 py-2.5 sm:px-6">
              <span className="text-sm font-medium text-foreground">
                {selectedEligibleNotices.length}{" "}
                {selectedEligibleNotices.length === 1 ? "notice" : "notices"}{" "}
                selected
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedNoticeIds([])}
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
            {paginatedNotices.map((notice) => {
              const eligible = isNoticeBulkEligible(notice);
              return (
                <div key={notice.id} className="grid gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${notice.title}`}
                        checked={
                          eligible && selectedNoticeIds.includes(notice.id)
                        }
                        disabled={
                          !eligible || isOfflineView || bulkArchivePending
                        }
                        onChange={() => toggleNoticeSelection(notice.id)}
                        className="mt-1 size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {notice.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatAudienceTarget(notice)}
                        </p>
                      </div>
                    </div>
                    <div className="grid justify-items-end gap-1">
                      <Badge
                        tone={NOTICE_LIFECYCLE_TONE[notice.lifecycleStatus]}
                      >
                        {NOTICE_LIFECYCLE_LABELS[notice.lifecycleStatus]}
                      </Badge>
                      {notice.smsSentAt ? (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          Texted to {notice.smsSentCount}
                        </span>
                      ) : notice.lifecycleStatus === "SCHEDULED" ? (
                        <span className="text-[11px] text-muted-foreground">
                          Auto-SMS scheduled
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <p className="line-clamp-3 text-xs leading-5 text-foreground">
                    {notice.body}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-xs">
                    <span className="text-muted-foreground tabular-nums">
                      {formatManilaDate(notice.startDateManila)}
                    </span>
                    <RowActionMenu
                      label={`Actions for ${notice.title}`}
                      items={getNoticeRowActions(notice)}
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
                          ? "Select all archived notices on this page"
                          : "Select all notices on this page"
                      }
                      checked={allPageNoticesSelected}
                      disabled={
                        isOfflineView ||
                        bulkArchivePending ||
                        pageEligibleNotices.length === 0
                      }
                      onChange={toggleAllPageNotices}
                      className="size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </TableHead>
                  <TableHead {...sortHeaderProps("title")}>
                    Title &amp; message
                  </TableHead>
                  <TableHead {...sortHeaderProps("audience")}>
                    Audience
                  </TableHead>
                  <TableHead {...sortHeaderProps("dates")}>Send date</TableHead>
                  <TableHead {...sortHeaderProps("status")}>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedNotices.map((notice) => {
                  const eligible = isNoticeBulkEligible(notice);
                  return (
                    <TableRow key={notice.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${notice.title}`}
                          checked={
                            eligible && selectedNoticeIds.includes(notice.id)
                          }
                          disabled={
                            !eligible || isOfflineView || bulkArchivePending
                          }
                          onChange={() => toggleNoticeSelection(notice.id)}
                          className="size-4 cursor-pointer rounded border-control-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </TableCell>
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
                        {formatManilaDate(notice.startDateManila)}
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-1">
                          <div>
                            <Badge
                              tone={
                                NOTICE_LIFECYCLE_TONE[notice.lifecycleStatus]
                              }
                            >
                              {NOTICE_LIFECYCLE_LABELS[notice.lifecycleStatus]}
                            </Badge>
                          </div>
                          {notice.smsSentAt ? (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              Texted to {notice.smsSentCount}
                            </span>
                          ) : notice.lifecycleStatus === "SCHEDULED" ? (
                            <span className="text-xs text-muted-foreground">
                              Auto-SMS scheduled
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActionMenu
                          label={`Actions for ${notice.title}`}
                          items={getNoticeRowActions(notice)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
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
          smsConfigured={overview.smsConfigured}
          businessName={overview.businessName}
          onClose={() => {
            setDialogOpen(false);
            setEditingNotice(null);
          }}
          onSaved={async (message) => {
            toast.success(message);
            await reloadNotices();
          }}
        />
      )}
      <ConfirmDialog
        open={smsTargetNotice !== null}
        onClose={() => {
          if (sendingSms) return;
          setSmsConfirmError(null);
          setSmsTargetNotice(null);
        }}
        onConfirm={() => {
          if (smsTargetNotice) void handleSendNoticeSms(smsTargetNotice);
        }}
        title={
          smsTargetNotice
            ? `Send "${smsTargetNotice.title}" via SMS?`
            : "Send notice via SMS?"
        }
        description={(() => {
          if (!smsTargetNotice) return undefined;
          const preview = formatNoticeSmsText({
            title: smsTargetNotice.title,
            body: smsTargetNotice.body,
            businessName: overview.businessName,
          });
          const est = estimateSmsSegments(preview);
          const audienceText = formatAudienceTarget(smsTargetNotice);
          return `Audience: ${audienceText}. ${est.length} characters, ${est.segments} ${est.segments === 1 ? "text credit" : "text credits"} per recipient. Preview: "${preview}"`;
        })()}
        errorMessage={smsConfirmError}
        confirmLabel="Send text"
        confirmVariant="primary"
        loading={sendingSms}
      />
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
      <ConfirmDialog
        open={bulkArchiveOpen}
        onClose={() => {
          if (bulkArchivePending) return;
          setBulkArchiveError(null);
          setBulkArchiveOpen(false);
        }}
        onConfirm={() => {
          void executeBulkArchiveNotices();
        }}
        title={
          viewingArchived
            ? `Restore ${selectedEligibleNotices.length} ${selectedEligibleNotices.length === 1 ? "notice" : "notices"}?`
            : `Archive ${selectedEligibleNotices.length} ${selectedEligibleNotices.length === 1 ? "notice" : "notices"}?`
        }
        description={
          viewingArchived
            ? "Restoring returns the selected notices to your active notices list."
            : "Archiving hides the selected notices from your active list. You can restore them anytime."
        }
        errorMessage={bulkArchiveError}
        confirmLabel={viewingArchived ? "Restore" : "Archive"}
        confirmVariant={viewingArchived ? "primary" : "danger"}
        loading={bulkArchivePending}
      />
    </div>
  );
}
