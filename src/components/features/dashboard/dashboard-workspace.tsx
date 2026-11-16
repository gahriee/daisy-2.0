"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { ApexOptions } from "apexcharts";
import {
  OfflineSnapshotBanner,
  useOfflineSnapshotState,
} from "@/components/features/offline/offline-vault-unlock";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ApexChart,
  ChartCard,
  DAISY_CHART_COLORS,
  formatChartPhp,
  formatCompactPhpAxis,
  toChartPhpNumber,
} from "@/components/ui/chart";
import { TableEmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Table,
  TableBody,
  TableCardHeader,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBillingPeriodLabel } from "@/features/billing/calculations";
import { INVOICE_STATUS_LABELS } from "@/features/billing/schemas";
import { computeOpenCurrentBalance } from "@/features/dashboard/calculations";
import {
  getDashboardAreaLabel,
  type DashboardSnapshotDto,
} from "@/features/dashboard/schemas";
import { TRANSIENT_RESERVATION_STATUS_LABELS } from "@/features/transients/schemas";
import { formatManilaDate, formatManilaDateTime } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import { loadDashboardSnapshotFromVault } from "@/offline/snapshot-selectors-extra";

const MAX_MINIMAL_ROWS = 5;

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

function BoardingIcon() {
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
      <path d="M3.5 19.5V7.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v12" />
      <path d="M3.5 13.5h17" />
      <path d="M7.5 10.25h3.25" />
      <path d="M13.25 10.25h3.25" />
      <path d="M3.5 19.5h17" />
    </svg>
  );
}

function TransientIcon() {
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
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3.5M16 3.5v3.5M3.5 10h17" />
      <path d="m9.25 15 2 2 3.75-3.75" />
    </svg>
  );
}

function ReceivablesIcon() {
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
      <path d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z" />
      <circle cx="12" cy="12" r="2.25" />
    </svg>
  );
}

function CollectionsIcon() {
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
      <path d="M12 3.5v17" />
      <path d="M16 7.25c0-1.5-1.8-2.5-4-2.5s-4 1-4 2.5 1.8 2.35 4 2.75 4 1.25 4 2.75-1.8 2.5-4 2.5-4-1-4-2.5" />
    </svg>
  );
}

type CurrentBookingRow = {
  key: string;
  category: string;
  tone: "info" | "warning" | "success" | "neutral";
  person: string;
  roomLabel: string;
  detail: string;
  href: string;
};

function buildCurrentBookingRows(
  snapshot: DashboardSnapshotDto,
): CurrentBookingRow[] {
  const rows: CurrentBookingRow[] = [];

  for (const req of snapshot.staysToday.pendingBookingRequestsList) {
    rows.push({
      key: `request-${req.id}`,
      category: "Pending request",
      tone: "info",
      person: req.guestName,
      roomLabel: `Room ${req.roomNumber}`,
      detail: `${formatManilaDate(req.checkInDateManila)} (${req.nights} ${req.nights === 1 ? "night" : "nights"})`,
      href: `/transients/requests/${req.id}`,
    });
  }

  for (const stay of snapshot.staysToday.transientCheckInsToday) {
    rows.push({
      key: `checkin-${stay.id}`,
      category: "Check-in today",
      tone: stay.status === "CHECKED_IN" ? "success" : "info",
      person: stay.guestName,
      roomLabel: `Room ${stay.roomNumber}`,
      detail: `${TRANSIENT_RESERVATION_STATUS_LABELS[stay.status]} (${stay.nights} ${stay.nights === 1 ? "night" : "nights"})`,
      href: "/transients",
    });
  }

  for (const stay of snapshot.staysToday.transientCheckOutsToday) {
    rows.push({
      key: `checkout-${stay.id}`,
      category: "Check-out today",
      tone: stay.status === "CHECKED_OUT" ? "neutral" : "warning",
      person: stay.guestName,
      roomLabel: `Room ${stay.roomNumber}`,
      detail: `${TRANSIENT_RESERVATION_STATUS_LABELS[stay.status]} (${formatPhpCurrency(stay.totalAmount)})`,
      href: "/transients",
    });
  }

  for (const moveIn of snapshot.staysToday.boardingMoveInsToday) {
    rows.push({
      key: `movein-${moveIn.id}`,
      category: "Boarder move-in",
      tone: "success",
      person: moveIn.tenantName,
      roomLabel: `Room ${moveIn.roomNumber}`,
      detail: `Lease ends ${formatManilaDate(moveIn.endDateManila)}`,
      href: `/tenants/${moveIn.tenantId}`,
    });
  }

  for (const ending of snapshot.staysToday.boardingEndingSoon) {
    if (ending.daysRemaining > 1) continue;
    const overdueEnd = ending.daysRemaining < 0;
    const dueToday = ending.daysRemaining === 0;
    rows.push({
      key: `ending-${ending.id}`,
      category: overdueEnd
        ? "Past end date"
        : dueToday
          ? "Ends today"
          : "Ends tomorrow",
      tone: overdueEnd || dueToday ? "warning" : "info",
      person: ending.tenantName,
      roomLabel: `Room ${ending.roomNumber}`,
      detail: overdueEnd
        ? `Ended ${formatManilaDate(ending.endDateManila)}`
        : dueToday
          ? "Scheduled move-out today"
          : `Ends ${formatManilaDate(ending.endDateManila)}`,
      href: `/tenants/${ending.tenantId}`,
    });
  }

  return rows;
}

