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
import {
  computeMoneyRatioPercent,
  computeSharePercent,
} from "@/features/reports/calculations";
import type {
  AgingBucketValue,
  CollectionsMethodSummaryDto,
  ReportsOverviewDto,
} from "@/features/reports/schemas";
import { useTableSort } from "@/hooks/use-table-sort";
import {
  addMoney,
  formatMoneyDecimal,
  formatPhpCurrency,
  parseMoneyDecimal,
} from "@/lib/money";
import type { SortColumnDef } from "@/lib/table-sort";

const BUCKET_TONE: Record<AgingBucketValue, "info" | "warning" | "danger"> = {
  CURRENT: "info",
  "1_30": "warning",
  "31_60": "warning",
  "61_90": "danger",
  "91_PLUS": "danger",
};

const COLLECTION_METHOD_SORT_COLUMNS: Record<
  "method" | "entries" | "posted" | "reversals" | "net",
  SortColumnDef<CollectionsMethodSummaryDto>
> = {
  method: { getValue: (row) => row.methodLabel },
  entries: {
    getValue: (row) => row.entryCount,
    kind: "number",
    defaultDirection: "desc",
  },
  posted: {
    getValue: (row) => row.postedAmount,
    kind: "money",
    defaultDirection: "desc",
  },
  reversals: {
    getValue: (row) => row.reversalAmount,
    kind: "money",
    defaultDirection: "asc",
  },
  net: {
    getValue: (row) => row.netAmount,
    kind: "money",
    defaultDirection: "desc",
  },
};

