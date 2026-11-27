"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ApexOptions } from "apexcharts";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ApexChart,
  ChartCard,
  DAISY_CHART_COLORS,
} from "@/components/ui/chart";
import { TableEmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Table,
  TableBody,
  TableCardHeader,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  computeMoneyRatioPercent,
  computeSharePercent,
} from "@/features/reports/calculations";
import type {
  MaintenanceCategorySummaryDto,
  ReportsOverviewDto,
} from "@/features/reports/schemas";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatPhpCurrency } from "@/lib/money";
import type { SortColumnDef } from "@/lib/table-sort";

const MAINT_CATEGORY_SORT_COLUMNS: Record<
  "category" | "total" | "open" | "holds" | "resolved",
  SortColumnDef<MaintenanceCategorySummaryDto>
> = {
  category: { getValue: (row) => row.categoryLabel },
  total: {
    getValue: (row) => row.totalCount,
    kind: "number",
    defaultDirection: "desc",
  },
  open: {
    getValue: (row) => row.openCount,
    kind: "number",
    defaultDirection: "desc",
  },
  holds: {
    getValue: (row) => row.activeHoldCount,
    kind: "number",
    defaultDirection: "desc",
  },
  resolved: {
    getValue: (row) => row.resolvedCount,
    kind: "number",
    defaultDirection: "desc",
  },
};

function MetricBuildingIcon() {
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
      <path d="M4 20h16" />
      <path d="M6 20V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v15" />
      <path d="M9.5 8.5h1.5M13 8.5h1.5M9.5 12.5h1.5M13 12.5h1.5" />
    </svg>
  );
}

function MetricLedgerIcon() {
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
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

function MetricWrenchIcon() {
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
      <path d="M14.7 6.3a4.5 4.5 0 0 0-5.4 5.4l-4.6 4.6a1.4 1.4 0 0 0 2 2l4.6-4.6a4.5 4.5 0 0 0 5.4-5.4l-2.3 2.3-2-2 2.3-2.3Z" />
    </svg>
  );
}

