"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { TableCardSkeleton } from "@/components/common/page-skeletons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import {
  SearchFilterBar,
  SearchFilterInput,
} from "@/components/ui/search-filter";
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
  AUDIT_AREA_LABELS,
  AUDIT_AREAS,
  type AuditAreaFilter,
  type AuditLogEntryDto,
} from "@/features/audit/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatManilaDateTime } from "@/lib/dates";
import type { SortColumnDef } from "@/lib/table-sort";

type AuditSortKey =
  "createdAt" | "area" | "action" | "actor" | "entity" | "seq";

const AUDIT_SORT_COLUMNS: Record<
  AuditSortKey,
  SortColumnDef<AuditLogEntryDto>
> = {
  createdAt: {
    getValue: (entry) => entry.createdAt,
    kind: "date",
    defaultDirection: "desc",
  },
  area: {
    getValue: (entry) =>
      AUDIT_AREA_LABELS[entry.area as AuditAreaFilter] ?? entry.area,
  },
  action: { getValue: (entry) => entry.action },
  actor: { getValue: (entry) => `${entry.actorType} ${entry.actorId}`.trim() },
  entity: {
    getValue: (entry) => `${entry.entityType} ${entry.entityId}`.trim(),
  },
  seq: {
    getValue: (entry) => entry.sequence,
    kind: "number",
    defaultDirection: "desc",
  },
};

type AuditFiltersState = {
  area: AuditAreaFilter;
  query: string;
  action: string;
  fromDate: string;
  toDate: string;
};

const AREA_BADGE_TONE: Record<
  string,
  "neutral" | "info" | "warning" | "success"
> = {
  auth: "warning",
  devices: "info",
  settings: "neutral",
  sync: "success",
};

function formatActivityLabel(value: string): string {
  const cleaned = value.trim().replaceAll(".", " ").replaceAll("_", " ");
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : value;
}

function formatActivityActor(actorType: string): string {
  const normalized = actorType.trim().toLowerCase();
  if (normalized === "owner") return "Property Manager";
  if (normalized === "system") return "Automatic";
  if (normalized === "public") return "Guest";
  return formatActivityLabel(actorType);
}

function buildQueryString(filters: AuditFiltersState): string {
  const params = new URLSearchParams();
  if (filters.area !== "all") params.set("area", filters.area);
  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.action.trim()) params.set("action", filters.action.trim());
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.toDate) params.set("toDate", filters.toDate);
  return params.toString();
}

