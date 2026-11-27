import {
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_STATUS_LABELS,
} from "@/features/maintenance/schemas";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/features/payments/schemas";
import { ROOM_BUILDING_LABELS } from "@/features/rooms/schemas";
import { TRANSIENT_RESERVATION_STATUS_LABELS } from "@/features/transients/schemas";
import { formatManilaDate, formatManilaDateTime } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import {
  AGING_BUCKET_LABELS,
  REPORT_BUILDING_FILTER_LABELS,
  REPORT_DESCRIPTIONS,
  REPORT_LABELS,
  type ReportBusinessProfile,
  type ReportExportFormat,
  type ReportsOverviewDto,
  type ReportTypeValue,
} from "./schemas";

const SIGNED_DECIMAL_PATTERN = /^-\d+(?:\.\d{1,2})?$/;
const FORMULA_TRIGGER_PATTERN = /^[=+\-@\t\r]/;
const PERIOD_BASED_REPORTS = new Set<ReportTypeValue>([
  "collections",
  "transient-revenue",
  "maintenance",
]);

export type ReportCellType =
  "text" | "number" | "percent" | "currency" | "date" | "boolean";

export type ReportTableCell = string | number | boolean | null | undefined;

export type ReportTableColumn = {
  key: string;
  label: string;
  type: ReportCellType;
  align?: "left" | "right" | "center";
  /** Relative column width unit used for Word/PDF layout proportions and Excel column widths. */
  widthWeight?: number;
};

export type ReportTableSection = {
  id: string;
  title: string;
  description?: string;
  columns: ReportTableColumn[];
  rows: ReportTableCell[][];
  emptyMessage: string;
};

export type ReportSummaryMetric = {
  label: string;
  value: string;
  detail?: string;
};

export type SharedReportDocument = {
  reportType: ReportTypeValue;
  title: string;
  description: string;
  asOfLabel: string;
  periodLabel: string;
  dateSummaryLabel: string;
  buildingLabel: string;
  generatedAtLabel: string;
  business: ReportBusinessProfile;
  metadata: Array<{ label: string; value: string }>;
  metrics: ReportSummaryMetric[];
  breakdowns: ReportTableSection[];
  detailTable: ReportTableSection;
  rowCount: number;
};

/**
 * Neutralizes spreadsheet formula injection (`=`, `+`, `-`, `@`, tab, CR) on text
 * cells while keeping valid signed decimal values numeric.
 */
export function sanitizeSpreadsheetText(raw: string): string {
  return FORMULA_TRIGGER_PATTERN.test(raw) && !SIGNED_DECIMAL_PATTERN.test(raw)
    ? `'${raw}`
    : raw;
}

/**
 * Resolves a standardized export filename matching report type, active date scope, and format.
 */
export function buildReportExportFilename(
  reportType: ReportTypeValue,
  filters: ReportsOverviewDto["filters"],
  format: ReportExportFormat,
): string {
  const datePart = PERIOD_BASED_REPORTS.has(reportType)
    ? `${filters.fromDate}_to_${filters.toDate}`
    : filters.asOfDate;
  return `daisy-${reportType}-${datePart}.${format}`;
}

/**
 * Returns the detail row count audited for a given operational report.
 */
export function summarizeReportRowCount(
  reportType: ReportTypeValue,
  overview: ReportsOverviewDto,
): number {
  switch (reportType) {
    case "occupancy":
      return overview.occupancy.rows.length;
    case "rent-roll":
      return overview.rentRoll.rows.length;
    case "receivables-aging":
      return overview.receivablesAging.rows.length;
    case "collections":
      return overview.collections.rows.length;
    case "transient-revenue":
      return overview.transientRevenue.rows.length;
    case "maintenance":
      return overview.maintenance.rows.length;
  }
}

/**
 * Formats one table cell for read-oriented document exports (Word and PDF).
 */
