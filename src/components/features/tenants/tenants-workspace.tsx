"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
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
  archiveTenantAction,
  restoreTenantAction,
} from "@/features/tenants/actions";
import type {
  TenantAssignmentDto,
  TenantDto,
  TenantListItemDto,
  TenantsOverviewDto,
} from "@/features/tenants/schemas";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import {
  AssignBedDialog,
  CreateTenantDialog,
  EditTenantDialog,
  MoveOutAssignmentDialog,
} from "./tenant-dialogs";

type TenantViewFilter =
  "active" | "occupied" | "unassigned" | "archived" | "all";

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
}: {
  initialOverview: TenantsOverviewDto;
}) {
  const [overview, setOverview] = useState<TenantsOverviewDto>(initialOverview);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<TenantViewFilter>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantDto | null>(null);
  const [assigningTenant, setAssigningTenant] = useState<TenantDto | null>(
    null,
  );
  const [movingOutTarget, setMovingOutTarget] = useState<{
    assignment: TenantAssignmentDto;
    tenantName: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  async function reloadTenants() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/tenants", { cache: "no-store" });
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: "Could not refresh tenant directory right now.",
        });
        return;
      }
      const fresh = (await response.json()) as TenantsOverviewDto;
      setOverview(fresh);
    } catch {
      setFeedback({
        tone: "danger",
        message: "Connect to the internet to refresh tenants.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function handleArchiveRestore(tenant: TenantListItemDto) {
    if (rowPendingId) return;
    setFeedback(null);
    setRowPendingId(tenant.id);
    startTransition(async () => {
      try {
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
          setFeedback({ tone: "success", message: res.message });
          await reloadTenants();
        } else if (res.status === "error") {
          setFeedback({ tone: "danger", message: res.message });
        }
      } finally {
        setRowPendingId(null);
      }
    });
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredTenants = overview.tenants.filter((tenant) => {
    const isArchived = tenant.archivedAt !== null;
    if (viewFilter === "active" && isArchived) return false;
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

  const hasFilters = normalizedQuery !== "" || viewFilter !== "active";

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Tenants
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage boarder profiles, bed move-ins, and move-out history across
            your boarding house.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            className="border-border bg-surface text-foreground hover:bg-surface-muted"
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
          label="Assigned a bed"
          value={assignedCount}
          tone="info"
          description="Tenants with an active bed assignment"
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
          description="Active profiles awaiting bed placement"
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
        title="Filter tenants"
        resultCountText={`${filteredTenants.length} ${
          filteredTenants.length === 1 ? "tenant" : "tenants"
        } shown`}
        hasActiveFilters={hasFilters}
        onClearAll={() => {
          setSearchQuery("");
          setViewFilter("active");
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="grid min-w-0 gap-2 md:col-span-2">
            <label
              htmlFor="tenants-search"
              className="text-sm font-medium leading-5 text-foreground"
            >
              Search tenants
            </label>
            <SearchFilterInput
              id="tenants-search"
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Name, phone, email, room or bed number"
            />
          </div>

          <Field id="tenants-view-filter" label="Status view">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                value={viewFilter}
                onChange={(e) =>
                  setViewFilter(e.target.value as TenantViewFilter)
                }
              >
                <option value="active">Active tenants</option>
                <option value="occupied">Assigned a bed</option>
                <option value="unassigned">Unassigned only</option>
                <option value="archived">Archived tenants</option>
                <option value="all">All records</option>
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
                ? "Add a boarder profile to assign a room and bed, track move-in dates, and calculate balances."
                : "Try adjusting your status filter or searching a different name or room number."}
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
                  setViewFilter("active");
                }}
              >
                Clear filters
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

          {/* Mobile card layout (360 px baseline) */}
          <div className="grid divide-y divide-border md:hidden">
            {filteredTenants.map((tenant) => {
              const assignment = tenant.activeAssignment;
              const isArchived = tenant.archivedAt !== null;
              const busy = rowPendingId === tenant.id;
              return (
                <div key={tenant.id} className="grid gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid gap-0.5">
                      <Link
                        href={`/tenants/${tenant.id}`}
                        className="text-sm font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                      >
                        {tenant.fullName}
                      </Link>
                      {(tenant.phone || tenant.email) && (
                        <span className="text-xs text-muted-foreground">
                          {[tenant.phone, tenant.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </div>
                    {isArchived ? (
                      <Badge tone="neutral">Archived</Badge>
                    ) : assignment ? (
                      <Badge tone="info">
                        Rm {assignment.roomNumber} · {assignment.bedNumber}
                      </Badge>
                    ) : (
                      <Badge tone="warning">Unassigned</Badge>
                    )}
                  </div>

                  {assignment && (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatManilaDate(assignment.startDateManila)} –{" "}
                      {formatManilaDate(assignment.endDateManila)} ·{" "}
                      {formatPhpCurrency(assignment.monthlyRate)}/mo
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {!isArchived && !assignment && (
                      <Button
                        size="sm"
                        onClick={() => setAssigningTenant(tenant)}
                      >
                        Assign bed
                      </Button>
                    )}
                    {!isArchived && assignment && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setMovingOutTarget({
                            assignment,
                            tenantName: tenant.fullName,
                          })
                        }
                      >
                        Move out
                      </Button>
                    )}
                    <Link
                      href={`/tenants/${tenant.id}`}
                      className={buttonClasses({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      Profile
                    </Link>
                    {!isArchived && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTenant(tenant)}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy}
                      disabled={!isArchived && Boolean(assignment)}
                      onClick={() => handleArchiveRestore(tenant)}
                    >
                      {isArchived ? "Restore" : "Archive"}
                    </Button>
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
                  <TableHead>Tenant</TableHead>
                  <TableHead>Room &amp; bed</TableHead>
                  <TableHead>Stay dates (Manila)</TableHead>
                  <TableHead numeric>Monthly rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant) => {
                  const assignment = tenant.activeAssignment;
                  const isArchived = tenant.archivedAt !== null;
                  const busy = rowPendingId === tenant.id;
                  return (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <Link
                          href={`/tenants/${tenant.id}`}
                          className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          {tenant.fullName}
                        </Link>
                        {(tenant.phone || tenant.email) && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {[tenant.phone, tenant.email]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {assignment ? (
                          <div>
                            <div className="font-medium">
                              Room {assignment.roomNumber} · Bed{" "}
                              {assignment.bedNumber}
                            </div>
                            {assignment.bedLabel && (
                              <div className="text-xs text-muted-foreground">
                                {assignment.bedLabel}
                              </div>
                            )}
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
                        {isArchived ? (
                          <Badge tone="neutral">Archived</Badge>
                        ) : assignment ? (
                          <Badge tone="info">Active stay</Badge>
                        ) : (
                          <Badge tone="warning">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {!isArchived && !assignment && (
                            <Button
                              size="sm"
                              onClick={() => setAssigningTenant(tenant)}
                            >
                              Assign bed
                            </Button>
                          )}
                          {!isArchived && assignment && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                setMovingOutTarget({
                                  assignment,
                                  tenantName: tenant.fullName,
                                })
                              }
                            >
                              Move out
                            </Button>
                          )}
                          {!isArchived && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setEditingTenant(tenant)}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={isArchived ? "secondary" : "ghost"}
                            loading={busy}
                            disabled={!isArchived && Boolean(assignment)}
                            onClick={() => handleArchiveRestore(tenant)}
                          >
                            {isArchived ? "Restore" : "Archive"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <CreateTenantDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={async (message) => {
          setFeedback({ tone: "success", message });
          await reloadTenants();
        }}
      />

      <EditTenantDialog
        tenant={editingTenant}
        onClose={() => setEditingTenant(null)}
        onSaved={async (message) => {
          setFeedback({ tone: "success", message });
          await reloadTenants();
        }}
      />

      <AssignBedDialog
        tenant={assigningTenant}
        beds={overview.assignableBeds}
        onClose={() => setAssigningTenant(null)}
        onSaved={async (message) => {
          setFeedback({ tone: "success", message });
          await reloadTenants();
        }}
      />

      <MoveOutAssignmentDialog
        assignment={movingOutTarget?.assignment ?? null}
        tenantName={movingOutTarget?.tenantName ?? "tenant"}
        onClose={() => setMovingOutTarget(null)}
        onSaved={async (message) => {
          setFeedback({ tone: "success", message });
          await reloadTenants();
        }}
      />
    </div>
  );
}
