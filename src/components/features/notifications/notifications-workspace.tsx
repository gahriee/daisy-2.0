"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TableEmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { MetricCard } from "@/components/ui/metric-card";
import {
  SearchFilterBar,
  SearchFilterInput,
} from "@/components/ui/search-filter";
import { Select } from "@/components/ui/select";
import { TableCardHeader } from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  chunkNotificationKeys,
  getNotificationCategory,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_TONE_LABELS,
  NOTIFICATIONS_UPDATED_EVENT,
  sortOwnerNotifications,
  type NotificationCategory,
  type NotificationTone,
  type OwnerNotification,
} from "@/features/notifications/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import {
  NotificationCard,
  type NotificationRowAction,
} from "./notification-card";

type ReadFilter = "ALL" | "UNREAD" | "READ";
type CategoryFilter = "ALL" | NotificationCategory;
type ToneFilter = "ALL" | NotificationTone;

type ConfirmActionState = {
  mode: NotificationRowAction;
  keys: string[];
  title: string;
  description: string;
  confirmLabel: string;
};

function BellMetricIcon() {
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
      <path d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 4 1.75 5.75 1.75 5.75H4.75S6.5 13.5 6.5 9.5Z" />
      <path d="M10.25 18.5a2 2 0 0 0 3.5 0" />
    </svg>
  );
}

function UnreadMetricIcon() {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4.5 7 7.5 5.5L19.5 7" />
    </svg>
  );
}

function AttentionMetricIcon() {
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
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 10v4.25" />
      <circle cx="12" cy="16.75" r="0.65" fill="currentColor" />
    </svg>
  );
}

function ReadMetricIcon() {
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
      <path d="m8.75 12.25 2.25 2.25 4.25-4.5" />
    </svg>
  );
}

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

function broadcastNotificationsUpdate(next: OwnerNotification[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NOTIFICATIONS_UPDATED_EVENT, {
      detail: { notifications: next },
    }),
  );
}

/**
 * Owner notifications workspace with standard page header, KPI summary,
 * dynamic filters, bulk checkbox selection, and ConfirmDialog-gated read,
 * unread, and delete flows.
 */
