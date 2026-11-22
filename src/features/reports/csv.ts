import {
  REPORT_LABELS,
  type ReportsOverviewDto,
  type ReportTypeValue,
} from "./schemas";
import {
  buildReportExportFilename,
  buildSharedReportDocument,
  sanitizeSpreadsheetText,
} from "./template";

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
  const safe = sanitizeSpreadsheetText(raw);
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
  return buildReportExportFilename(reportType, filters, "csv");
}

/**
 * Serializes any of Daisy's six operational reports from the shared report template.
 */
export function buildReportCsv(
  reportType: ReportTypeValue,
  overview: ReportsOverviewDto,
): string {
  const doc = buildSharedReportDocument(reportType, overview);
  const metaRows: CsvCellInput[][] = [
    ["Report", REPORT_LABELS[reportType]],
    ["As of date", overview.filters.asOfDate],
    ["Period", `${overview.filters.fromDate} to ${overview.filters.toDate}`],
    ["Building filter", overview.filters.building],
    ["Currency", "PHP"],
    [],
  ];
  const header: CsvCellInput[] = doc.detailTable.columns.map(
    (column) => column.label,
  );
  return serializeCsvDocument([...metaRows, header, ...doc.detailTable.rows]);
}