function sumMoneyStrings(first: string, second: string): string {
  return formatMoneyDecimal(
    addMoney(parseMoneyDecimal(first), parseMoneyDecimal(second)),
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

export function ReceivablesAgingReportPanel({
  overview,
  asOfLabel,
}: {
  overview: ReportsOverviewDto;
  asOfLabel: string;
}) {
  const { summary, buckets, byScope } = overview.receivablesAging;

  const agingBarSeries = useMemo(
    () => [
      {
        name: "Outstanding balance",
        data: buckets.map((b) => toChartPhpNumber(b.outstandingAmount)),
      },
    ],
    [buckets],
  );

  const agingBarOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [
        DAISY_CHART_COLORS.info,
        DAISY_CHART_COLORS.warning,
        DAISY_CHART_COLORS.warningDark,
        DAISY_CHART_COLORS.danger,
        DAISY_CHART_COLORS.dangerDeep,
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
      dataLabels: { enabled: false },
      xaxis: {
        categories: ["Current", "1–30d", "31–60d", "61–90d", "91+d"],
      },
      yaxis: {
        labels: {
          formatter: (val: number) => formatCompactPhpAxis(val),
        },
      },
      tooltip: {
        y: {
          formatter: (val: number, opts) => {
            const item = buckets[opts.dataPointIndex];
            if (!item) return formatChartPhp(val);
            return `${formatChartPhp(val)} (${item.count} ${item.count === 1 ? "invoice" : "invoices"})`;
          },
        },
      },
    }),
    [buckets],
  );

  const scopeChartValues = useMemo(
    () => byScope.map((s) => toChartPhpNumber(s.outstandingAmount)),
    [byScope],
  );
  const hasScopeReceivables = scopeChartValues.some((v) => v > 0);

  const scopeDonutOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [DAISY_CHART_COLORS.info, DAISY_CHART_COLORS.rausch],
      labels: byScope.map((s) => s.scopeLabel),
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
                formatter: (val: string) => formatChartPhp(Number(val)),
              },
              total: {
                show: true,
                label: "Outstanding",
                color: DAISY_CHART_COLORS.slate,
                formatter: () => formatPhpCurrency(summary.totalOutstanding),
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
          formatter: (val: number) => formatChartPhp(val),
        },
      },
    }),
    [byScope, summary.totalOutstanding],
  );

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total outstanding"
          value={formatPhpCurrency(summary.totalOutstanding)}
          description={`${summary.openInvoicesCount} open invoices as of ${asOfLabel}`}
          icon={<MetricLedgerIcon />}
          tone="warning"
        />
        <MetricCard
          label="Current (not past due)"
          value={formatPhpCurrency(summary.currentAmount)}
          description="Issued invoices within due date"
          icon={<MetricLedgerIcon />}
        />
        <MetricCard
          label="1–60 days past due"
          value={formatPhpCurrency(
            sumMoneyStrings(
              summary.bucket1To30Amount,
              summary.bucket31To60Amount,
            ),
          )}
          description={`1–30d: ${formatPhpCurrency(summary.bucket1To30Amount)}`}
          icon={<MetricLedgerIcon />}
          tone="warning"
        />
        <MetricCard
          label="61+ days past due"
          value={formatPhpCurrency(
            sumMoneyStrings(
              summary.bucket61To90Amount,
              summary.bucket91PlusAmount,
            ),
          )}
          description={`91+d: ${formatPhpCurrency(summary.bucket91PlusAmount)}`}
          icon={<MetricLedgerIcon />}
          tone={
            summary.bucket61To90Amount !== "0.00" ||
            summary.bucket91PlusAmount !== "0.00"
              ? "warning"
              : "neutral"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard
          title="Delinquency aging curve"
          description="Open balance concentration from current through 91+ days past due."
          summary={`${summary.overdueInvoicesCount} overdue`}
        >
          {summary.openInvoicesCount === 0 ? (
            <TableEmptyState
              illustration="document-search"
              illustrationSize="xs"
              title="No open receivables"
              description="All issued invoices as of the selected date are settled."
            />
          ) : (
            <ApexChart
              type="bar"
              height={265}
              series={agingBarSeries}
              options={agingBarOptions}
              ariaLabel="Bar chart showing unpaid bill amounts by how long they have been overdue"
            />
          )}
        </ChartCard>

        <ChartCard
          title="Unpaid bills by building"
          description="Share of unpaid balances from boarding rooms versus short stays."
          summary={`${formatPhpCurrency(summary.overdueAmount)} overdue`}
        >
          {!hasScopeReceivables ? (
            <TableEmptyState
              illustration="document-search"
              illustrationSize="xs"
              title="No building breakdown yet"
              description="Unpaid balances across Boarding House and Transient Building will appear here."
            />
          ) : (
            <ApexChart
              type="donut"
              height={265}
              series={scopeChartValues}
              options={scopeDonutOptions}
              ariaLabel="Donut chart comparing unpaid balances between Boarding House and Transient Building"
            />
          )}
        </ChartCard>
      </div>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Overdue balance summary"
          count={`${buckets.length} groups`}
          description={`Balances as of ${asOfLabel}, including bill adjustments and payment reversals.`}
          actions={
            <Link
              href="/billing"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Open billing
            </Link>
          }
        />
        <div className="grid divide-y divide-border md:hidden">
          {buckets.map((bucket) => {
            const amountShare = computeMoneyRatioPercent(
              bucket.outstandingAmount,
              summary.totalOutstanding,
            );
            return (
              <div key={bucket.bucket} className="grid gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Badge tone={BUCKET_TONE[bucket.bucket]}>
                    {bucket.label}
                  </Badge>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {formatPhpCurrency(bucket.outstandingAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                  <span>
                    {bucket.count} {bucket.count === 1 ? "invoice" : "invoices"}
                  </span>
                  <span>
                    {amountShare !== null ? `${amountShare}% of total` : "—"}
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
                <TableHead>How overdue</TableHead>
                <TableHead numeric>Open invoices</TableHead>
                <TableHead numeric>Invoice share</TableHead>
                <TableHead numeric>Outstanding</TableHead>
                <TableHead numeric>Balance share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.map((bucket) => {
                const invoiceShare = computeSharePercent(
                  bucket.count,
                  summary.openInvoicesCount,
                );
                const amountShare = computeMoneyRatioPercent(
                  bucket.outstandingAmount,
                  summary.totalOutstanding,
                );
                return (
                  <TableRow key={bucket.bucket}>
                    <TableCell>
                      <Badge tone={BUCKET_TONE[bucket.bucket]}>
                        {bucket.label}
                      </Badge>
                    </TableCell>
                    <TableCell numeric>{bucket.count}</TableCell>
                    <TableCell numeric>{invoiceShare}%</TableCell>
                    <TableCell numeric className="font-medium text-foreground">
                      {formatPhpCurrency(bucket.outstandingAmount)}
                    </TableCell>
                    <TableCell numeric>
                      {amountShare !== null ? `${amountShare}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold text-foreground">
                  Total open receivables
                </TableCell>
                <TableCell numeric className="font-semibold text-foreground">
                  {summary.openInvoicesCount}
                </TableCell>
                <TableCell numeric className="font-semibold text-foreground">
                  {summary.openInvoicesCount > 0 ? "100%" : "0%"}
                </TableCell>
                <TableCell numeric className="font-semibold text-foreground">
                  {formatPhpCurrency(summary.totalOutstanding)}
                </TableCell>
                <TableCell numeric className="font-semibold text-foreground">
                  {summary.totalOutstanding !== "0.00" ? "100%" : "—"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </Card>
    </div>
  );
}

export function CollectionsReportPanel({
  overview,
  periodLabel,
}: {
  overview: ReportsOverviewDto;
  periodLabel: string;
}) {
  const { summary, byMethod, byScope, dailyTrend } = overview.collections;

  const { sortedRows: sortedMethods, sortHeaderProps } = useTableSort(
    byMethod,
    COLLECTION_METHOD_SORT_COLUMNS,
    { key: "net", direction: "desc" },
  );

  const hasTrendActivity = dailyTrend.some((pt) => pt.entryCount > 0);
  const trendSeries = useMemo(
    () => [
      {
        name: "Gross posted",
        data: dailyTrend.map((pt) => toChartPhpNumber(pt.postedAmount)),
      },
      {
        name: "Net collected",
        data: dailyTrend.map((pt) => toChartPhpNumber(pt.netAmount)),
      },
    ],
    [dailyTrend],
  );

  const trendOptions = useMemo<Omit<ApexOptions, "series">>(
    () => ({
      colors: [DAISY_CHART_COLORS.info, DAISY_CHART_COLORS.success],
      stroke: {
        curve: "smooth",
        width: 2,
      },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.22,
          opacityTo: 0.02,
          stops: [0, 95, 100],
        },
      },
      dataLabels: { enabled: false },
      xaxis: {
        categories: dailyTrend.map((pt) => pt.label),
        tickAmount: Math.min(8, Math.max(2, dailyTrend.length)),
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
    [dailyTrend],
  );

  const activeMethods = useMemo(
    () => byMethod.filter((m) => m.entryCount > 0),
    [byMethod],
  );
  const methodSeries = useMemo(
    () => [
      {
        name: "Net collected",
        data: activeMethods.map((m) => toChartPhpNumber(m.netAmount)),
      },
    ],
    [activeMethods],
  );

  const methodOptions = useMemo<Omit<ApexOptions, "series">>(
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
      dataLabels: { enabled: false },
      xaxis: {
        categories: activeMethods.map((m) => m.methodLabel),
        labels: {
          formatter: (val) => formatCompactPhpAxis(Number(val)),
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
          formatter: (val: number) => formatChartPhp(val),
        },
      },
    }),
    [activeMethods],
  );

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Net collections"
          value={formatPhpCurrency(summary.netCollectedAmount)}
          description={periodLabel}
          icon={<MetricLedgerIcon />}
          tone="info"
        />
        <MetricCard
          label="Gross receipts"
          value={formatPhpCurrency(summary.grossPostedAmount)}
          description={`${summary.postedCount} posted (${summary.reversedCount} later reversed)`}
          icon={<MetricLedgerIcon />}
          tone="success"
        />
        <MetricCard
          label="Reversal entries"
          value={formatPhpCurrency(summary.totalReversalsAmount)}
          description={
            summary.reversalRatePercent !== null
              ? `${summary.reversalCount} reversals (${summary.reversalRatePercent}% of gross)`
              : `${summary.reversalCount} reversals posted in window`
          }
          icon={<MetricLedgerIcon />}
          tone={summary.reversalCount > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Extra tenant credits"
          value={formatPhpCurrency(summary.unallocatedCreditTotal)}
          description={`${summary.entryCount} payments in period`}
          icon={<MetricLedgerIcon />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard
          title="Collections trend over period"
          description="Gross posted receipts versus net collections after reversals."
          summary={`${summary.entryCount} entries`}
        >
          {!hasTrendActivity ? (
            <TableEmptyState
              illustration="document-search"
              illustrationSize="xs"
              title="No collections in period"
              description="Expand the date range or record payments to inspect collection timing."
            />
          ) : (
            <ApexChart
              type="area"
              height={265}
              series={trendSeries}
              options={trendOptions}
              ariaLabel="Area chart tracking gross posted and net collections across the selected period"
            />
          )}
        </ChartCard>

        <ChartCard
          title="Collections by payment method"
          description="Net collected volume across payment channels."
          summary={`${activeMethods.length} active ${activeMethods.length === 1 ? "channel" : "channels"}`}
        >
          {activeMethods.length === 0 ? (
            <TableEmptyState
              illustration="document-search"
              illustrationSize="xs"
              title="No active payment channels"
              description="Recorded payments in this period will compare channel share here."
            />
          ) : (
            <ApexChart
              type="bar"
              height={265}
              series={methodSeries}
              options={methodOptions}
              ariaLabel="Horizontal bar chart comparing net collections across payment methods"
            />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden p-0 sm:p-0 xl:col-span-2">
          <TableCardHeader
            title="Collections computation by method"
            count={`${sortedMethods.length} methods`}
            description={`Channel totals and reversal impact across ${periodLabel}.`}
            actions={
              <Link
                href="/payments"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Open payments
              </Link>
            }
          />
          <div className="grid divide-y divide-border md:hidden">
            {sortedMethods.map((methodRow) => (
              <div
                key={methodRow.method}
                className="flex items-center justify-between gap-2 p-4 text-sm"
              >
                <div className="grid gap-0.5">
                  <span className="font-medium text-foreground">
                    {methodRow.methodLabel}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {methodRow.entryCount} entries
                  </span>
                </div>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatPhpCurrency(methodRow.netAmount)}
                </span>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead {...sortHeaderProps("method")}>Method</TableHead>
                  <TableHead numeric {...sortHeaderProps("entries")}>
                    Entries
                  </TableHead>
                  <TableHead numeric {...sortHeaderProps("posted")}>
                    Gross posted
                  </TableHead>
                  <TableHead numeric {...sortHeaderProps("reversals")}>
                    Reversals
                  </TableHead>
                  <TableHead numeric {...sortHeaderProps("net")}>
                    Net collected
                  </TableHead>
                  <TableHead numeric>Net share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMethods.map((methodRow) => {
                  const netShare = computeMoneyRatioPercent(
                    methodRow.netAmount,
                    summary.netCollectedAmount,
                  );
                  return (
                    <TableRow key={methodRow.method}>
                      <TableCell className="font-medium text-foreground">
                        {methodRow.methodLabel}
                      </TableCell>
                      <TableCell numeric>{methodRow.entryCount}</TableCell>
                      <TableCell numeric>
                        {formatPhpCurrency(methodRow.postedAmount)}
                      </TableCell>
                      <TableCell numeric>
                        {formatPhpCurrency(methodRow.reversalAmount)}
                      </TableCell>
                      <TableCell
                        numeric
                        className="font-semibold text-foreground"
                      >
                        {formatPhpCurrency(methodRow.netAmount)}
                      </TableCell>
                      <TableCell numeric>
                        {netShare !== null ? `${netShare}%` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold text-foreground">
                    All methods
                  </TableCell>
                  <TableCell numeric className="font-semibold text-foreground">
                    {summary.entryCount}
                  </TableCell>
                  <TableCell numeric className="font-semibold text-foreground">
                    {formatPhpCurrency(summary.grossPostedAmount)}
                  </TableCell>
                  <TableCell numeric className="font-semibold text-foreground">
                    {formatPhpCurrency(summary.totalReversalsAmount)}
                  </TableCell>
                  <TableCell numeric className="font-semibold text-foreground">
                    {formatPhpCurrency(summary.netCollectedAmount)}
                  </TableCell>
                  <TableCell numeric className="font-semibold text-foreground">
                    {summary.netCollectedAmount !== "0.00" ? "100%" : "—"}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden p-0 sm:p-0">
          <TableCardHeader
            title="Building comparison"
            count={`${byScope.length} ${byScope.length === 1 ? "building" : "buildings"}`}
            description="Boarding versus short-stay payments collected."
          />
          <div className="grid divide-y divide-border">
            {byScope.map((item) => (
              <div key={item.scope} className="grid gap-1.5 px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {item.scopeLabel}
                  </span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {formatPhpCurrency(item.netAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                  <span>{item.entryCount} payments</span>
                  <span>Posted {formatPhpCurrency(item.postedAmount)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