export function TransientRevenueReportPanel({
  overview,
  periodLabel,
}: {
  overview: ReportsOverviewDto;
  periodLabel: string;
}) {
  const { summary, byStatus } = overview.transientRevenue;

  const activeStatuses = useMemo(
    () => byStatus.filter((s) => s.staysCount > 0),
    [byStatus],
  );
  const statusSeries = useMemo(
    () => activeStatuses.map((s) => s.staysCount),
    [activeStatuses],
  );

  const statusOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [
        DAISY_CHART_COLORS.info,
        DAISY_CHART_COLORS.success,
        DAISY_CHART_COLORS.charcoal,
        DAISY_CHART_COLORS.warning,
        DAISY_CHART_COLORS.danger,
        DAISY_CHART_COLORS.slate,
      ],
      labels: activeStatuses.map((s) => s.statusLabel),
      stroke: { width: 2, colors: ["#ffffff"] },
      plotOptions: {
        pie: {
          donut: {
            size: "68%",
            labels: {
              show: true,
              name: {
                color: DAISY_CHART_COLORS.slate,
                fontSize: "12px",
                fontWeight: 500,
              },
              value: {
                show: true,
                color: DAISY_CHART_COLORS.charcoal,
                fontSize: "18px",
                fontWeight: 600,
                formatter: (val: string) => `${Math.round(Number(val))}`,
              },
              total: {
                show: true,
                label: "Stays",
                color: DAISY_CHART_COLORS.slate,
                formatter: () => `${summary.staysCount}`,
              },
            },
          },
        },
      },
      legend: {
        position: "bottom",
        horizontalAlign: "center",
      },
      tooltip: {
        y: {
          formatter: (val: number) => `${val} ${val === 1 ? "stay" : "stays"}`,
        },
      },
    }),
    [activeStatuses, summary.staysCount],
  );

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Gross stay revenue"
          value={formatPhpCurrency(summary.grossStayRevenue)}
          description={`${summary.totalNights} booked nights (${periodLabel})`}
          icon={<MetricLedgerIcon />}
          tone="info"
        />
        <MetricCard
          label="Average nightly rate"
          value={
            summary.averageDailyRate
              ? formatPhpCurrency(summary.averageDailyRate)
              : "—"
          }
          description={
            summary.averageNightsPerStay
              ? `Avg. ${summary.averageNightsPerStay} nights per stay`
              : "No active or completed stays"
          }
          icon={<MetricLedgerIcon />}
        />
        <MetricCard
          label="Collected"
          value={formatPhpCurrency(summary.collectedAmount)}
          description={
            summary.collectionRatePercent !== null
              ? `${summary.collectionRatePercent}% realized against stay total`
              : `Invoiced: ${formatPhpCurrency(summary.invoicedAmount)}`
          }
          icon={<MetricLedgerIcon />}
          tone="success"
        />
        <MetricCard
          label="Cancelled / No-show"
          value={`${summary.cancelledCount} / ${summary.noShowCount}`}
          description={`${summary.activeOrCompletedCount} confirmed or completed stays`}
          icon={<MetricBuildingIcon />}
          tone={
            summary.cancelledCount + summary.noShowCount > 0
              ? "warning"
              : "neutral"
          }
        />
      </div>

      <ChartCard
        title="Booking outcome distribution"
        description="Share of stays checked in, checked out, pending, or cancelled."
        summary={`${summary.staysCount} total stays`}
      >
        {activeStatuses.length === 0 ? (
          <TableEmptyState
            illustration="document-search"
            illustrationSize="xs"
            title="No stay status mix"
            description="Short-stay bookings matching this date range will appear here."
          />
        ) : (
          <ApexChart
            type="donut"
            height={265}
            series={statusSeries}
            options={statusOptions}
            ariaLabel="Donut chart showing short-stay bookings by status"
          />
        )}
      </ChartCard>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Short-stay income by status"
          count={`${activeStatuses.length} ${activeStatuses.length === 1 ? "status" : "statuses"}`}
          description={`Total nights, billed amounts, and collections across ${periodLabel}.`}
          actions={
            <Link
              href="/transients/stays"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Open short stays
            </Link>
          }
        />
        {activeStatuses.length === 0 ? (
          <TableEmptyState
            illustration="document-search"
            title="No short stays in this period"
            description="Adjust the check-in period or building filter to review short-stay income."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {activeStatuses.map((row) => (
                <div key={row.status} className="grid gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid gap-0.5">
                      <span className="text-sm font-semibold text-foreground">
                        {row.statusLabel}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {row.staysCount}{" "}
                        {row.staysCount === 1 ? "stay" : "stays"} (
                        {row.totalNights} nights)
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatPhpCurrency(row.stayAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                    <span>
                      Invoiced {formatPhpCurrency(row.invoicedAmount)}
                    </span>
                    <span>
                      Collected {formatPhpCurrency(row.collectedAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead numeric>Stays</TableHead>
                    <TableHead numeric>Booked nights</TableHead>
                    <TableHead numeric>Stay total</TableHead>
                    <TableHead numeric>Invoiced</TableHead>
                    <TableHead numeric>Collected</TableHead>
                    <TableHead numeric>Collection %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeStatuses.map((row) => {
                    const rate = computeMoneyRatioPercent(
                      row.collectedAmount,
                      row.stayAmount,
                    );
                    return (
                      <TableRow key={row.status}>
                        <TableCell className="font-medium text-foreground">
                          {row.statusLabel}
                        </TableCell>
                        <TableCell numeric>{row.staysCount}</TableCell>
                        <TableCell numeric>{row.totalNights}</TableCell>
                        <TableCell
                          numeric
                          className="font-medium text-foreground"
                        >
                          {formatPhpCurrency(row.stayAmount)}
                        </TableCell>
                        <TableCell numeric>
                          {formatPhpCurrency(row.invoicedAmount)}
                        </TableCell>
                        <TableCell numeric>
                          {formatPhpCurrency(row.collectedAmount)}
                        </TableCell>
                        <TableCell numeric>
                          {rate !== null ? `${rate}%` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold text-foreground">
                      Overall transient
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {summary.staysCount}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {summary.totalNights}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {formatPhpCurrency(summary.grossStayRevenue)}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {formatPhpCurrency(summary.invoicedAmount)}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {formatPhpCurrency(summary.collectedAmount)}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {summary.collectionRatePercent !== null
                        ? `${summary.collectionRatePercent}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export function MaintenanceReportPanel({
  overview,
  periodLabel,
}: {
  overview: ReportsOverviewDto;
  periodLabel: string;
}) {
  const { summary, byCategory, byPriority } = overview.maintenance;

  const { sortedRows: sortedCategories, sortHeaderProps } = useTableSort(
    byCategory,
    MAINT_CATEGORY_SORT_COLUMNS,
    { key: "total", direction: "desc" },
  );

  const activeCategories = useMemo(
    () => byCategory.filter((c) => c.totalCount > 0),
    [byCategory],
  );
  const categorySeries = useMemo(
    () => [
      {
        name: "Open",
        data: activeCategories.map((c) => c.openCount),
      },
      {
        name: "Resolved",
        data: activeCategories.map((c) => c.resolvedCount),
      },
    ],
    [activeCategories],
  );

  const categoryOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [DAISY_CHART_COLORS.danger, DAISY_CHART_COLORS.success],
      chart: { stacked: true },
      plotOptions: {
        bar: {
          horizontal: true,
          barHeight: "56%",
          borderRadius: 4,
          borderRadiusApplication: "end",
        },
      },
      stroke: { width: 1, colors: ["#ffffff"] },
      xaxis: {
        categories: activeCategories.map((c) => c.categoryLabel),
        labels: { formatter: (val) => `${Math.round(Number(val))}` },
      },
      yaxis: {
        labels: {
          style: { colors: DAISY_CHART_COLORS.charcoal, fontSize: "12px" },
        },
      },
      legend: {
        position: "top",
        horizontalAlign: "left",
      },
      tooltip: {
        y: {
          formatter: (val: number) =>
            `${val} ${val === 1 ? "ticket" : "tickets"}`,
        },
      },
    }),
    [activeCategories],
  );

  const prioritySeries = useMemo(
    () => [
      {
        name: "Open",
        data: byPriority.map((p) => p.openCount),
      },
      {
        name: "Active holds",
        data: byPriority.map((p) => p.activeHoldCount),
      },
      {
        name: "Resolved",
        data: byPriority.map((p) => p.resolvedCount),
      },
    ],
    [byPriority],
  );

  const priorityOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [
        DAISY_CHART_COLORS.danger,
        DAISY_CHART_COLORS.warning,
        DAISY_CHART_COLORS.success,
      ],
      plotOptions: {
        bar: {
          columnWidth: "56%",
          borderRadius: 4,
          borderRadiusApplication: "end",
        },
      },
      dataLabels: { enabled: false },
      xaxis: {
        categories: byPriority.map((p) => p.priorityLabel),
      },
      yaxis: {
        labels: { formatter: (val) => `${Math.round(Number(val))}` },
      },
      legend: {
        position: "top",
        horizontalAlign: "left",
      },
      tooltip: {
        y: {
          formatter: (val: number) =>
            `${val} ${val === 1 ? "ticket" : "tickets"}`,
        },
      },
    }),
    [byPriority],
  );

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Tickets in window"
          value={summary.totalInWindow}
          description={`Open or active within ${periodLabel}`}
          icon={<MetricWrenchIcon />}
          tone="info"
        />
        <MetricCard
          label="Currently open"
          value={summary.openCount}
          description={`${summary.urgentOpenCount} urgent open right now`}
          icon={<MetricWrenchIcon />}
          tone={summary.openCount > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Occupancy holds"
          value={summary.activeHoldCount}
          description="Open tickets blocking room stays"
          icon={<MetricWrenchIcon />}
          tone={summary.activeHoldCount > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Resolution rate"
          value={
            summary.resolutionRatePercent === null
              ? "—"
              : `${summary.resolutionRatePercent}%`
          }
          description={
            summary.avgResolutionDays
              ? `${summary.resolvedInWindow} resolved (avg. ${summary.avgResolutionDays} days)`
              : `${summary.resolvedInWindow} resolved (${summary.cancelledInWindow} cancelled)`
          }
          icon={<MetricWrenchIcon />}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard
          title="Issue root causes by category"
          description="Open versus resolved tickets across repair categories."
          summary={`${activeCategories.length} active ${activeCategories.length === 1 ? "category" : "categories"}`}
        >
          {activeCategories.length === 0 ? (
            <TableEmptyState
              illustration="document-search"
              illustrationSize="xs"
              title="No maintenance tickets"
              description="Reported and open repairs in this period will break down by category."
            />
          ) : (
            <ApexChart
              type="bar"
              height={265}
              series={categorySeries}
              options={categoryOptions}
              ariaLabel="Stacked horizontal bar chart comparing open and resolved maintenance tickets by category"
            />
          )}
        </ChartCard>

        <ChartCard
          title="Severity & occupancy impact"
          description="Open tickets, room-blocking holds, and resolved repairs by priority."
          summary={`${summary.activeHoldCount} active holds`}
        >
          {summary.totalInWindow === 0 ? (
            <TableEmptyState
              illustration="document-search"
              illustrationSize="xs"
              title="No priority distribution"
              description="Ticket severity and hold counts will populate once requests match the filter."
            />
          ) : (
            <ApexChart
              type="bar"
              height={265}
              series={prioritySeries}
              options={priorityOptions}
              ariaLabel="Grouped bar chart comparing open tickets, active holds, and resolved tickets across priority levels"
            />
          )}
        </ChartCard>
      </div>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Maintenance computation by category"
          count={`${sortedCategories.length} categories`}
          description={`Aggregated issue volume, active room holds, and resolution ratios across ${periodLabel}.`}
          actions={
            <Link
              href="/maintenance"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Open maintenance
            </Link>
          }
        />
        <div className="grid divide-y divide-border md:hidden">
          {sortedCategories.map((row) => {
            const resPct =
              row.totalCount > 0
                ? computeSharePercent(row.resolvedCount, row.totalCount)
                : null;
            return (
              <div key={row.category} className="grid gap-1.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {row.categoryLabel}
                  </span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {row.totalCount} total
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                  <span>
                    {row.openCount} open ({row.activeHoldCount} holds)
                  </span>
                  <span>
                    {resPct !== null ? `${resPct}% resolved` : "No tickets"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden md:block">
          <Table containerClassName="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead {...sortHeaderProps("category")}>Category</TableHead>
                <TableHead numeric {...sortHeaderProps("total")}>
                  Total tickets
                </TableHead>
                <TableHead numeric {...sortHeaderProps("open")}>
                  Open
                </TableHead>
                <TableHead numeric {...sortHeaderProps("holds")}>
                  Active holds
                </TableHead>
                <TableHead numeric {...sortHeaderProps("resolved")}>
                  Resolved
                </TableHead>
                <TableHead numeric>Share</TableHead>
                <TableHead numeric>Resolution %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCategories.map((row) => {
                const share = computeSharePercent(
                  row.totalCount,
                  summary.totalInWindow,
                );
                const resolutionPct =
                  row.totalCount > 0
                    ? computeSharePercent(row.resolvedCount, row.totalCount)
                    : null;
                return (
                  <TableRow key={row.category}>
                    <TableCell className="font-medium text-foreground">
                      {row.categoryLabel}
                    </TableCell>
                    <TableCell numeric>{row.totalCount}</TableCell>
                    <TableCell numeric>{row.openCount}</TableCell>
                    <TableCell numeric>{row.activeHoldCount}</TableCell>
                    <TableCell numeric>{row.resolvedCount}</TableCell>
                    <TableCell numeric>{share}%</TableCell>
                    <TableCell numeric className="font-medium text-foreground">
                      {resolutionPct !== null ? `${resolutionPct}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold text-foreground">
                  All categories
                </TableCell>
                <TableCell numeric className="font-semibold text-foreground">
                  {summary.totalInWindow}
                </TableCell>
                <TableCell numeric className="font-semibold text-foreground">
                  {summary.openCount}
                </TableCell>
                <TableCell numeric className="font-semibold text-foreground">
                  {summary.activeHoldCount}
                </TableCell>
                <TableCell numeric className="font-semibold text-foreground">
                  {summary.resolvedInWindow}
                </TableCell>
                <TableCell numeric className="font-semibold text-foreground">
                  {summary.totalInWindow > 0 ? "100%" : "0%"}
                </TableCell>
                <TableCell numeric className="font-semibold text-foreground">
                  {summary.resolutionRatePercent !== null
                    ? `${summary.resolutionRatePercent}%`
                    : "—"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </Card>
    </div>
  );
}
