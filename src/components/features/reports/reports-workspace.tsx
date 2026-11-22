"use client";

import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchFilterBar } from "@/components/ui/search-filter";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import {
  REPORT_BUILDING_FILTER_LABELS,
  REPORT_BUILDING_FILTERS,
  REPORT_EXPORT_FORMAT_LABELS,
  REPORT_LABELS,
  REPORT_MAX_PERIOD_DAYS,
  REPORT_TYPES,
  type ReportBuildingFilter,
  type ReportExportDocumentFormat,
  type ReportsOverviewDto,
  type ReportTypeValue,
} from "@/features/reports/schemas";
import {
  diffManilaDays,
  formatManilaDate,
  isValidManilaDate,
} from "@/lib/dates";
import { ReportExportMenu } from "./report-export-menu";
import {
  CollectionsReportPanel,
  ReceivablesAgingReportPanel,
} from "./report-finance-tabs";
import {
  OccupancyReportPanel,
  RentRollReportPanel,
} from "./report-occupancy-rent-tabs";
import {
  MaintenanceReportPanel,
  TransientRevenueReportPanel,
} from "./report-operations-tabs";

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

type ReportFilterState = {
  asOfDate: string;
  fromDate: string;
  toDate: string;
  building: ReportBuildingFilter;
};