export function AuditLogExplorer({
  initialEntries,
  initialFilters,
}: {
  initialEntries: AuditLogEntryDto[];
  initialFilters: AuditFiltersState;
}) {
  const [entries, setEntries] = useState<AuditLogEntryDto[]>(initialEntries);
  const [filters, setFilters] = useState<AuditFiltersState>(initialFilters);
  const [searchInput, setSearchInput] = useState<string>(
    initialFilters.query || initialFilters.action,
  );
  const [refreshTick, setRefreshTick] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const isFirstRender = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // Sync debounced free-text query without requiring a manual apply button.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = searchInput.trim();
      setFilters((prev) => {
        if (prev.query === normalized && prev.action === "") return prev;
        return { ...prev, query: normalized, action: "" };
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const qs = buildQueryString(filters);
    const nextUrl = qs ? `/audit?${qs}` : "/audit";
    try {
      window.history.replaceState(null, "", nextUrl);
    } catch {
      // Ignore restricted history updates.
    }

    async function load() {
      setUpdating(true);
      setErrorMessage("");
      try {
        const response = await fetch(`/api/audit${qs ? `?${qs}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as {
          entries?: AuditLogEntryDto[];
          error?: string;
        };
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setErrorMessage(
            data.error ?? "Could not load matching activity records.",
          );
          return;
        }
        if (Array.isArray(data.entries)) {
          setEntries(data.entries);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setErrorMessage(
          typeof navigator !== "undefined" && !navigator.onLine
            ? "You are offline. Reconnect to view activity history."
            : "Connection stopped while refreshing activity history.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setUpdating(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [filters, refreshTick]);

  const {
    sortedRows: sortedEntries,
    sortHeaderProps,
    sort,
  } = useTableSort(entries, AUDIT_SORT_COLUMNS, {
    key: "createdAt",
    direction: "desc",
  });

  const {
    paginatedRows: paginatedEntries,
    paginationProps: auditPaginationProps,
  } = useTablePagination(sortedEntries, {
    resetKey: `${filters.area}|${filters.query}|${filters.action}|${filters.fromDate}|${filters.toDate}|${sort?.key ?? ""}|${sort?.direction ?? ""}`,
  });

  const hasActiveFilters =
    filters.area !== "all" ||
    searchInput.trim() !== "" ||
    filters.fromDate !== "" ||
    filters.toDate !== "";

  function clearAllFilters() {
    setSearchInput("");
    setFilters({
      area: "all",
      query: "",
      action: "",
      fromDate: "",
      toDate: "",
    });
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1
            id="audit-heading"
            className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
          >
            Activity history
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Saved changes across settings, devices, and records shown in local
            time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            loading={updating}
            disabled={updating}
            onClick={() => setRefreshTick((tick) => tick + 1)}
          >
            {!updating && (
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 shrink-0"
              >
                <path d="M16.25 9.25A6.25 6.25 0 0 0 5.58 5.58L3.75 7.25" />
                <path d="M3.75 3.75v3.5h3.5" />
                <path d="M3.75 10.75a6.25 6.25 0 0 0 10.67 3.67l1.83-1.67" />
                <path d="M16.25 16.25v-3.5h-3.5" />
              </svg>
            )}
            <span>{updating ? "Refreshing…" : "Refresh"}</span>
          </Button>
        </div>
      </header>

      <SearchFilterBar
        updating={updating}
        hasActiveFilters={hasActiveFilters}
        onClearAll={clearAllFilters}
        aria-label="Find activity"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.7fr)_minmax(150px,0.9fr)_minmax(140px,0.8fr)_minmax(140px,0.8fr)]">
          <Field id="audit-search" label="Find activity">
            {(props) => (
              <SearchFilterInput
                {...props}
                value={searchInput}
                onValueChange={setSearchInput}
                placeholder="Search action, record, or reference"
              />
            )}
          </Field>

          <Field id="audit-area" label="Area">
            {(props) => (
              <Select
                {...props}
                variant="filter"
                value={filters.area}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    area: event.target.value as AuditAreaFilter,
                  }))
                }
              >
                {AUDIT_AREAS.map((area) => (
                  <option key={area} value={area}>
                    {AUDIT_AREA_LABELS[area]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="audit-from" label="From date">
            {(props) => (
              <DatePicker
                {...props}
                value={filters.fromDate}
                onValueChange={(next) =>
                  setFilters((prev) => ({
                    ...prev,
                    fromDate: next,
                  }))
                }
              />
            )}
          </Field>

          <Field id="audit-to" label="To date">
            {(props) => (
              <DatePicker
                {...props}
                value={filters.toDate}
                onValueChange={(next) =>
                  setFilters((prev) => ({
                    ...prev,
                    toDate: next,
                  }))
                }
              />
            )}
          </Field>
        </div>

        {errorMessage && (
          <Alert tone="danger" role="alert">
            {errorMessage}
          </Alert>
        )}
      </SearchFilterBar>

      {updating ? (
        <TableCardSkeleton rows={6} columns={4} />
      ) : entries.length === 0 ? (
        <EmptyState
          aria-labelledby="audit-empty-title"
          className="items-center justify-items-center py-12 text-center"
        >
          <Image
            src="/illustrations/document-search.svg"
            alt=""
            width={799}
            height={618}
            unoptimized
            aria-hidden="true"
            className="h-auto w-36 select-none sm:w-44"
          />
          <div className="grid justify-items-center gap-1.5">
            <EmptyStateTitle id="audit-empty-title">
              {hasActiveFilters
                ? "No matching activity"
                : "No activity recorded yet"}
            </EmptyStateTitle>
            <EmptyStateDescription>
              {hasActiveFilters
                ? "Clear your search or choose a wider date range."
                : "Saved changes to your property settings and records appear here without showing private details."}
            </EmptyStateDescription>
          </div>
          {hasActiveFilters && (
            <EmptyStateActions>
              <Button variant="secondary" size="sm" onClick={clearAllFilters}>
                Clear
              </Button>
            </EmptyStateActions>
          )}
        </EmptyState>
      ) : (
        <section
          aria-labelledby="audit-table-heading"
          className="overflow-hidden rounded-panel border border-border bg-surface"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
            <div className="grid gap-0.5">
              <h2
                id="audit-table-heading"
                className="text-sm font-semibold text-foreground"
              >
                Recorded changes
              </h2>
              <p className="text-xs text-muted-foreground">
                Viewing pages does not add items here. Only saved changes are
                recorded.
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {entries.length} {entries.length === 1 ? "row" : "rows"}
            </span>
          </div>

          <ul className="divide-y divide-border md:hidden">
            {paginatedEntries.map((entry) => (
              <li key={entry.id} className="grid gap-2.5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={AREA_BADGE_TONE[entry.area] ?? "neutral"}>
                    {AUDIT_AREA_LABELS[
                      entry.area as keyof typeof AUDIT_AREA_LABELS
                    ] ?? entry.area}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatManilaDateTime(new Date(entry.createdAt))}
                  </span>
                </div>
                <p className="text-xs font-medium text-foreground">
                  {formatActivityLabel(entry.action)}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="grid gap-0.5">
                    <span>{formatActivityActor(entry.actorType)}</span>
                    <span>{formatActivityLabel(entry.entityType)}</span>
                  </div>
                  {entry.sequence && (
                    <span className="tabular-nums">#{entry.sequence}</span>
                  )}
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {entry.entityId}
                </p>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead {...sortHeaderProps("createdAt")}>
                    Date &amp; time
                  </TableHead>
                  <TableHead {...sortHeaderProps("area")}>Area</TableHead>
                  <TableHead {...sortHeaderProps("action")}>
                    What changed
                  </TableHead>
                  <TableHead {...sortHeaderProps("actor")}>Who</TableHead>
                  <TableHead {...sortHeaderProps("entity")}>Record</TableHead>
                  <TableHead numeric {...sortHeaderProps("seq")}>
                    #
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatManilaDateTime(new Date(entry.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Badge tone={AREA_BADGE_TONE[entry.area] ?? "neutral"}>
                        {AUDIT_AREA_LABELS[
                          entry.area as keyof typeof AUDIT_AREA_LABELS
                        ] ?? entry.area}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-foreground">
                      {formatActivityLabel(entry.action)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatActivityActor(entry.actorType)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="text-foreground">
                        {formatActivityLabel(entry.entityType)}
                      </span>
                      {": "}
                      <span className="font-mono break-all">
                        {entry.entityId}
                      </span>
                    </TableCell>
                    <TableCell
                      numeric
                      className="text-xs text-muted-foreground tabular-nums"
                    >
                      {entry.sequence ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            {...auditPaginationProps}
            label="Activity history pagination"
          />
        </section>
      )}
    </div>
  );
}