export function DashboardWorkspace({
  initialSnapshot,
  offlineMode = false,
  initialLastSyncedAt = null,
}: {
  initialSnapshot: DashboardSnapshotDto;
  offlineMode?: boolean;
  initialLastSyncedAt?: string | null;
}) {
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const {
    data: snapshot,
    online,
    lastSyncedAt,
    pendingCount,
    needsAttentionCount,
    reload,
  } = useOfflineSnapshotState<DashboardSnapshotDto>({
    initialData: initialSnapshot,
    offlineMode,
    initialLastSyncedAt,
    loadFromVault: async (db, key) => {
      const res = await loadDashboardSnapshotFromVault(db, key);
      return { data: res.snapshot, lastSyncedAt: res.lastSyncedAt };
    },
    fetchOnline: async () => {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          body?.message ?? "Could not refresh the dashboard snapshot.",
        );
      }
      return (await res.json()) as DashboardSnapshotDto;
    },
  });

  function handleRefresh() {
    setRefreshError(null);
    startRefresh(async () => {
      try {
        await reload();
      } catch (error) {
        setRefreshError(
          error instanceof Error
            ? `${error.message} Showing the last loaded snapshot.`
            : "Could not refresh the dashboard snapshot. Showing the last loaded snapshot.",
        );
      }
    });
  }

  const { boarding, transient } = snapshot.occupancy;
  const totalRoomsAll = boarding.totalRooms + transient.totalRooms;
  const totalOccupiedAll = boarding.occupiedRooms + transient.occupiedRooms;

  const currentBookings = buildCurrentBookingRows(snapshot);
  const visibleBookings = currentBookings.slice(0, MAX_MINIMAL_ROWS);

  const visibleInvoices = snapshot.billing.dueAndOverdueInvoices.slice(
    0,
    MAX_MINIMAL_ROWS,
  );

  const boardingOccupancyValue =
    boarding.occupancyPercent === null
      ? "—"
      : `${boarding.occupiedRooms} / ${boarding.totalRooms}`;
  const boardingOccupancyDescription =
    boarding.occupancyPercent === null
      ? "No active boarding rooms yet"
      : `${boarding.occupancyPercent}% occupied (${boarding.availableRooms} available, ${boarding.maintenanceRooms} maintenance)`;

  const transientOccupancyValue =
    transient.occupancyPercent === null
      ? "—"
      : `${transient.occupiedRooms} / ${transient.totalRooms}`;
  const transientOccupancyDescription =
    transient.occupancyPercent === null
      ? "No active transient rooms yet"
      : `${transient.occupancyPercent}% occupied (${transient.publishedRooms} published, ${snapshot.staysToday.pendingBookingRequests} pending requests)`;

  const openCurrentBalance = computeOpenCurrentBalance(
    snapshot.billing.openBalance,
    snapshot.billing.overdueBalance,
  );

  const occupancySeries = useMemo(
    () => [
      {
        name: "Occupied",
        data: [boarding.occupiedRooms, transient.occupiedRooms],
      },
      {
        name: "Available",
        data: [boarding.availableRooms, transient.availableRooms],
      },
      {
        name: "Maintenance",
        data: [boarding.maintenanceRooms, transient.maintenanceRooms],
      },
    ],
    [
      boarding.availableRooms,
      boarding.maintenanceRooms,
      boarding.occupiedRooms,
      transient.availableRooms,
      transient.maintenanceRooms,
      transient.occupiedRooms,
    ],
  );

  const occupancyOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [
        DAISY_CHART_COLORS.info,
        DAISY_CHART_COLORS.success,
        DAISY_CHART_COLORS.warning,
      ],
      chart: {
        stacked: true,
      },
      plotOptions: {
        bar: {
          horizontal: true,
          barHeight: "52%",
          borderRadius: 4,
          borderRadiusApplication: "end",
        },
      },
      stroke: {
        width: 1,
        colors: ["#ffffff"],
      },
      xaxis: {
        categories: ["Boarding House", "Transient Building"],
        labels: {
          formatter: (val) => `${Math.round(Number(val))}`,
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: DAISY_CHART_COLORS.charcoal,
            fontWeight: 500,
            fontSize: "12px",
          },
        },
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => (val > 0 ? `${val}` : ""),
      },
      legend: {
        position: "top",
        horizontalAlign: "left",
      },
      tooltip: {
        y: {
          formatter: (val: number) => `${val} ${val === 1 ? "room" : "rooms"}`,
        },
      },
    }),
    [],
  );

  const cashComparisonValues = useMemo(
    () => [
      toChartPhpNumber(snapshot.billing.collectedPreviousMonth),
      toChartPhpNumber(snapshot.billing.collectedThisMonth),
      toChartPhpNumber(openCurrentBalance),
      toChartPhpNumber(snapshot.billing.overdueBalance),
    ],
    [
      openCurrentBalance,
      snapshot.billing.collectedPreviousMonth,
      snapshot.billing.collectedThisMonth,
      snapshot.billing.overdueBalance,
    ],
  );

  const hasFinancialTotals = cashComparisonValues.some((val) => val !== 0);

  const cashComparisonSeries = useMemo(
    () => [
      {
        name: "Amount (PHP)",
        data: cashComparisonValues,
      },
    ],
    [cashComparisonValues],
  );

  const cashComparisonOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [
        DAISY_CHART_COLORS.slate,
        DAISY_CHART_COLORS.success,
        DAISY_CHART_COLORS.info,
        DAISY_CHART_COLORS.danger,
      ],
      plotOptions: {
        bar: {
          distributed: true,
          columnWidth: "48%",
          borderRadius: 4,
          borderRadiusApplication: "end",
        },
      },
      legend: {
        show: false,
      },
      dataLabels: {
        enabled: false,
      },
      xaxis: {
        categories: [
          formatBillingPeriodLabel(snapshot.billing.previousMonthKey),
          formatBillingPeriodLabel(snapshot.currentMonthKey),
          "Open current",
          "Overdue",
        ],
        labels: {
          style: {
            colors: DAISY_CHART_COLORS.charcoal,
            fontSize: "12px",
          },
        },
      },
      yaxis: {
        labels: {
          formatter: (val: number) => formatCompactPhpAxis(val),
        },
      },
      tooltip: {
        y: {
          formatter: (val: number) => formatChartPhp(val),
        },
      },
    }),
    [snapshot.billing.previousMonthKey, snapshot.currentMonthKey],
  );

  const latestActivity = snapshot.recentActivity[0] ?? null;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Property overview
          </h1>
          <p className="text-sm leading-6 text-muted-foreground tabular-nums">
            Snapshot as of {formatManilaDateTime(new Date(snapshot.snapshotAt))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            onClick={handleRefresh}
          >
            {!refreshing && <RefreshIcon />}
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>
          <Link
            href="/billing/new"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Create invoice
          </Link>
          <Link
            href="/payments/new"
            className={buttonClasses({ variant: "primary", size: "md" })}
          >
            Record payment
          </Link>
        </div>
      </header>

      <OfflineSnapshotBanner
        online={online}
        offlineMode={offlineMode}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        needsAttentionCount={needsAttentionCount}
        syncing={refreshing}
        onSyncNow={handleRefresh}
      />

      {(!snapshot.configuration.policiesConfigured ||
        !snapshot.configuration.stayScheduleConfigured) && (
        <Alert tone="warning" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-0.5">
              <span className="font-medium">
                Workspace setup needs attention
              </span>
              <span className="text-xs sm:text-sm">
                {!snapshot.configuration.policiesConfigured &&
                !snapshot.configuration.stayScheduleConfigured
                  ? "Configure billing & receipt policies and standard stay check-in/check-out times before running monthly billing or transient stays."
                  : !snapshot.configuration.policiesConfigured
                    ? "Configure billing & receipt policies before running monthly billing or recording payments."
                    : "Configure standard stay check-in and check-out times for transient turnovers."}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!snapshot.configuration.policiesConfigured && (
                <Link
                  href="/settings/policies"
                  className={buttonClasses({
                    variant: "secondary",
                    size: "sm",
                  })}
                >
                  Billing policies
                </Link>
              )}
              {!snapshot.configuration.stayScheduleConfigured && (
                <Link
                  href="/settings/operations"
                  className={buttonClasses({
                    variant: "secondary",
                    size: "sm",
                  })}
                >
                  Stay schedule
                </Link>
              )}
            </div>
          </div>
        </Alert>
      )}

      {refreshError && (
        <Alert tone="danger" role="alert">
          {refreshError}
        </Alert>
      )}

      <section
        aria-label="Live operational KPIs"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="Boarding occupancy"
          value={boardingOccupancyValue}
          description={boardingOccupancyDescription}
          icon={<BoardingIcon />}
          tone={boarding.occupancyPercent === null ? "muted" : "neutral"}
        />
        <MetricCard
          label="Transient occupancy"
          value={transientOccupancyValue}
          description={transientOccupancyDescription}
          icon={<TransientIcon />}
          tone={
            transient.occupancyPercent === null
              ? "muted"
              : snapshot.staysToday.pendingBookingRequests > 0
                ? "info"
                : "neutral"
          }
        />
        <MetricCard
          label="Open receivables"
          value={formatPhpCurrency(snapshot.billing.openBalance)}
          description={
            snapshot.billing.overdueInvoiceCount > 0
              ? `${snapshot.billing.openInvoiceCount} open (${snapshot.billing.overdueInvoiceCount} overdue totaling ${formatPhpCurrency(snapshot.billing.overdueBalance)})`
              : `${snapshot.billing.openInvoiceCount} open (${snapshot.billing.dueSoonInvoiceCount} due within 7 days)`
          }
          icon={<ReceivablesIcon />}
          tone={
            snapshot.billing.overdueInvoiceCount > 0 ? "warning" : "neutral"
          }
        />
        <MetricCard
          label={`Collected (${formatBillingPeriodLabel(snapshot.currentMonthKey)})`}
          value={formatPhpCurrency(snapshot.billing.collectedThisMonth)}
          description={`Prior month (${formatBillingPeriodLabel(snapshot.billing.previousMonthKey)}): ${formatPhpCurrency(snapshot.billing.collectedPreviousMonth)}`}
          icon={<CollectionsIcon />}
          tone={snapshot.maintenance.urgentCount > 0 ? "warning" : "success"}
        />
      </section>

      <section
        aria-label="Current status comparisons"
        className="grid grid-cols-1 gap-5 xl:grid-cols-2"
      >
        <ChartCard
          title="Occupancy by building"
          description="Live occupied, available, and maintenance room counts."
          summary={`${totalOccupiedAll} of ${totalRoomsAll} occupied`}
          actions={
            <Link
              href="/reports"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Analytics
            </Link>
          }
        >
          {totalRoomsAll === 0 ? (
            <TableEmptyState
              illustration="sweet-home"
              illustrationSize="xs"
              title="No active rooms yet"
              description="Add boarding or transient rooms to compare building occupancy here."
            />
          ) : (
            <ApexChart
              type="bar"
              height={240}
              series={occupancySeries}
              options={occupancyOptions}
              ariaLabel="Stacked bar chart comparing occupied, available, and maintenance rooms across Boarding House and Transient Building"
            />
          )}
        </ChartCard>

        <ChartCard
          title="Collections & receivables"
          description="Recent monthly collections compared with current and overdue open balances."
          summary={`${snapshot.billing.overdueInvoiceCount} overdue`}
          actions={
            <Link
              href="/reports"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Reports
            </Link>
          }
        >
          {!hasFinancialTotals ? (
            <TableEmptyState
              illustration="document-search"
              illustrationSize="xs"
              title="No billing or collection totals yet"
              description="Issued invoices and recorded payments will populate this comparison."
            />
          ) : (
            <ApexChart
              type="bar"
              height={240}
              series={cashComparisonSeries}
              options={cashComparisonOptions}
              ariaLabel="Bar chart comparing prior month collections, current month collections, open current receivables, and overdue balances"
            />
          )}
        </ChartCard>
      </section>

      <section
        aria-label="What is happening today"
        className="grid grid-cols-1 gap-5 xl:grid-cols-2"
      >
        <Card className="overflow-hidden p-0 sm:p-0">
          <TableCardHeader
            title="Today's bookings & stays"
            count={`${currentBookings.length} ${currentBookings.length === 1 ? "item" : "items"}`}
            actions={
              <Link
                href="/transients"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Transients
              </Link>
            }
          />
          {visibleBookings.length === 0 ? (
            <TableEmptyState
              illustration="sweet-home"
              illustrationSize="xs"
              title="No bookings or turnovers today"
              description="Pending public booking requests, today's arrivals, check-outs, and move-ins appear here."
            />
          ) : (
            <>
              <div className="grid divide-y divide-border md:hidden">
                {visibleBookings.map((item) => (
                  <div key={item.key} className="grid gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid gap-0.5">
                        <span className="text-sm font-semibold text-foreground">
                          {item.person}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.roomLabel}
                        </span>
                      </div>
                      <Badge tone={item.tone}>{item.category}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {item.detail}
                      </span>
                      <Link
                        href={item.href}
                        className={buttonClasses({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <Table containerClassName="rounded-none border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guest or boarder</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleBookings.map((item) => (
                      <TableRow key={item.key}>
                        <TableCell>
                          <div className="grid gap-0.5">
                            <span className="font-medium text-foreground">
                              {item.person}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {item.detail}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {item.roomLabel}
                        </TableCell>
                        <TableCell>
                          <Badge tone={item.tone}>{item.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={item.href}
                            className={buttonClasses({
                              variant: "secondary",
                              size: "sm",
                            })}
                          >
                            Open
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Card>

        <Card className="overflow-hidden p-0 sm:p-0">
          <TableCardHeader
            title="Overdue & due invoices"
            count={
              snapshot.billing.overdueInvoiceCount > 0
                ? `${snapshot.billing.overdueInvoiceCount} overdue`
                : `${snapshot.billing.openInvoiceCount} open`
            }
            actions={
              <Link
                href="/billing"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Billing
              </Link>
            }
          />
          {visibleInvoices.length === 0 ? (
            <TableEmptyState
              illustration="document-search"
              illustrationSize="xs"
              title="No overdue or due invoices"
              description={
                snapshot.billing.draftInvoiceCount > 0
                  ? `${snapshot.billing.draftInvoiceCount} draft invoice(s) awaiting review in Billing.`
                  : "Overdue and upcoming issued invoices appear here."
              }
            />
          ) : (
            <>
              <div className="grid divide-y divide-border md:hidden">
                {visibleInvoices.map((inv) => (
                  <div key={inv.id} className="grid gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid gap-0.5">
                        <span className="font-mono text-xs font-medium text-foreground tabular-nums">
                          {inv.invoiceNumber ?? "Draft"}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {inv.payerName}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Due {formatManilaDate(inv.dueDateManila)}
                        </span>
                      </div>
                      <Badge tone={inv.isOverdue ? "danger" : "info"}>
                        {inv.isOverdue
                          ? "Overdue"
                          : INVOICE_STATUS_LABELS[inv.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {formatPhpCurrency(inv.balanceAmount)}
                      </span>
                      <Link
                        href={`/billing/${inv.id}`}
                        className={buttonClasses({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        Inspect
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <Table containerClassName="rounded-none border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Payer</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead numeric>Balance</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <div className="grid gap-1">
                            <span className="font-mono text-xs font-medium text-foreground tabular-nums">
                              {inv.invoiceNumber ?? "Draft"}
                            </span>
                            <div>
                              <Badge tone={inv.isOverdue ? "danger" : "info"}>
                                {inv.isOverdue
                                  ? "Overdue"
                                  : INVOICE_STATUS_LABELS[inv.status]}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-0.5">
                            <span className="font-medium text-foreground">
                              {inv.payerName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {inv.payerKind === "TRANSIENT"
                                ? "Transient guest"
                                : "Boarder"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatManilaDate(inv.dueDateManila)}
                        </TableCell>
                        <TableCell numeric className="font-medium tabular-nums">
                          {formatPhpCurrency(inv.balanceAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/billing/${inv.id}`}
                            className={buttonClasses({
                              variant: "secondary",
                              size: "sm",
                            })}
                          >
                            Inspect
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Card>
      </section>

      <section
        aria-label="Live operational areas"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-3"
      >
        <Card className="flex flex-col justify-between gap-4 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="grid gap-1">
              <h2 className="text-sm font-semibold text-foreground">
                Maintenance &amp; holds
              </h2>
              <p className="text-xs text-muted-foreground tabular-nums">
                {snapshot.maintenance.openCount} open repairs
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {snapshot.maintenance.activeHoldCount} active room holds
              </p>
            </div>
            <Badge
              tone={
                snapshot.maintenance.urgentCount > 0 ||
                snapshot.maintenance.activeHoldCount > 0
                  ? "warning"
                  : snapshot.maintenance.openCount > 0
                    ? "info"
                    : "success"
              }
            >
              {snapshot.maintenance.urgentCount > 0
                ? `${snapshot.maintenance.urgentCount} urgent`
                : snapshot.maintenance.openCount > 0
                  ? "Open"
                  : "Clear"}
            </Badge>
          </div>
          <div>
            <Link
              href="/maintenance"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Open maintenance
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-4 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="grid gap-1">
              <h2 className="text-sm font-semibold text-foreground">
                Public booking queue
              </h2>
              <p className="text-xs text-muted-foreground tabular-nums">
                {snapshot.staysToday.pendingBookingRequests} awaiting approval
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {snapshot.staysToday.checkInsTodayCount} check-ins today
              </p>
            </div>
            <Badge
              tone={
                snapshot.staysToday.pendingBookingRequests > 0
                  ? "info"
                  : "neutral"
              }
            >
              {snapshot.staysToday.pendingBookingRequests > 0
                ? "Needs review"
                : "Up to date"}
            </Badge>
          </div>
          <div>
            <Link
              href="/transients"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Review transients
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-4 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="grid gap-1">
              <h2 className="text-sm font-semibold text-foreground">
                Notices &amp; recent audit
              </h2>
              <p className="text-xs text-muted-foreground tabular-nums">
                {snapshot.notices.activeCount} active notices today
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {latestActivity
                  ? `${getDashboardAreaLabel(latestActivity.area)}: ${latestActivity.action}`
                  : "No recorded activity yet"}
              </p>
            </div>
            <Badge tone={snapshot.notices.activeCount > 0 ? "info" : "neutral"}>
              {snapshot.notices.activeCount} active
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/notices"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Notices
            </Link>
            <Link
              href="/audit"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Audit log
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