export function ReportsWorkspace({
  initialOverview,
}: {
  initialOverview: ReportsOverviewDto;
}) {
  const defaultFilters: ReportFilterState = {
    asOfDate: initialOverview.filters.asOfDate,
    fromDate: initialOverview.filters.fromDate,
    toDate: initialOverview.filters.toDate,
    building: initialOverview.filters.building,
  };

  const [overview, setOverview] = useState<ReportsOverviewDto>(initialOverview);
  const [activeTab, setActiveTab] = useState<ReportTypeValue>("occupancy");
  const [asOfDate, setAsOfDate] = useState(defaultFilters.asOfDate);
  const [fromDate, setFromDate] = useState(defaultFilters.fromDate);
  const [toDate, setToDate] = useState(defaultFilters.toDate);
  const [building, setBuilding] = useState<ReportBuildingFilter>(
    defaultFilters.building,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingReport, startLoad] = useTransition();
  const [exportingFormat, setExportingFormat] =
    useState<ReportExportDocumentFormat | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function buildSearchParams(target: ReportFilterState) {
    const params = new URLSearchParams();
    params.set("asOfDate", target.asOfDate);
    params.set("fromDate", target.fromDate);
    params.set("toDate", target.toDate);
    params.set("building", target.building);
    return params;
  }

  function validateFilters(target: ReportFilterState): string | null {
    if (
      !isValidManilaDate(target.asOfDate) ||
      !isValidManilaDate(target.fromDate) ||
      !isValidManilaDate(target.toDate)
    ) {
      return "Enter complete calendar dates in YYYY-MM-DD format.";
    }
    if (target.fromDate > target.toDate) {
      return "Period start date cannot be after period end date.";
    }
    if (
      diffManilaDays(target.fromDate, target.toDate) > REPORT_MAX_PERIOD_DAYS
    ) {
      return `Date range cannot exceed ${REPORT_MAX_PERIOD_DAYS} days.`;
    }
    return null;
  }

  function applyFilters(next?: ReportFilterState) {
    const target = next ?? { asOfDate, fromDate, toDate, building };
    const validationError = validateFilters(target);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = buildSearchParams(target);

    startLoad(async () => {
      try {
        const res = await fetch(`/api/reports?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => null)) as
          ReportsOverviewDto | { error?: string; message?: string } | null;

        if (!res.ok) {
          const msg =
            (body && "error" in body && body.error) ||
            (body && "message" in body && body.message) ||
            "Could not load the updated reports.";
          throw new Error(msg);
        }

        if (body && "occupancy" in body) {
          setOverview(body);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load the updated reports.",
        );
      }
    });
  }

  function updateFilterAndRefresh(patch: Partial<ReportFilterState>) {
    const next: ReportFilterState = {
      asOfDate: patch.asOfDate ?? asOfDate,
      fromDate: patch.fromDate ?? fromDate,
      toDate: patch.toDate ?? toDate,
      building: patch.building ?? building,
    };
    if (patch.asOfDate !== undefined) setAsOfDate(patch.asOfDate);
    if (patch.fromDate !== undefined) setFromDate(patch.fromDate);
    if (patch.toDate !== undefined) setToDate(patch.toDate);
    if (patch.building !== undefined) setBuilding(patch.building);

    applyFilters(next);
  }

  function handleReset() {
    setAsOfDate(defaultFilters.asOfDate);
    setFromDate(defaultFilters.fromDate);
    setToDate(defaultFilters.toDate);
    setBuilding(defaultFilters.building);
    applyFilters(defaultFilters);
  }

  async function handleExport(format: ReportExportDocumentFormat) {
    setErrorMessage(null);
    setExportingFormat(format);

    try {
      const params = buildSearchParams({
        asOfDate: overview.filters.asOfDate,
        fromDate: overview.filters.fromDate,
        toDate: overview.filters.toDate,
        building: overview.filters.building,
      });
      params.set("reportType", activeTab);
      params.set("format", format);

      const res = await fetch(`/api/reports/export?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(
          body?.error ??
            body?.message ??
            `Could not export ${REPORT_EXPORT_FORMAT_LABELS[format]} report.`,
        );
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename =
        filenameMatch?.[1] ??
        `daisy-${activeTab}-${overview.filters.asOfDate}.${format}`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(
        `Exported ${REPORT_LABELS[activeTab]} (${REPORT_EXPORT_FORMAT_LABELS[format]}) to ${filename}.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : `Could not export ${REPORT_EXPORT_FORMAT_LABELS[format]} report.`,
      );
    } finally {
      setExportingFormat(null);
    }
  }

  const hasCustomFilters =
    asOfDate !== defaultFilters.asOfDate ||
    fromDate !== defaultFilters.fromDate ||
    toDate !== defaultFilters.toDate ||
    building !== defaultFilters.building;

  const periodLabel = `${formatManilaDate(overview.filters.fromDate)} to ${formatManilaDate(overview.filters.toDate)}`;
  const asOfLabel = formatManilaDate(overview.filters.asOfDate);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Reports &amp; analytics
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Review room occupancy, monthly rent, overdue bills, collections,
            short-stay income, and repair trends across dates and buildings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="md"
            loading={loadingReport}
            disabled={loadingReport || exportingFormat !== null}
            onClick={() => applyFilters()}
          >
            {!loadingReport && <RefreshIcon />}
            <span>{loadingReport ? "Updating..." : "Refresh"}</span>
          </Button>
          <ReportExportMenu
            reportLabel={REPORT_LABELS[activeTab]}
            disabled={loadingReport}
            exportingFormat={exportingFormat}
            onSelectFormat={(format) => void handleExport(format)}
          />
        </div>
      </header>

      <SearchFilterBar
        aria-label="Filter report dates and building"
        updating={loadingReport}
        hasActiveFilters={hasCustomFilters}
        onClearAll={handleReset}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="report-as-of" label="As-of date">
            {(props) => (
              <DatePicker
                {...props}
                required
                value={asOfDate}
                onValueChange={(next) =>
                  updateFilterAndRefresh({ asOfDate: next })
                }
              />
            )}
          </Field>
          <Field id="report-from" label="Period start">
            {(props) => (
              <DatePicker
                {...props}
                required
                value={fromDate}
                onValueChange={(next) =>
                  updateFilterAndRefresh({ fromDate: next })
                }
              />
            )}
          </Field>
          <Field id="report-to" label="Period end">
            {(props) => (
              <DatePicker
                {...props}
                required
                value={toDate}
                onValueChange={(next) =>
                  updateFilterAndRefresh({ toDate: next })
                }
              />
            )}
          </Field>
          <Field id="report-building" label="Building scope">
            {(props) => (
              <Select
                {...props}
                variant="filter"
                value={building}
                onChange={(event) =>
                  updateFilterAndRefresh({
                    building: event.target.value as ReportBuildingFilter,
                  })
                }
              >
                {REPORT_BUILDING_FILTERS.map((option) => (
                  <option key={option} value={option}>
                    {REPORT_BUILDING_FILTER_LABELS[option]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </SearchFilterBar>

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ReportTypeValue)}
        variant="underline"
        className="grid gap-5"
      >
        <TabsList aria-label="Operational reports" className="overflow-x-auto">
          {REPORT_TYPES.map((type) => (
            <TabsTrigger key={type} value={type} className="whitespace-nowrap">
              {REPORT_LABELS[type]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="occupancy">
          <OccupancyReportPanel overview={overview} asOfLabel={asOfLabel} />
        </TabsContent>

        <TabsContent value="rent-roll">
          <RentRollReportPanel overview={overview} asOfLabel={asOfLabel} />
        </TabsContent>

        <TabsContent value="receivables-aging">
          <ReceivablesAgingReportPanel
            overview={overview}
            asOfLabel={asOfLabel}
          />
        </TabsContent>

        <TabsContent value="collections">
          <CollectionsReportPanel
            overview={overview}
            periodLabel={periodLabel}
          />
        </TabsContent>

        <TabsContent value="transient-revenue">
          <TransientRevenueReportPanel
            overview={overview}
            periodLabel={periodLabel}
          />
        </TabsContent>

        <TabsContent value="maintenance">
          <MaintenanceReportPanel
            overview={overview}
            periodLabel={periodLabel}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
