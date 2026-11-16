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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeSharePercent } from "@/features/reports/calculations";
import type {
  OccupancyRoomTypeComparisonDto,
  RentRollRoomTypeSummaryDto,
  ReportsOverviewDto,
} from "@/features/reports/schemas";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatPhpCurrency } from "@/lib/money";
import type { SortColumnDef } from "@/lib/table-sort";

type OccupancySortKey =
  | "roomType"
  | "building"
  | "rooms"
  | "occupied"
  | "available"
  | "held"
  | "rate"
  | "occupancyPct";

const OCCUPANCY_SORT_COLUMNS: Record<
  OccupancySortKey,
  SortColumnDef<OccupancyRoomTypeComparisonDto>
> = {
  roomType: { getValue: (row) => row.roomTypeName },
  building: { getValue: (row) => row.buildingLabel },
  rooms: {
    getValue: (row) => row.totalRooms,
    kind: "number",
    defaultDirection: "desc",
  },
  occupied: {
    getValue: (row) => row.occupiedRooms,
    kind: "number",
    defaultDirection: "desc",
  },
  available: {
    getValue: (row) => row.availableRooms,
    kind: "number",
    defaultDirection: "desc",
  },
  held: {
    getValue: (row) => row.maintenanceRooms,
    kind: "number",
    defaultDirection: "desc",
  },
  rate: {
    getValue: (row) =>
      row.building === "TRANSIENT"
        ? (row.avgDailyRate ?? "0.00")
        : (row.avgMonthlyRate ?? "0.00"),
    kind: "money",
    defaultDirection: "desc",
  },
  occupancyPct: {
    getValue: (row) => row.occupancyRatePercent ?? -1,
    kind: "number",
    defaultDirection: "desc",
  },
};

type RentRollSortKey =
  | "roomType"
  | "assignments"
  | "share"
  | "monthlyRent"
  | "deposits"
  | "openBalance";

const RENT_ROLL_SORT_COLUMNS: Record<
  RentRollSortKey,
  SortColumnDef<RentRollRoomTypeSummaryDto>