export function NotificationsWorkspace({
  initialNotifications,
}: {
  initialNotifications: OwnerNotification[];
}) {
  const [notifications, setNotifications] =
    useState<OwnerNotification[]>(initialNotifications);
  const [searchQuery, setSearchQuery] = useState("");
  const [readFilter, setReadFilter] = useState<ReadFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [toneFilter, setToneFilter] = useState<ToneFilter>("ALL");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmActionState | null>(
    null,
  );
  const [mutating, setMutating] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const sortedNotifications = useMemo(
    () => sortOwnerNotifications(notifications),
    [notifications],
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );
  const readCount = notifications.length - unreadCount;
  const warningCount = useMemo(
    () =>
      notifications.filter((item) => item.tone === "warning" && !item.read)
        .length,
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sortedNotifications.filter((item) => {
      if (readFilter === "UNREAD" && item.read) return false;
      if (readFilter === "READ" && !item.read) return false;

      const category = getNotificationCategory(item.key);
      if (categoryFilter !== "ALL" && category !== categoryFilter) {
        return false;
      }

      if (toneFilter !== "ALL" && item.tone !== toneFilter) {
        return false;
      }

      if (query) {
        const categoryText =
          NOTIFICATION_CATEGORY_LABELS[category].toLowerCase();
        const matches =
          item.title.toLowerCase().includes(query) ||
          item.message.toLowerCase().includes(query) ||
          categoryText.includes(query);
        if (!matches) return false;
      }

      return true;
    });
  }, [
    sortedNotifications,
    searchQuery,
    readFilter,
    categoryFilter,
    toneFilter,
  ]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    readFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    toneFilter !== "ALL";

  const pagination = useTablePagination(filteredNotifications, {
    initialPageSize: 25,
    resetKey: `${searchQuery}|${readFilter}|${categoryFilter}|${toneFilter}|${notifications.length}`,
  });

  const filteredKeySet = useMemo(
    () => new Set(filteredNotifications.map((item) => item.key)),
    [filteredNotifications],
  );
  const effectiveSelectedKeys = useMemo(
    () => selectedKeys.filter((key) => filteredKeySet.has(key)),
    [selectedKeys, filteredKeySet],
  );
  const selectedKeySet = useMemo(
    () => new Set(effectiveSelectedKeys),
    [effectiveSelectedKeys],
  );

  const pageKeys = useMemo(
    () => pagination.paginatedRows.map((item) => item.key),
    [pagination.paginatedRows],
  );
  const allPageSelected =
    pageKeys.length > 0 && pageKeys.every((key) => selectedKeySet.has(key));

  const selectedItems = useMemo(
    () => filteredNotifications.filter((item) => selectedKeySet.has(item.key)),
    [filteredNotifications, selectedKeySet],
  );
  const selectedUnreadKeys = useMemo(
    () => selectedItems.filter((item) => !item.read).map((item) => item.key),
    [selectedItems],
  );
  const selectedReadKeys = useMemo(
    () => selectedItems.filter((item) => item.read).map((item) => item.key),
    [selectedItems],
  );

  function clearFilters() {
    setSearchQuery("");
    setReadFilter("ALL");
    setCategoryFilter("ALL");
    setToneFilter("ALL");
  }

  function toggleOneKey(key: string) {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  }

  function togglePageSelection() {
    if (allPageSelected) {
      const pageSet = new Set(pageKeys);
      setSelectedKeys((prev) => prev.filter((key) => !pageSet.has(key)));
      return;
    }
    setSelectedKeys((prev) => [...new Set([...prev, ...pageKeys])]);
  }

  function selectAllFiltered() {
    setSelectedKeys(filteredNotifications.map((item) => item.key));
  }

  function clearSelection() {
    setSelectedKeys([]);
  }

  function openSingleActionConfirm(
    action: NotificationRowAction,
    item: OwnerNotification,
  ) {
    setConfirmError(null);
    if (action === "read") {
      setConfirmTarget({
        mode: "read",
        keys: [item.key],
        title: "Mark notification as read?",
        description: `This marks "${item.title}" as read while keeping the underlying record active.`,
        confirmLabel: "Mark as read",
      });
      return;
    }
    if (action === "unread") {
      setConfirmTarget({
        mode: "unread",
        keys: [item.key],
        title: "Mark notification as unread?",
        description: `This returns "${item.title}" to your unread notifications count.`,
        confirmLabel: "Mark as unread",
      });
      return;
    }
    setConfirmTarget({
      mode: "delete",
      keys: [item.key],
      title: "Delete notification?",
      description: `This removes "${item.title}" from your notification feed without altering the underlying property record.`,
      confirmLabel: "Delete",
    });
  }

  function openBulkActionConfirm(mode: NotificationRowAction, keys: string[]) {
    if (keys.length === 0) return;
    setConfirmError(null);
    const count = keys.length;
    const noun = count === 1 ? "notification" : "notifications";
    if (mode === "read") {
      setConfirmTarget({
        mode: "read",
        keys,
        title: `Mark ${count} ${noun} as read?`,
        description: `This clears ${count} unread ${noun} from your header badge.`,
        confirmLabel: count === 1 ? "Mark as read" : `Mark ${count} read`,
      });
      return;
    }
    if (mode === "unread") {
      setConfirmTarget({
        mode: "unread",
        keys,
        title: `Mark ${count} ${noun} as unread?`,
        description: `This returns ${count} ${noun} to your unread notifications count.`,
        confirmLabel: count === 1 ? "Mark as unread" : `Mark ${count} unread`,
      });
      return;
    }
    setConfirmTarget({
      mode: "delete",
      keys,
      title: `Delete ${count} ${noun}?`,
      description: `This removes ${count} ${noun} from your notification feed without altering underlying records.`,
      confirmLabel: count === 1 ? "Delete" : `Delete ${count}`,
    });
  }

  async function refreshNotifications() {
    if (refreshing) return;
    setRefreshing(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: "Could not refresh notifications right now.",
        });
        return;
      }
      const data = (await response.json()) as {
        notifications?: OwnerNotification[];
      };
      if (Array.isArray(data.notifications)) {
        const next = data.notifications;
        const nextSet = new Set(next.map((item) => item.key));
        setNotifications(next);
        setSelectedKeys((prev) => prev.filter((key) => nextSet.has(key)));
        broadcastNotificationsUpdate(next);
      }
    } catch {
      setFeedback({
        tone: "danger",
        message: "Connect to the internet to refresh notifications.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function executeConfirmedAction() {
    if (!confirmTarget || mutating) return;
    const batches = chunkNotificationKeys(confirmTarget.keys, 50);
    if (batches.length === 0) {
      setConfirmTarget(null);
      return;
    }

    const endpoint =
      confirmTarget.mode === "read"
        ? "/api/notifications/read"
        : confirmTarget.mode === "unread"
          ? "/api/notifications/unread"
          : "/api/notifications/delete";

    setMutating(true);
    setConfirmError(null);
    setFeedback(null);
    try {
      for (const batch of batches) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: batch }),
          cache: "no-store",
        });
        if (!response.ok) {
          setConfirmError(
            "Could not update notifications right now. Try again.",
          );
          return;
        }
      }

      const keySet = new Set(confirmTarget.keys);
      const nowIso = new Date().toISOString();
      let updated: OwnerNotification[];
      if (confirmTarget.mode === "read") {
        updated = notifications.map((item) =>
          keySet.has(item.key)
            ? { ...item, read: true, readAt: item.readAt ?? nowIso }
            : item,
        );
      } else if (confirmTarget.mode === "unread") {
        updated = notifications.map((item) =>
          keySet.has(item.key) ? { ...item, read: false, readAt: null } : item,
        );
      } else {
        updated = notifications.filter((item) => !keySet.has(item.key));
      }

      const count = confirmTarget.keys.length;
      const noun = count === 1 ? "notification" : "notifications";
      const statusText =
        confirmTarget.mode === "read"
          ? `Marked ${count} ${noun} as read.`
          : confirmTarget.mode === "unread"
            ? `Marked ${count} ${noun} as unread.`
            : `Deleted ${count} ${noun}.`;

      setNotifications(updated);
      setSelectedKeys((prev) => prev.filter((key) => !keySet.has(key)));
      broadcastNotificationsUpdate(updated);
      setConfirmTarget(null);
      setFeedback({ tone: "success", message: statusText });
    } catch {
      setConfirmError("Connection interrupted while updating notifications.");
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Notifications
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Review operational alerts, unread items, and workspace updates
            across your boarding house and transient rooms.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            onClick={() => void refreshNotifications()}
          >
            {!refreshing && <RefreshIcon />}
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>
          {unreadCount > 0 && (
            <Button
              size="md"
              onClick={() =>
                openBulkActionConfirm(
                  "read",
                  notifications
                    .filter((item) => !item.read)
                    .map((item) => item.key),
                )
              }
            >
              Mark all read
            </Button>
          )}
        </div>
      </header>

      {feedback && (
        <Alert
          tone={feedback.tone}
          role={feedback.tone === "danger" ? "alert" : "status"}
        >
          {feedback.message}
        </Alert>
      )}

      <section
        aria-label="Notification summary"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <MetricCard
          label="Total alerts"
          value={notifications.length}
          description="Active alerts on this workspace"
          icon={<BellMetricIcon />}
        />
        <MetricCard
          label="Unread"
          value={unreadCount}
          description="Waiting for your review"
          tone={unreadCount > 0 ? "warning" : "neutral"}
          icon={<UnreadMetricIcon />}
        />
        <MetricCard
          label="Action required"
          value={warningCount}
          description="Important alerts to handle soon"
          tone={warningCount > 0 ? "warning" : "neutral"}
          icon={<AttentionMetricIcon />}
        />
        <MetricCard
          label="Read"
          value={readCount}
          description="Already checked"
          tone="muted"
          icon={<ReadMetricIcon />}
        />
      </section>

      <SearchFilterBar
        title="Filter notifications"
        updating={refreshing}
        hasActiveFilters={hasActiveFilters}
        onClearAll={clearFilters}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="notif-search" label="Find notifications">
            {(fieldProps) => (
              <SearchFilterInput
                {...fieldProps}
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="Invoice, room, request code..."
                clearLabel="Clear notification search"
              />
            )}
          </Field>

          <Field id="notif-read-filter" label="Status">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={readFilter}
                onChange={(event) =>
                  setReadFilter(event.target.value as ReadFilter)
                }
              >
                <option value="ALL">All statuses</option>
                <option value="UNREAD">Unread</option>
                <option value="READ">Read</option>
              </Select>
            )}
          </Field>

          <Field id="notif-category-filter" label="Category">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value as CategoryFilter)
                }
              >
                <option value="ALL">All categories</option>
                {(
                  Object.entries(NOTIFICATION_CATEGORY_LABELS) as Array<
                    [NotificationCategory, string]
                  >
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="notif-tone-filter" label="Priority">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={toneFilter}
                onChange={(event) =>
                  setToneFilter(event.target.value as ToneFilter)
                }
              >
                <option value="ALL">All priorities</option>
                {(
                  Object.entries(NOTIFICATION_TONE_LABELS) as Array<
                    [NotificationTone, string]
                  >
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </SearchFilterBar>

      {filteredNotifications.length === 0 ? (
        <Card className="overflow-hidden p-0 sm:p-0">
          <TableCardHeader
            title="Workspace alerts"
            count={`${filteredNotifications.length} alerts`}
          />
          <TableEmptyState
            title={
              notifications.length === 0
                ? "No notifications right now"
                : "No matching notifications"
            }
            description={
              notifications.length === 0
                ? "New booking requests, overdue invoices, urgent maintenance, stay endings, and security updates appear here."
                : "Reset your search or filter selections to view all workspace notifications."
            }
            actions={
              hasActiveFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          <Card className="overflow-hidden p-0 sm:p-0">
            <TableCardHeader
              title="Workspace alerts"
              count={`${filteredNotifications.length} ${
                filteredNotifications.length === 1 ? "alert" : "alerts"
              }`}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-2.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox
                  checked={allPageSelected}
                  disabled={mutating}
                  onChange={togglePageSelection}
                  label={
                    effectiveSelectedKeys.length > 0
                      ? `${effectiveSelectedKeys.length} selected`
                      : `Select all on page (${pagination.paginatedRows.length})`
                  }
                  className="text-xs font-medium text-foreground sm:text-sm"
                />

                {allPageSelected &&
                  filteredNotifications.length >
                    pagination.paginatedRows.length &&
                  effectiveSelectedKeys.length <
                    filteredNotifications.length && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectAllFiltered}
                    >
                      Select all {filteredNotifications.length}
                    </Button>
                  )}
              </div>

              {effectiveSelectedKeys.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {selectedUnreadKeys.length > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={mutating}
                      onClick={() =>
                        openBulkActionConfirm("read", selectedUnreadKeys)
                      }
                      className="min-h-11 sm:min-h-9"
                    >
                      Mark as read ({selectedUnreadKeys.length})
                    </Button>
                  )}
                  {selectedReadKeys.length > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={mutating}
                      onClick={() =>
                        openBulkActionConfirm("unread", selectedReadKeys)
                      }
                      className="min-h-11 sm:min-h-9"
                    >
                      Mark as unread ({selectedReadKeys.length})
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={mutating}
                    onClick={() =>
                      openBulkActionConfirm("delete", effectiveSelectedKeys)
                    }
                    className="min-h-11 text-danger sm:min-h-9"
                  >
                    Delete ({effectiveSelectedKeys.length})
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={mutating}
                    onClick={clearSelection}
                    className="min-h-11 sm:min-h-9"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-3">
            {pagination.paginatedRows.map((notification) => (
              <NotificationCard
                key={notification.key}
                notification={notification}
                density="page"
                selected={selectedKeySet.has(notification.key)}
                onToggleSelect={toggleOneKey}
                onRequestAction={openSingleActionConfirm}
                busy={mutating}
              />
            ))}
          </div>

          <div className="overflow-hidden rounded-panel border border-border bg-surface [&>nav]:border-t-0">
            <TablePagination
              {...pagination.paginationProps}
              label="Notifications pagination"
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onClose={() => {
          if (!mutating) {
            setConfirmError(null);
            setConfirmTarget(null);
          }
        }}
        onConfirm={() => void executeConfirmedAction()}
        title={confirmTarget?.title ?? "Update notifications?"}
        description={confirmTarget?.description}
        errorMessage={confirmError}
        confirmLabel={confirmTarget?.confirmLabel ?? "Confirm"}
        confirmVariant={confirmTarget?.mode === "delete" ? "danger" : "primary"}
        loading={mutating}
      />
    </div>
  );
}
