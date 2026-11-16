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
import {
  AGING_BUCKET_LABELS,
  REPORT_LABELS,
  type ReportsOverviewDto,
  type ReportTypeValue,
} from "./schemas";

const SIGNED_DECIMAL_PATTERN = /^-\d+(?:\.\d{1,2})?$/;
const FORMULA_TRIGGER_PATTERN = /^[=+\-@\t\r]/;

export type CsvCellInput = string | number | boolean | null | undefined;

/**
 * Escapes a single CSV field per RFC 4180 while neutralizing spreadsheet
 * formula injection (`=`, `+`, `-`, `@`, tab, CR). Valid signed numbers such
 * as `-1500.00` stay numeric so accounting reversals import cleanly.
 */
export function escapeCsvCell(value: CsvCellInput): string {
  if (value === null || value === undefined) {
    return "";
  }
  const raw =
    typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  const safe =
    FORMULA_TRIGGER_PATTERN.test(raw) && !SIGNED_DECIMAL_PATTERN.test(raw)
      ? `'${raw}`
      : raw;
  const normalized = safe.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

/**
 * Serializes header metadata rows and tabular data into CRLF-delimited UTF-8 CSV.
 */
export function serializeCsvDocument(
  rows: ReadonlyArray<ReadonlyArray<CsvCellInput>>,
): string {
  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
}

/**
 * Builds the download filename for a report CSV export.
 */
export function buildReportCsvFilename(
  reportType: ReportTypeValue,
  filters: ReportsOverviewDto["filters"],
): string {
  const datePart =
    reportType === "collections" ||
    reportType === "transient-revenue" ||
    reportType === "maintenance"
      ? `${filters.fromDate}_to_${filters.toDate}`
      : filters.asOfDate;
  return `daisy-${reportType}-${datePart}.csv`;
}

/**
 * Serializes any of Daisy's six operational reports from an overview snapshot.
 */
export function buildReportCsv(
  reportType: ReportTypeValue,
  overview: ReportsOverviewDto,
): string {
  const metaRows: CsvCellInput[][] = [
    ["Report", REPORT_LABELS[reportType]],
    ["As of date", overview.filters.asOfDate],
    ["Period", `${overview.filters.fromDate} to ${overview.filters.toDate}`],
    ["Building filter", overview.filters.building],
    ["Currency", "PHP"],
    [],
  ];

  switch (reportType) {
    case "occupancy": {
      const header: CsvCellInput[] = [
        "Room code",
        "Room name",
        "Building",
        "Floor",
        "Published transient",
        "Status",
        "Capacity beds",
        "Occupied beds",
        "Available beds",
        "Maintenance beds",
        "Active allocations",
        "Monthly rate (PHP)",
        "Transient daily rate (PHP)",
      ];
      const body = overview.occupancy.rows.map((row) => [
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
      ]);
      return serializeCsvDocument([...metaRows, header, ...body]);
    }
    case "rent-roll": {
      const header: CsvCellInput[] = [
        "Tenant name",
        "Room code",
        "Room name",
        "Bed",
        "Start date",
        "End date",
        "Status",
        "Monthly rate (PHP)",
        "Security deposit (PHP)",
        "Open invoice balance (PHP)",
      ];
      const body = overview.rentRoll.rows.map((row) => [
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
      ]);
      return serializeCsvDocument([...metaRows, header, ...body]);
    }
    case "receivables-aging": {
      const header: CsvCellInput[] = [
        "Invoice number",
        "Scope",
        "Account holder",
        "Issued date",
        "Due date",
        "Days past due",
        "Aging bucket",
        "Total as of date (PHP)",
        "Paid as of date (PHP)",
        "Balance due (PHP)",
      ];
      const body = overview.receivablesAging.rows.map((row) => [
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
      ]);
      return serializeCsvDocument([...metaRows, header, ...body]);
    }
    case "collections": {
      const header: CsvCellInput[] = [
        "Receipt number",
        "Paid date",
        "Entry status",
        "Payment method",
        "Scope",
        "Account holder",
        "Amount (PHP)",
        "Unallocated amount (PHP)",
        "Reversal reason",
      ];
      const body = overview.collections.rows.map((row) => [
        row.receiptNumber ?? "Reversal entry",
        row.paidDate,
        PAYMENT_STATUS_LABELS[row.status],
        PAYMENT_METHOD_LABELS[row.method],
        row.scope === "BOARDING" ? "Boarding House" : "Transient Building",
        row.partyName,
        row.amount,
        row.unallocatedAmount,
        row.reversalReason ?? "",
      ]);
      return serializeCsvDocument([...metaRows, header, ...body]);
    }
    case "transient-revenue": {
      const header: CsvCellInput[] = [
        "Guest name",
        "Room code",
        "Room name",
        "Check-in date",
        "Check-out date",
        "Nights",
        "Status",
        "Daily rate (PHP)",
        "Stay total (PHP)",
        "Invoiced amount (PHP)",
        "Collected amount (PHP)",
      ];
      const body = overview.transientRevenue.rows.map((row) => [
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
      ]);
      return serializeCsvDocument([...metaRows, header, ...body]);
    }
    case "maintenance": {
      const header: CsvCellInput[] = [
        "Room code",
        "Room name",
        "Building",
        "Title",
        "Category",
        "Priority",
        "Status",
        "Blocks occupancy",
        "Reported date",
        "Resolved date",
      ];
      const body = overview.maintenance.rows.map((row) => [
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
      ]);
      return serializeCsvDocument([...metaRows, header, ...body]);
    }
  }
}