export function formatReportCellDisplay(
  value: ReportTableCell,
  type: ReportCellType,
): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (type === "boolean") {
    return value ? "Yes" : "No";
  }
  if (type === "currency") {
    return formatPhpCurrency(String(value));
  }
  if (type === "percent") {
    return `${value}%`;
  }
  if (type === "date") {
    try {
      return formatManilaDate(String(value));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Strips `(PHP)` unit suffixes for document tables where currency symbol formatting is applied inline.
 */
export function formatDocumentColumnLabel(column: ReportTableColumn): string {
  if (column.type === "currency") {
    return column.label.replace(/\s*\(PHP\)$/i, "");
  }
  return column.label;
}

function formatOptionalPhp(value: string | null): string {
  return value === null ? "—" : formatPhpCurrency(value);
}

function formatOptionalPercent(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

type ReportContentSections = {
  metrics: ReportSummaryMetric[];
  breakdowns: ReportTableSection[];
  detailTable: ReportTableSection;
};

function buildReportSections(
  reportType: ReportTypeValue,
  overview: ReportsOverviewDto,
): ReportContentSections {
  switch (reportType) {
    case "occupancy": {
      const s = overview.occupancy.summary;
      return {
        metrics: [
          {
            label: "Occupancy rate",
            value: formatOptionalPercent(s.occupancyRatePercent),
            detail: `${s.occupiedRooms} of ${s.totalRooms} active rooms occupied`,
          },
          {
            label: "Available beds",
            value: String(s.availableBeds),
            detail: `${s.occupiedBeds} occupied / ${s.totalBeds} total beds`,
          },
          {
            label: "Boarding vs. transient",
            value: formatOptionalPercent(s.boardingOccupancyRatePercent),
            detail: `Boarding ${s.boardingRooms} rooms · Transient ${formatOptionalPercent(s.transientOccupancyRatePercent)} (${s.transientRooms} rooms)`,
          },
          {
            label: "Maintenance holds",
            value: String(s.maintenanceRooms),
            detail: `${s.maintenanceBeds} beds unavailable due to holds`,
          },
        ],
        breakdowns: [
          {
            id: "occupancy-by-building",
            title: "Occupancy by building",
            columns: [
              {
                key: "building",
                label: "Building",
                type: "text",
                widthWeight: 2,
              },
              {
                key: "totalRooms",
                label: "Rooms",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "occupiedRooms",
                label: "Occupied",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "availableRooms",
                label: "Available",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "maintenanceRooms",
                label: "Maint. hold",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "occupancyRate",
                label: "Occupancy %",
                type: "percent",
                align: "right",
                widthWeight: 1.2,
              },
              {
                key: "occupiedMonthlyRevenue",
                label: "Occupied monthly rent (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.7,
              },
            ],
            rows: overview.occupancy.byBuilding.map((row) => [
              row.buildingLabel,
              row.totalRooms,
              row.occupiedRooms,
              row.availableRooms,
              row.maintenanceRooms,
              row.occupancyRatePercent,
              row.occupiedMonthlyRevenue,
            ]),
            emptyMessage: "No building occupancy records matched.",
          },
        ],
        detailTable: {
          id: "occupancy-rooms",
          title: "Room occupancy ledger",
          columns: [
            {
              key: "roomCode",
              label: "Room code",
              type: "text",
              widthWeight: 1.1,
            },
            {
              key: "roomName",
              label: "Room name",
              type: "text",
              widthWeight: 1.8,
            },
            {
              key: "building",
              label: "Building",
              type: "text",
              widthWeight: 1.5,
            },
            { key: "floor", label: "Floor", type: "text", widthWeight: 0.8 },
            {
              key: "isTransientPublished",
              label: "Published transient",
              type: "boolean",
              align: "center",
              widthWeight: 1.1,
            },
            { key: "status", label: "Status", type: "text", widthWeight: 1.2 },
            {
              key: "capacityBeds",
              label: "Capacity beds",
              type: "number",
              align: "right",
              widthWeight: 0.9,
            },
            {
              key: "occupiedBeds",
              label: "Occupied beds",
              type: "number",
              align: "right",
              widthWeight: 0.9,
            },
            {
              key: "availableBeds",
              label: "Available beds",
              type: "number",
              align: "right",
              widthWeight: 0.9,
            },
            {
              key: "maintenanceBeds",
              label: "Maintenance beds",
              type: "number",
              align: "right",
              widthWeight: 0.9,
            },
            {
              key: "activeAllocationCount",
              label: "Active allocations",
              type: "number",
              align: "right",
              widthWeight: 0.9,
            },
            {
              key: "monthlyRate",
              label: "Monthly rate (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.4,
            },
            {
              key: "transientDailyRate",
              label: "Transient daily rate (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.4,
            },
          ],
          rows: overview.occupancy.rows.map((row) => [
            row.roomCode,
            row.roomName,
            ROOM_BUILDING_LABELS[row.building],
            row.floor,
            row.isTransientPublished,
            row.status,
            row.capacityBeds,
            row.occupiedBeds,
            row.availableBeds,
            row.maintenanceBeds,
            row.activeAllocationCount,
            row.monthlyRate,
            row.transientDailyRate ?? "",
          ]),
          emptyMessage: "No rooms matched the selected occupancy filters.",
        },
      };
    }
    case "rent-roll": {
      const s = overview.rentRoll.summary;
      return {
        metrics: [
          {
            label: "Active assignments",
            value: String(s.activeAssignments),
            detail: "Occupied boarding agreements on as-of date",
          },
          {
            label: "Monthly rent total",
            value: formatPhpCurrency(s.totalMonthlyRent),
            detail: `Avg rate ${formatOptionalPhp(s.averageMonthlyRent)}`,
          },
          {
            label: "Security deposits",
            value: formatPhpCurrency(s.totalSecurityDeposits),
            detail: "Held contract deposits",
          },
          {
            label: "Open invoice balance",
            value: formatPhpCurrency(s.totalOpenBalance),
            detail: `${formatOptionalPercent(s.openBalanceToRentPercent)} of monthly rent`,
          },
        ],
        breakdowns: [
          {
            id: "rent-roll-expiries",
            title: "Lease expiry windows",
            columns: [
              {
                key: "label",
                label: "Expiry window",
                type: "text",
                widthWeight: 2.2,
              },
              {
                key: "count",
                label: "Contracts",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "monthlyRentAtRisk",
                label: "Monthly rent at risk (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.8,
              },
            ],
            rows: overview.rentRoll.leaseExpiries.map((row) => [
              row.label,
              row.count,
              row.monthlyRentAtRisk,
            ]),
            emptyMessage: "No lease expiry buckets available.",
          },
        ],
        detailTable: {
          id: "rent-roll-ledger",
          title: "Tenant rent roll",
          columns: [
            {
              key: "tenantName",
              label: "Tenant name",
              type: "text",
              widthWeight: 2,
            },
            {
              key: "roomCode",
              label: "Room code",
              type: "text",
              widthWeight: 1,
            },
            {
              key: "roomName",
              label: "Room name",
              type: "text",
              widthWeight: 1.6,
            },
            { key: "bedCode", label: "Bed", type: "text", widthWeight: 0.8 },
            {
              key: "startDate",
              label: "Start date",
              type: "date",
              widthWeight: 1.1,
            },
            {
              key: "endDate",
              label: "End date",
              type: "date",
              widthWeight: 1.1,
            },
            { key: "status", label: "Status", type: "text", widthWeight: 1 },
            {
              key: "monthlyRate",
              label: "Monthly rate (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.3,
            },
            {
              key: "securityDeposit",
              label: "Security deposit (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.3,
            },
            {
              key: "openInvoiceBalance",
              label: "Open invoice balance (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.4,
            },
          ],
          rows: overview.rentRoll.rows.map((row) => [
            row.tenantName,
            row.roomCode,
            row.roomName,
            row.bedCode,
            row.startDate,
            row.endDate,
            row.status,
            row.monthlyRate,
            row.securityDeposit,
            row.openInvoiceBalance,
          ]),
          emptyMessage: "No active boarding assignments matched.",
        },
      };
    }
    case "receivables-aging": {
      const s = overview.receivablesAging.summary;
      return {
        metrics: [
          {
            label: "Total outstanding",
            value: formatPhpCurrency(s.totalOutstanding),
            detail: `${s.openInvoicesCount} open invoices`,
          },
          {
            label: "Overdue balance",
            value: formatPhpCurrency(s.overdueAmount),
            detail: `${s.overdueInvoicesCount} overdue invoices`,
          },
          {
            label: "Current (not past due)",
            value: formatPhpCurrency(s.currentAmount),
            detail: "Due on or after as-of date",
          },
          {
            label: "91+ days past due",
            value: formatPhpCurrency(s.bucket91PlusAmount),
            detail: `61–90d: ${formatPhpCurrency(s.bucket61To90Amount)}`,
          },
        ],
        breakdowns: [
          {
            id: "aging-buckets",
            title: "Overdue balance summary",
            columns: [
              {
                key: "label",
                label: "Aging bucket",
                type: "text",
                widthWeight: 2.4,
              },
              {
                key: "count",
                label: "Invoices",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "outstandingAmount",
                label: "Outstanding balance (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.8,
              },
            ],
            rows: overview.receivablesAging.buckets.map((row) => [
              row.label,
              row.count,
              row.outstandingAmount,
            ]),
            emptyMessage: "No receivable aging buckets computed.",
          },
          {
            id: "aging-by-scope",
            title: "Receivables by building scope",
            columns: [
              {
                key: "scopeLabel",
                label: "Scope",
                type: "text",
                widthWeight: 1.8,
              },
              {
                key: "openInvoicesCount",
                label: "Open invoices",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "overdueInvoicesCount",
                label: "Overdue",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "outstandingAmount",
                label: "Total outstanding (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.6,
              },
              {
                key: "overdueAmount",
                label: "Overdue amount (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.6,
              },
            ],
            rows: overview.receivablesAging.byScope.map((row) => [
              row.scopeLabel,
              row.openInvoicesCount,
              row.overdueInvoicesCount,
              row.outstandingAmount,
              row.overdueAmount,
            ]),
            emptyMessage: "No receivables by building scope.",
          },
        ],
        detailTable: {
          id: "aging-invoices",
          title: "Open invoice aging schedule",
          columns: [
            {
              key: "invoiceNumber",
              label: "Invoice number",
              type: "text",
              widthWeight: 1.4,
            },
            { key: "scope", label: "Scope", type: "text", widthWeight: 1.3 },
            {
              key: "partyName",
              label: "Account holder",
              type: "text",
              widthWeight: 1.8,
            },
            {
              key: "issuedDate",
              label: "Issued date",
              type: "date",
              widthWeight: 1.1,
            },
            {
              key: "dueDate",
              label: "Due date",
              type: "date",
              widthWeight: 1.1,
            },
            {
              key: "daysPastDue",
              label: "Days past due",
              type: "number",
              align: "right",
              widthWeight: 0.9,
            },
            {
              key: "bucket",
              label: "Aging bucket",
              type: "text",
              widthWeight: 1.6,
            },
            {
              key: "totalAmount",
              label: "Total as of date (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.4,
            },
            {
              key: "paidAsOfAmount",
              label: "Paid as of date (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.4,
            },
            {
              key: "balanceDue",
              label: "Balance due (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.4,
            },
          ],
          rows: overview.receivablesAging.rows.map((row) => [
            row.invoiceNumber,
            row.scope === "BOARDING" ? "Boarding House" : "Transient Building",
            row.partyName,
            row.issuedDate,
            row.dueDate,
            row.daysPastDue,
            AGING_BUCKET_LABELS[row.bucket],
            row.totalAmount,
            row.paidAsOfAmount,
            row.balanceDue,
          ]),
          emptyMessage: "No open invoices as of the selected date.",
        },
      };
    }
    case "collections": {
      const s = overview.collections.summary;
      return {
        metrics: [
          {
            label: "Net collected",
            value: formatPhpCurrency(s.netCollectedAmount),
            detail: `${s.entryCount} ledger entries (${s.postedCount} posted)`,
          },
          {
            label: "Gross posted",
            value: formatPhpCurrency(s.grossPostedAmount),
            detail: "Confirmed receipt entries",
          },
          {
            label: "Reversals",
            value: formatPhpCurrency(s.totalReversalsAmount),
            detail: `${s.reversalCount} reversal entries (${formatOptionalPercent(s.reversalRatePercent)} rate)`,
          },
          {
            label: "Unallocated credit",
            value: formatPhpCurrency(s.unallocatedCreditTotal),
            detail: "Remaining open receipt credit",
          },
        ],
        breakdowns: [
          {
            id: "collections-by-method",
            title: "Collections by payment method",
            columns: [
              {
                key: "methodLabel",
                label: "Method",
                type: "text",
                widthWeight: 1.8,
              },
              {
                key: "entryCount",
                label: "Entries",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "postedAmount",
                label: "Posted (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.5,
              },
              {
                key: "reversalAmount",
                label: "Reversals (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.5,
              },
              {
                key: "netAmount",
                label: "Net collected (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.5,
              },
            ],
            rows: overview.collections.byMethod.map((row) => [
              row.methodLabel,
              row.entryCount,
              row.postedAmount,
              row.reversalAmount,
              row.netAmount,
            ]),
            emptyMessage: "No collection entries recorded in this window.",
          },
          {
            id: "collections-by-scope",
            title: "Collections by building scope",
            columns: [
              {
                key: "scopeLabel",
                label: "Scope",
                type: "text",
                widthWeight: 1.8,
              },
              {
                key: "entryCount",
                label: "Entries",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "postedAmount",
                label: "Posted (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.5,
              },
              {
                key: "reversalAmount",
                label: "Reversals (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.5,
              },
              {
                key: "netAmount",
                label: "Net collected (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.5,
              },
            ],
            rows: overview.collections.byScope.map((row) => [
              row.scopeLabel,
              row.entryCount,
              row.postedAmount,
              row.reversalAmount,
              row.netAmount,
            ]),
            emptyMessage: "No collections by building scope.",
          },
        ],
        detailTable: {
          id: "collections-ledger",
          title: "Collections & reversal register",
          columns: [
            {
              key: "receiptNumber",
              label: "Receipt number",
              type: "text",
              widthWeight: 1.4,
            },
            {
              key: "paidDate",
              label: "Paid date",
              type: "date",
              widthWeight: 1.1,
            },
            {
              key: "status",
              label: "Entry status",
              type: "text",
              widthWeight: 1.2,
            },
            {
              key: "method",
              label: "Payment method",
              type: "text",
              widthWeight: 1.2,
            },
            { key: "scope", label: "Scope", type: "text", widthWeight: 1.4 },
            {
              key: "partyName",
              label: "Account holder",
              type: "text",
              widthWeight: 1.8,
            },
            {
              key: "amount",
              label: "Amount (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.4,
            },
            {
              key: "unallocatedAmount",
              label: "Unallocated amount (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.4,
            },
            {
              key: "reversalReason",
              label: "Reversal reason",
              type: "text",
              widthWeight: 2,
            },
          ],
          rows: overview.collections.rows.map((row) => [
            row.receiptNumber ?? "Reversal entry",
            row.paidDate,
            PAYMENT_STATUS_LABELS[row.status],
            PAYMENT_METHOD_LABELS[row.method],
            row.scope === "BOARDING" ? "Boarding House" : "Transient Building",
            row.partyName,
            row.amount,
            row.unallocatedAmount,
            row.reversalReason ?? "",
          ]),
          emptyMessage: "No receipts or reversals recorded in this period.",
        },
      };
    }
    case "transient-revenue": {
      const s = overview.transientRevenue.summary;
      return {
        metrics: [
          {
            label: "Gross stay revenue",
            value: formatPhpCurrency(s.grossStayRevenue),
            detail: `${s.activeOrCompletedCount} active/completed of ${s.staysCount} stays`,
          },
          {
            label: "Invoiced amount",
            value: formatPhpCurrency(s.invoicedAmount),
            detail: `Collection rate ${formatOptionalPercent(s.collectionRatePercent)}`,
          },
          {
            label: "Collected amount",
            value: formatPhpCurrency(s.collectedAmount),
            detail: `ADR ${formatOptionalPhp(s.averageDailyRate)}`,
          },
          {
            label: "Total stay nights",
            value: String(s.totalNights),
            detail: `Avg stay ${s.averageNightsPerStay ?? "—"} nights · ${s.cancelledCount} cancelled, ${s.noShowCount} no-show`,
          },
        ],
        breakdowns: [
          {
            id: "transient-by-status",
            title: "Reservations by status",
            columns: [
              {
                key: "statusLabel",
                label: "Status",
                type: "text",
                widthWeight: 1.8,
              },
              {
                key: "staysCount",
                label: "Stays",
                type: "number",
                align: "right",
                widthWeight: 0.9,
              },
              {
                key: "totalNights",
                label: "Nights",
                type: "number",
                align: "right",
                widthWeight: 0.9,
              },
              {
                key: "stayAmount",
                label: "Stay total (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.5,
              },
              {
                key: "collectedAmount",
                label: "Collected (PHP)",
                type: "currency",
                align: "right",
                widthWeight: 1.5,
              },
            ],
            rows: overview.transientRevenue.byStatus.map((row) => [
              row.statusLabel,
              row.staysCount,
              row.totalNights,
              row.stayAmount,
              row.collectedAmount,
            ]),
            emptyMessage: "No reservations grouped by status.",
          },
        ],
        detailTable: {
          id: "transient-revenue-ledger",
          title: "Transient stays & revenue register",
          columns: [
            {
              key: "guestName",
              label: "Guest name",
              type: "text",
              widthWeight: 1.8,
            },
            {
              key: "roomCode",
              label: "Room code",
              type: "text",
              widthWeight: 1,
            },
            {
              key: "roomName",
              label: "Room name",
              type: "text",
              widthWeight: 1.6,
            },
            {
              key: "checkInDate",
              label: "Check-in date",
              type: "date",
              widthWeight: 1.1,
            },
            {
              key: "checkOutDate",
              label: "Check-out date",
              type: "date",
              widthWeight: 1.1,
            },
            {
              key: "nights",
              label: "Nights",
              type: "number",
              align: "right",
              widthWeight: 0.8,
            },
            { key: "status", label: "Status", type: "text", widthWeight: 1.3 },
            {
              key: "dailyRate",
              label: "Daily rate (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.3,
            },
            {
              key: "totalAmount",
              label: "Stay total (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.3,
            },
            {
              key: "invoicedAmount",
              label: "Invoiced amount (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.3,
            },
            {
              key: "collectedAmount",
              label: "Collected amount (PHP)",
              type: "currency",
              align: "right",
              widthWeight: 1.3,
            },
          ],
          rows: overview.transientRevenue.rows.map((row) => [
            row.guestName,
            row.roomCode,
            row.roomName,
            row.checkInDate,
            row.checkOutDate,
            row.nights,
            TRANSIENT_RESERVATION_STATUS_LABELS[row.status],
            row.dailyRate,
            row.totalAmount,
            row.invoicedAmount,
            row.collectedAmount,
          ]),
          emptyMessage: "No transient stays fell within this reporting period.",
        },
      };
    }
    case "maintenance": {
      const s = overview.maintenance.summary;
      return {
        metrics: [
          {
            label: "Tickets in window",
            value: String(s.totalInWindow),
            detail: `${s.openCount} open (${s.urgentOpenCount} urgent)`,
          },
          {
            label: "Active occupancy holds",
            value: String(s.activeHoldCount),
            detail: "Rooms held out of rentable inventory",
          },
          {
            label: "Resolved in window",
            value: String(s.resolvedInWindow),
            detail: `${s.cancelledInWindow} cancelled`,
          },
          {
            label: "Resolution rate",
            value: formatOptionalPercent(s.resolutionRatePercent),
            detail: `Avg turnaround ${s.avgResolutionDays ? `${s.avgResolutionDays} days` : "—"}`,
          },
        ],
        breakdowns: [
          {
            id: "maintenance-by-category",
            title: "Maintenance by category",
            columns: [
              {
                key: "categoryLabel",
                label: "Category",
                type: "text",
                widthWeight: 2,
              },
              {
                key: "totalCount",
                label: "Total",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "openCount",
                label: "Open",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "activeHoldCount",
                label: "Active holds",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "resolvedCount",
                label: "Resolved",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
            ],
            rows: overview.maintenance.byCategory.map((row) => [
              row.categoryLabel,
              row.totalCount,
              row.openCount,
              row.activeHoldCount,
              row.resolvedCount,
            ]),
            emptyMessage: "No maintenance categories matched.",
          },
          {
            id: "maintenance-by-priority",
            title: "Maintenance by priority",
            columns: [
              {
                key: "priorityLabel",
                label: "Priority",
                type: "text",
                widthWeight: 2,
              },
              {
                key: "totalCount",
                label: "Total",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "openCount",
                label: "Open",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "activeHoldCount",
                label: "Active holds",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
              {
                key: "resolvedCount",
                label: "Resolved",
                type: "number",
                align: "right",
                widthWeight: 1,
              },
            ],
            rows: overview.maintenance.byPriority.map((row) => [
              row.priorityLabel,
              row.totalCount,
              row.openCount,
              row.activeHoldCount,
              row.resolvedCount,
            ]),
            emptyMessage: "No maintenance priorities matched.",
          },
        ],
        detailTable: {
          id: "maintenance-ledger",
          title: "Maintenance request register",
          columns: [
            {
              key: "roomCode",
              label: "Room code",
              type: "text",
              widthWeight: 1,
            },
            {
              key: "roomName",
              label: "Room name",
              type: "text",
              widthWeight: 1.5,
            },
            {
              key: "building",
              label: "Building",
              type: "text",
              widthWeight: 1.4,
            },
            { key: "title", label: "Title", type: "text", widthWeight: 2.3 },
            {
              key: "category",
              label: "Category",
              type: "text",
              widthWeight: 1.2,
            },
            {
              key: "priority",
              label: "Priority",
              type: "text",
              widthWeight: 1,
            },
            { key: "status", label: "Status", type: "text", widthWeight: 1.2 },
            {
              key: "blocksOccupancy",
              label: "Blocks occupancy",
              type: "boolean",
              align: "center",
              widthWeight: 1,
            },
            {
              key: "reportedDate",
              label: "Reported date",
              type: "date",
              widthWeight: 1.1,
            },
            {
              key: "resolvedDate",
              label: "Resolved date",
              type: "date",
              widthWeight: 1.1,
            },
          ],
          rows: overview.maintenance.rows.map((row) => [
            row.roomCode,
            row.roomName,
            ROOM_BUILDING_LABELS[row.building],
            row.title,
            MAINTENANCE_CATEGORY_LABELS[row.category],
            MAINTENANCE_PRIORITY_LABELS[row.priority],
            MAINTENANCE_STATUS_LABELS[row.status],
            row.blocksOccupancy,
            row.reportedDate,
            row.resolvedDate ?? "",
          ]),
          emptyMessage: "No maintenance tickets matched this reporting period.",
        },
      };
    }
  }
}

/**
 * Builds one canonical, format-agnostic report document template shared across
 * CSV, Excel (`.xlsx`), Word (`.docx`), and PDF (`.pdf`) exports.
 */
export function buildSharedReportDocument(
  reportType: ReportTypeValue,
  overview: ReportsOverviewDto,
  business?: Partial<ReportBusinessProfile>,
): SharedReportDocument {
  const title = `${REPORT_LABELS[reportType]} report`;
  const description = REPORT_DESCRIPTIONS[reportType];
  const asOfLabel = formatManilaDate(overview.filters.asOfDate);
  const periodLabel = `${formatManilaDate(overview.filters.fromDate)} to ${formatManilaDate(overview.filters.toDate)}`;
  const dateSummaryLabel = PERIOD_BASED_REPORTS.has(reportType)
    ? `Period: ${periodLabel}`
    : `As of ${asOfLabel}`;
  const buildingLabel =
    REPORT_BUILDING_FILTER_LABELS[overview.filters.building];
  const generatedAtLabel = formatManilaDateTime(new Date(overview.generatedAt));

  const resolvedBusiness: ReportBusinessProfile = {
    businessName:
      business?.businessName?.trim() || "Daisy Boarding & Transient",
    businessAddress: business?.businessAddress?.trim() || null,
    businessPhone: business?.businessPhone?.trim() || null,
    tin: business?.tin?.trim() || null,
  };

  const { metrics, breakdowns, detailTable } = buildReportSections(
    reportType,
    overview,
  );
  const rowCount = summarizeReportRowCount(reportType, overview);

  const metadata: Array<{ label: string; value: string }> = [
    { label: "Property", value: resolvedBusiness.businessName },
    { label: "Building scope", value: buildingLabel },
    { label: "As-of date", value: asOfLabel },
    { label: "Reporting period", value: periodLabel },
    { label: "Currency", value: "PHP (Philippine Peso)" },
    {
      label: "Detail records",
      value: `${rowCount} ${rowCount === 1 ? "row" : "rows"}`,
    },
    { label: "Generated", value: `${generatedAtLabel} (UTC+8)` },
  ];

  return {
    reportType,
    title,
    description,
    asOfLabel,
    periodLabel,
    dateSummaryLabel,
    buildingLabel,
    generatedAtLabel,
    business: resolvedBusiness,
    metadata,
    metrics,
    breakdowns,
    detailTable,
    rowCount,
  };
}
