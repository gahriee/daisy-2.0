"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
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
}: {
  initialOverview: MaintenanceOverviewDto;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE_QUEUE");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function reloadMaintenance() {
    startRefresh(async () => {
      try {
        const res = await fetch("/api/maintenance", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Could not refresh maintenance requests.");
        }
        const next = (await res.json()) as MaintenanceOverviewDto;
        setOverview(next);
      } catch (error) {
        setFeedback({
          tone: "danger",
          message:
            error instanceof Error
              ? error.message
              : "Could not refresh maintenance requests.",
        });
      }
    });
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredRequests = overview.requests.filter((req) => {
    if (statusFilter === "ACTIVE_QUEUE") {
      if (req.archivedAt !== null) return false;
    } else if (statusFilter === "ARCHIVED") {
      if (req.archivedAt === null) return false;
    } else if (statusFilter !== "ALL") {
      if (req.archivedAt !== null || req.status !== statusFilter) return false;
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
    statusFilter !== "ACTIVE_QUEUE" ||
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
    overview.totals.openCount +
    overview.totals.inProgressCount +
    overview.totals.waitingPartsCount;

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
          label="Active repairs"
          value={activeQueueCount}
          description="Open, in progress, or waiting parts"
          icon={<WrenchIcon />}
          tone={activeQueueCount > 0 ? "info" : "neutral"}
        />
        <MetricCard
          label="Urgent priority"
          value={overview.totals.urgentOpenCount}
          description="Needs prompt Owner attention"
          icon={<UrgentIcon />}
          tone={overview.totals.urgentOpenCount > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Waiting parts"
          value={overview.totals.waitingPartsCount}
          description="Awaiting contractor or materials"
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
          setStatusFilter("ACTIVE_QUEUE");
          setPriorityFilter("ALL");
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Field id="maint-search" label="Find a request">
              {({ id }) => (
                <SearchFilterInput
                  id={id}
                  placeholder="Issue, room number, or category"
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
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ACTIVE_QUEUE">
                  Active &amp; recent (unarchived)
                </option>
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
                  setStatusFilter("ACTIVE_QUEUE");
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
          {/* 360px Mobile stacked cards */}
          <div className="grid divide-y divide-border md:hidden">
            {paginatedRequests.map((req) => (
              <div key={req.id} className="grid gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-0.5">
                    <Link
                      href={`/maintenance/${req.id}`}
                      className="text-sm font-semibold text-foreground hover:text-primary"
                    >
                      {req.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Room {req.roomNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {MAINTENANCE_CATEGORY_LABELS[req.category]}
                    </p>
                  </div>
                  <Badge tone={MAINTENANCE_STATUS_TONE[req.status]}>
                    {MAINTENANCE_STATUS_LABELS[req.status]}
                  </Badge>
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
                  <Link
                    href={`/maintenance/${req.id}`}
                    className={buttonClasses({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    Manage
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead {...sortHeaderProps("issue")}>Issue</TableHead>
                  <TableHead {...sortHeaderProps("location")}>
                    Location
                  </TableHead>
                  <TableHead {...sortHeaderProps("priority")}>
                    Priority
                  </TableHead>
                  <TableHead {...sortHeaderProps("status")}>Status</TableHead>
                  <TableHead {...sortHeaderProps("holdsFiles")}>
                    Holds &amp; files
                  </TableHead>
                  <TableHead {...sortHeaderProps("logged")}>Logged</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <Link
                          href={`/maintenance/${req.id}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {req.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {MAINTENANCE_CATEGORY_LABELS[req.category]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>Room {req.roomNumber}</TableCell>
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
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      <div className="grid gap-0.5">
                        <span>
                          {req.activeHolds.length > 0
                            ? `${req.activeHolds.length} active hold`
                            : "No hold"}
                        </span>
                        {req.attachments.length > 0 && (
                          <span>{req.attachments.length} attachment(s)</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatManilaDate(toManilaDate(new Date(req.createdAt)))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/maintenance/${req.id}`}
                        className={buttonClasses({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        Manage
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            {...requestsPaginationProps}
            label="Maintenance requests table pagination"
          />
        </Card>
      )}
    </div>
  );
}