> = {
  roomType: { getValue: (row) => row.roomTypeName },
  assignments: {
    getValue: (row) => row.activeAssignments,
    kind: "number",
    defaultDirection: "desc",
  },
  share: {
    getValue: (row) => row.sharePercent,
    kind: "number",
    defaultDirection: "desc",
  },
  monthlyRent: {
    getValue: (row) => row.totalMonthlyRent,
    kind: "money",
    defaultDirection: "desc",
  },
  deposits: {
    getValue: (row) => row.totalSecurityDeposits,
    kind: "money",
    defaultDirection: "desc",
  },
  openBalance: {
    getValue: (row) => row.totalOpenBalance,
    kind: "money",
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

export function OccupancyReportPanel({
  overview,
  asOfLabel,
}: {
  overview: ReportsOverviewDto;
  asOfLabel: string;
}) {
  const { summary, byBuilding, byRoomType } = overview.occupancy;

  const { sortedRows: sortedRoomTypes, sortHeaderProps } = useTableSort(
    byRoomType,
    OCCUPANCY_SORT_COLUMNS,
    {
      key: "occupancyPct",
      direction: "desc",
    },
  );

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

  const roomTypeChartSeries = useMemo(
    () => [
      {
        name: "Occupancy %",
        data: byRoomType.map((rt) => rt.occupancyRatePercent ?? 0),
      },
    ],
    [byRoomType],
  );

  const roomTypeChartOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [DAISY_CHART_COLORS.rausch],
      plotOptions: {
        bar: {
          horizontal: true,
          barHeight: "56%",
          borderRadius: 4,
          borderRadiusApplication: "end",
        },
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => `${val}%`,
      },
      xaxis: {
        min: 0,
        max: 100,
        categories: byRoomType.map((rt) => rt.roomTypeName),
        labels: {
          formatter: (val) => `${val}%`,
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: DAISY_CHART_COLORS.charcoal,
            fontSize: "12px",
          },
        },
      },
      tooltip: {
        y: {
          formatter: (val: number, opts) => {
            const item = byRoomType[opts.dataPointIndex];
            if (!item) return `${val}%`;
            return `${val}% (${item.occupiedRooms}/${item.totalRooms} rooms)`;
          },
        },
      },
    }),
    [byRoomType],
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
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

        <ChartCard
          title="Utilization by room type"
          description="Percentage of active rooms occupied per room category."
          summary={`${byRoomType.length} ${byRoomType.length === 1 ? "type" : "types"}`}
        >
          {byRoomType.length === 0 ? (
            <TableEmptyState
              illustration="document-search"
              illustrationSize="xs"
              title="No room type breakdown"
              description="Active room types matching the filter will be compared here."
            />
          ) : (
            <ApexChart
              type="bar"
              height={260}
              series={roomTypeChartSeries}
              options={roomTypeChartOptions}
              ariaLabel="Horizontal bar chart showing occupancy rate percentage per room type"
            />
          )}
        </ChartCard>
      </div>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Occupancy comparison by room type"
          count={`${sortedRoomTypes.length} ${sortedRoomTypes.length === 1 ? "group" : "groups"}`}
          description={`Computed room utilization and average rates as of ${asOfLabel}.`}
          actions={
            <Link
              href="/rooms"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Open rooms
            </Link>
          }
        />
        {sortedRoomTypes.length === 0 ? (
          <TableEmptyState
            illustration="document-search"
            title="No room groups to compare"
            description="Adjust the building filter or add rooms to populate the room type comparison."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {sortedRoomTypes.map((row) => (
                <div key={row.roomTypeId} className="grid gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid gap-0.5">
                      <span className="text-sm font-semibold text-foreground">
                        {row.roomTypeName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.buildingLabel}
                      </span>
                    </div>
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
                      {row.building === "TRANSIENT" && row.avgDailyRate
                        ? `${formatPhpCurrency(row.avgDailyRate)} / night`
                        : row.avgMonthlyRate
                          ? `${formatPhpCurrency(row.avgMonthlyRate)} / mo`
                          : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead {...sortHeaderProps("roomType")}>
                      Room type
                    </TableHead>
                    <TableHead {...sortHeaderProps("building")}>
                      Building
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("rooms")}>
                      Rooms
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("occupied")}>
                      Occupied
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("available")}>
                      Available
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("held")}>
                      Held
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("rate")}>
                      Avg. rate
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("occupancyPct")}>
                      Occupancy %
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRoomTypes.map((row) => (
                    <TableRow key={row.roomTypeId}>
                      <TableCell className="font-medium text-foreground">
                        {row.roomTypeName}
                      </TableCell>
                      <TableCell>{row.buildingLabel}</TableCell>
                      <TableCell numeric>{row.totalRooms}</TableCell>
                      <TableCell numeric>{row.occupiedRooms}</TableCell>
                      <TableCell numeric>{row.availableRooms}</TableCell>
                      <TableCell numeric>{row.maintenanceRooms}</TableCell>
                      <TableCell numeric>
                        {row.building === "TRANSIENT" && row.avgDailyRate
                          ? `${formatPhpCurrency(row.avgDailyRate)} / night`
                          : row.avgMonthlyRate
                            ? `${formatPhpCurrency(row.avgMonthlyRate)} / mo`
                            : "—"}
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
                    <TableCell>All filtered</TableCell>
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
  const { summary, byRoomType, leaseExpiries } = overview.rentRoll;

  const { sortedRows: sortedRoomTypes, sortHeaderProps } = useTableSort(
    byRoomType,
    RENT_ROLL_SORT_COLUMNS,
    { key: "monthlyRent", direction: "desc" },
  );

  const rentChartSeries = useMemo(
    () => [
      {
        name: "Monthly rent",
        data: byRoomType.map((rt) => toChartPhpNumber(rt.totalMonthlyRent)),
      },
      {
        name: "Open balance",
        data: byRoomType.map((rt) => toChartPhpNumber(rt.totalOpenBalance)),
      },
    ],
    [byRoomType],
  );

  const rentChartOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [DAISY_CHART_COLORS.info, DAISY_CHART_COLORS.danger],
      plotOptions: {
        bar: {
          columnWidth: "54%",
          borderRadius: 4,
          borderRadiusApplication: "end",
        },
      },
      dataLabels: { enabled: false },
      xaxis: {
        categories: byRoomType.map((rt) => rt.roomTypeName),
      },
      yaxis: {
        labels: {
          formatter: (val: number) => formatCompactPhpAxis(val),
        },
      },
      legend: {
        position: "top",
        horizontalAlign: "left",
      },
      tooltip: {
        y: {
          formatter: (val: number) => formatChartPhp(val),
        },
      },
    }),
    [byRoomType],
  );

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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard
          title="Rent roll vs. open balance by room type"
          description="Contracted monthly rent compared against unpaid tenant balances."
          summary={`${byRoomType.length} ${byRoomType.length === 1 ? "tier" : "tiers"}`}
        >
          {byRoomType.length === 0 ? (
            <TableEmptyState
              illustration="document-search"
              illustrationSize="xs"
              title="No active boarding rent roll"
              description="Active tenant assignments will compare monthly rent and arrears by room type."
            />
          ) : (
            <ApexChart
              type="bar"
              height={260}
              series={rentChartSeries}
              options={rentChartOptions}
              ariaLabel="Grouped bar chart comparing contracted monthly rent and open balance across room types"
            />
          )}
        </ChartCard>

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
      </div>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Portfolio computation by room type"
          count={`${sortedRoomTypes.length} ${sortedRoomTypes.length === 1 ? "tier" : "tiers"}`}
          description={`Aggregated contracted monthly revenue, deposits, and unpaid balances as of ${asOfLabel}.`}
          actions={
            <Link
              href="/tenants"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Open tenants
            </Link>
          }
        />
        {sortedRoomTypes.length === 0 ? (
          <TableEmptyState
            illustration="document-search"
            title="No active boarding assignments"
            description="No boarding house tenant assignments match this date and building filter."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {sortedRoomTypes.map((row) => (
                <div key={row.roomTypeId} className="grid gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid gap-0.5">
                      <span className="text-sm font-semibold text-foreground">
                        {row.roomTypeName}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {row.activeAssignments} active ({row.sharePercent}%
                        share)
                      </span>
                    </div>
                    <Badge
                      tone={
                        row.totalOpenBalance !== "0.00" ? "warning" : "success"
                      }
                    >
                      {row.totalOpenBalance !== "0.00"
                        ? "Open balance"
                        : "Settled"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                    <span className="text-foreground">
                      Rent: {formatPhpCurrency(row.totalMonthlyRent)}
                    </span>
                    <span className="text-muted-foreground">
                      Open: {formatPhpCurrency(row.totalOpenBalance)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead {...sortHeaderProps("roomType")}>
                      Room type
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("assignments")}>
                      Assignments
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("share")}>
                      Share
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("monthlyRent")}>
                      Monthly rent
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("deposits")}>
                      Deposits held
                    </TableHead>
                    <TableHead numeric {...sortHeaderProps("openBalance")}>
                      Open balance
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRoomTypes.map((row) => (
                    <TableRow key={row.roomTypeId}>
                      <TableCell className="font-medium text-foreground">
                        {row.roomTypeName}
                      </TableCell>
                      <TableCell numeric>{row.activeAssignments}</TableCell>
                      <TableCell numeric>{row.sharePercent}%</TableCell>
                      <TableCell numeric>
                        {formatPhpCurrency(row.totalMonthlyRent)}
                      </TableCell>
                      <TableCell numeric>
                        {formatPhpCurrency(row.totalSecurityDeposits)}
                      </TableCell>
                      <TableCell
                        numeric
                        className="font-medium text-foreground"
                      >
                        {formatPhpCurrency(row.totalOpenBalance)}
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
                      100%
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {formatPhpCurrency(summary.totalMonthlyRent)}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {formatPhpCurrency(summary.totalSecurityDeposits)}
                    </TableCell>
                    <TableCell
                      numeric
                      className="font-semibold text-foreground"
                    >
                      {formatPhpCurrency(summary.totalOpenBalance)}
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
