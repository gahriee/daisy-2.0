"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
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
import { Input } from "@/components/ui/input";
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
import {
  AUDIT_AREA_LABELS,
  AUDIT_AREAS,
  type AuditAreaFilter,
  type AuditLogEntryDto,
} from "@/features/audit/schemas";
import { formatManilaDateTime } from "@/lib/dates";

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
          setErrorMessage(data.error ?? "Could not filter audit entries.");
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
            ? "Offline: reconnecting is required to query server audit logs."
            : "Connection interrupted while updating audit logs.",
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
            Audit log
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Identifier-only activity across settings, devices, and records in
            Asia/Manila time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            loading={updating}
            disabled={updating}
            onClick={() => setRefreshTick((tick) => tick + 1)}
            className="border-border bg-surface text-foreground hover:bg-surface-muted active:bg-surface-muted"
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
        title="Filter activity"
        resultCountText={`${entries.length} matching ${entries.length === 1 ? "record" : "records"} (max 50)`}
        updating={updating}
        hasActiveFilters={hasActiveFilters}
        onClearAll={clearAllFilters}
        aria-label="Dynamic audit log search and filters"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.7fr)_minmax(150px,0.9fr)_minmax(140px,0.8fr)_minmax(140px,0.8fr)]">
          <Field id="audit-search" label="Search action, entity, actor, or ID">
            {(props) => (
              <SearchFilterInput
                {...props}
                value={searchInput}
                onValueChange={setSearchInput}
                placeholder="e.g. settings.updated, device, owner"
              />
            )}
          </Field>

          <Field id="audit-area" label="Area">
            {(props) => (
              <Select
                {...props}
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

          <Field id="audit-from" label="From date (Manila)">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={filters.fromDate}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    fromDate: event.target.value,
                  }))
                }
              />
            )}
          </Field>

          <Field id="audit-to" label="To date (Manila)">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={filters.toDate}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    toDate: event.target.value,
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

      {entries.length === 0 ? (
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
                ? "No matching audit entries"
                : "No audit entries recorded yet"}
            </EmptyStateTitle>
            <EmptyStateDescription>
              {hasActiveFilters
                ? "Try clearing your search or broadening the Manila date range."
                : "Saved property settings and domain mutations appear here without exposing personal details."}
            </EmptyStateDescription>
          </div>
          {hasActiveFilters && (
            <EmptyStateActions>
              <Button variant="secondary" size="sm" onClick={clearAllFilters}>
                Clear filters
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
                Recorded activity
              </h2>
              <p className="text-xs text-muted-foreground">
                Read and filter requests never generate audit entries.
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {entries.length} {entries.length === 1 ? "row" : "rows"}
            </span>
          </div>

          <ul className="grid gap-3 p-3 md:hidden">
            {entries.map((entry) => (
              <li key={entry.id}>
                <Card className="grid gap-2.5 p-4">
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
                  <p className="font-mono text-xs font-medium text-foreground">
                    {entry.action}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {entry.actorType} · {entry.entityType}
                    </span>
                    {entry.sequence && (
                      <span className="font-mono tabular-nums">
                        #{entry.sequence}
                      </span>
                    )}
                  </div>
                  <p className="truncate rounded-control bg-background px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
                    {entry.entityId}
                  </p>
                </Card>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <tr>
                  <TableHead>Timestamp (Manila)</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Entity &amp; record ID</TableHead>
                  <TableHead numeric>Seq</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
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
                    <TableCell className="font-mono text-xs font-medium text-foreground">
                      {entry.action}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.actorType}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <span className="text-foreground">
                        {entry.entityType}
                      </span>
                      {": "}
                      <span className="break-all">{entry.entityId}</span>
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {entry.sequence ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
