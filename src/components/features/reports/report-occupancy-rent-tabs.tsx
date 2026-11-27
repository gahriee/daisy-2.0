"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ApexOptions } from "apexcharts";
import { Badge } from "@/components/ui/badge";
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
import { computeSharePercent } from "@/features/reports/calculations";
import type { ReportsOverviewDto } from "@/features/reports/schemas";
import { formatPhpCurrency } from "@/lib/money";

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

export function OccupancyReportPanel({
  overview,
  asOfLabel,
}: {
  overview: ReportsOverviewDto;
  asOfLabel: string;
}) {
  const { summary, byBuilding } = overview.occupancy;

  const buildingChartSeries = useMemo(
    () => [
      {
        name: "Occupied",
        data: byBuilding.map((b) => b.occupiedRooms),
      },
      {
        name: "Available",
        data: byBuilding.map((b) => b.availableRooms),
      },
      {
        name: "Maintenance",
        data: byBuilding.map((b) => b.maintenanceRooms),
      },
    ],
    [byBuilding],
  );

  const buildingChartOptions = useMemo<Omit<ApexOptions, "series">>(
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
        categories: byBuilding.map((b) => b.buildingLabel),
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
    [byBuilding],
  );

  const heldShare = computeSharePercent(
    summary.maintenanceRooms,
    summary.totalRooms,
  );

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Occupancy rate"
          value={
            summary.occupancyRatePercent === null
              ? "—"
              : `${summary.occupancyRatePercent}%`
          }
          description={`${summary.occupiedRooms} of ${summary.totalRooms} active rooms occupied as of ${asOfLabel}`}
          icon={<MetricBuildingIcon />}
          tone="info"
        />
        <MetricCard
          label="Available capacity"
          value={summary.availableRooms}
          description={`${summary.availableBeds} available beds across ${summary.totalBeds} total beds`}
          icon={<MetricBuildingIcon />}
          tone="success"
        />
        <MetricCard
          label="Boarding vs. transient"
          value={
            summary.boardingOccupancyRatePercent === null
              ? "—"
              : `${summary.boardingOccupancyRatePercent}%`
          }
          description={`Boarding ${summary.boardingRooms} rooms vs. Transient ${summary.transientOccupancyRatePercent ?? "—"}% (${summary.transientRooms} rooms)`}
          icon={<MetricBuildingIcon />}
        />
        <MetricCard
          label="Maintenance holds"
          value={summary.maintenanceRooms}
          description={`${heldShare}% of rooms held (${summary.maintenanceBeds} beds unavailable)`}
          icon={<MetricWrenchIcon />}
          tone={summary.maintenanceRooms > 0 ? "warning" : "neutral"}
        />
      </div>

      <ChartCard
        title="Building capacity comparison"
        description="Occupied, available, and held room distribution across buildings."
        summary={`${summary.totalRooms} active rooms`}
      >
        {summary.totalRooms === 0 ? (
          <TableEmptyState
            illustration="document-search"
            illustrationSize="xs"
            title="No active rooms"
            description="Adjust the building filter or add rooms to analyze building utilization."
          />
        ) : (
          <ApexChart
            type="bar"
            height={260}
            series={buildingChartSeries}
            options={buildingChartOptions}
            ariaLabel="Stacked horizontal bar chart comparing occupied, available, and maintenance rooms by building"
          />
        )}
      </ChartCard>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Occupancy by building"
          count={`${byBuilding.length} ${byBuilding.length === 1 ? "building" : "buildings"}`}
          description={`Computed room utilization and occupied revenue as of ${asOfLabel}.`}
          actions={
            <Link
              href="/rooms"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Open rooms
            </Link>
          }
        />
        {byBuilding.length === 0 ? (
          <TableEmptyState
            illustration="document-search"
            title="No buildings to compare"
            description="Adjust the building filter or add rooms to populate the occupancy breakdown."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {byBuilding.map((row) => (
                <div key={row.building} className="grid gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {row.buildingLabel}
                    </span>
                    <Badge
                      tone={
                        row.occupancyRatePercent === null
                          ? "neutral"
                          : row.occupancyRatePercent >= 80
                            ? "success"
                            : "info"
                      }
                    >
                      {row.occupancyRatePercent === null
                        ? "—"
                        : `${row.occupancyRatePercent}% occupied`}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                    <span>
                      {row.occupiedRooms}/{row.totalRooms} occupied (
                      {row.availableRooms} avail, {row.maintenanceRooms} held)
                    </span>
                    <span className="font-medium text-foreground">
                      {row.building === "TRANSIENT"
                        ? `${formatPhpCurrency(row.occupiedDailyRateTotal)} / night`
                        : `${formatPhpCurrency(row.occupiedMonthlyRevenue)} / mo`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Building</TableHead>
                    <TableHead numeric>Rooms</TableHead>
                    <TableHead numeric>Occupied</TableHead>
                    <TableHead numeric>Available</TableHead>
                    <TableHead numeric>Held</TableHead>
                    <TableHead numeric>Occupied rate total</TableHead>
                    <TableHead numeric>Occupancy %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byBuilding.map((row) => (
                    <TableRow key={row.building}>
                      <TableCell className="font-medium text-foreground">
                        {row.buildingLabel}
                      </TableCell>
                      <TableCell numeric>{row.totalRooms}</TableCell>
                      <TableCell numeric>{row.occupiedRooms}</TableCell>
                      <TableCell numeric>{row.availableRooms}</TableCell>
                      <TableCell numeric>{row.maintenanceRooms}</TableCell>
                      <TableCell numeric>
                        {row.building === "TRANSIENT"
                          ? `${formatPhpCurrency(row.occupiedDailyRateTotal)} / night`
                          : `${formatPhpCurrency(row.occupiedMonthlyRevenue)} / mo`}
                      </TableCell>
                      <TableCell
                        numeric
                        className="font-semibold text-foreground"
                      >
                        {row.occupancyRatePercent === null
                          ? "—"
                          : `${row.occupancyRatePercent}%`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold text-foreground">
                      Overall total
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {summary.totalRooms}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {summary.occupiedRooms}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {summary.availableRooms}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {summary.maintenanceRooms}
                    </TableCell>
                    <TableCell numeric>—</TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {summary.occupancyRatePercent === null
                        ? "—"
                        : `${summary.occupancyRatePercent}%`}
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

export function RentRollReportPanel({
  overview,
  asOfLabel,
}: {
  overview: ReportsOverviewDto;
  asOfLabel: string;
}) {
  const { summary, leaseExpiries } = overview.rentRoll;

  const hasExpiries = leaseExpiries.some((b) => b.count > 0);
  const expiryChartSeries = useMemo(
    () => [
      {
        name: "Assignments",
        data: leaseExpiries.map((b) => b.count),
      },
    ],
    [leaseExpiries],
  );

  const expiryChartOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [
        DAISY_CHART_COLORS.danger,
        DAISY_CHART_COLORS.warning,
        DAISY_CHART_COLORS.info,
        DAISY_CHART_COLORS.success,
      ],
      plotOptions: {
        bar: {
          distributed: true,
          columnWidth: "52%",
          borderRadius: 4,
          borderRadiusApplication: "end",
        },
      },
      legend: { show: false },
      dataLabels: { enabled: true },
      xaxis: {
        categories: leaseExpiries.map((b) => b.label),
      },
      yaxis: {
        labels: {
          formatter: (val) => `${Math.round(Number(val))}`,
        },
      },
      tooltip: {
        y: {
          formatter: (val: number, opts) => {
            const item = leaseExpiries[opts.dataPointIndex];
            if (!item) return `${val} assignments`;
            return `${val} ${val === 1 ? "stay" : "stays"} (${formatPhpCurrency(item.monthlyRentAtRisk)}/mo)`;
          },
        },
      },
    }),
    [leaseExpiries],
  );

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active assignments"
          value={summary.activeAssignments}
          description={`Boarding leases active as of ${asOfLabel}`}
          icon={<MetricBuildingIcon />}
          tone="info"
        />
        <MetricCard
          label="Monthly rent roll"
          value={formatPhpCurrency(summary.totalMonthlyRent)}
          description={
            summary.averageMonthlyRent
              ? `Avg. ${formatPhpCurrency(summary.averageMonthlyRent)} per active lease`
              : "No active boarding assignments"
          }
          icon={<MetricLedgerIcon />}
        />
        <MetricCard
          label="Deposits held"
          value={formatPhpCurrency(summary.totalSecurityDeposits)}
          description="Security deposits across active leases"
          icon={<MetricLedgerIcon />}
        />
        <MetricCard
          label="Open tenant balance"
          value={formatPhpCurrency(summary.totalOpenBalance)}
          description={
            summary.openBalanceToRentPercent !== null
              ? `${summary.openBalanceToRentPercent}% of monthly rent roll unpaid`
              : `Unpaid issued invoices as of ${asOfLabel}`
          }
          icon={<MetricLedgerIcon />}
          tone={summary.totalOpenBalance !== "0.00" ? "warning" : "success"}
        />
      </div>

      <ChartCard
        title="Lease expiration horizon"
        description="Turnover exposure across scheduled move-out windows."
        summary={`${summary.activeAssignments} active`}
      >
        {!hasExpiries ? (
          <TableEmptyState
            illustration="document-search"
            illustrationSize="xs"
            title="No lease expiration data"
            description="Scheduled assignment end dates will group turnover exposure here."
          />
        ) : (
          <ApexChart
            type="bar"
            height={260}
            series={expiryChartSeries}
            options={expiryChartOptions}
            ariaLabel="Bar chart showing active boarding assignments grouped by lease expiration timeframe"
          />
        )}
      </ChartCard>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Lease expiry windows"
          count={`${summary.activeAssignments} ${summary.activeAssignments === 1 ? "assignment" : "assignments"}`}
          description={`Contracted monthly rent grouped by scheduled move-out horizon as of ${asOfLabel}.`}
          actions={
            <Link
              href="/tenants"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Open tenants
            </Link>
          }
        />
        {!hasExpiries ? (
          <TableEmptyState
            illustration="document-search"
            title="No active boarding assignments"
            description="No boarding house tenant assignments match this date and building filter."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {leaseExpiries.map((row) => (
                <div
                  key={row.bucket}
                  className="flex items-center justify-between gap-2 p-4"
                >
                  <div className="grid gap-0.5">
                    <span className="text-sm font-semibold text-foreground">
                      {row.label}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {row.count} {row.count === 1 ? "contract" : "contracts"}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {formatPhpCurrency(row.monthlyRentAtRisk)} / mo
                  </span>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Expiry window</TableHead>
                    <TableHead numeric>Contracts</TableHead>
                    <TableHead numeric>Monthly rent at risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaseExpiries.map((row) => (
                    <TableRow key={row.bucket}>
                      <TableCell className="font-medium text-foreground">
                        {row.label}
                      </TableCell>
                      <TableCell numeric>{row.count}</TableCell>
                      <TableCell numeric>
                        {formatPhpCurrency(row.monthlyRentAtRisk)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold text-foreground">
                      Overall portfolio
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {summary.activeAssignments}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {formatPhpCurrency(summary.totalMonthlyRent)}
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
