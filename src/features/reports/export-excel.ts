import writeXlsxFile, {
  type Cell,
  type Row,
  type SheetData,
} from "write-excel-file/universal";
import { parseMoneyDecimal } from "@/lib/money";
import {
  formatReportCellDisplay,
  sanitizeSpreadsheetText,
  type ReportTableCell,
  type ReportTableColumn,
  type ReportTableSection,
  type SharedReportDocument,
} from "./template";

const CHARCOAL = "#222222";
const WHITE = "#FFFFFF";
const STONE = "#F7F7F7";
const MUTED = "#6A6A6A";
const BORDER = "#E4E4E4";
const RAUSCH = "#E00B41";

function toExcelNumeric(
  value: ReportTableCell,
  type: ReportTableColumn["type"],
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (type === "currency") {
    const centavos = parseMoneyDecimal(String(value));
    return Number(centavos) / 100;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildTypedExcelCell(
  value: ReportTableCell,
  column: ReportTableColumn,
  zebra: boolean,
): Cell {
  const baseStyle = {
    backgroundColor: zebra ? STONE : WHITE,
    borderColor: BORDER,
    borderStyle: "thin" as const,
    textColor: CHARCOAL,
    alignVertical: "center" as const,
  };

  if (column.type === "currency") {
    const numeric = toExcelNumeric(value, "currency");
    if (numeric === null) {
      return { ...baseStyle, type: String, value: "—", align: "right" };
    }
    return {
      ...baseStyle,
      type: Number,
      value: numeric,
      format: "₱#,##0.00",
      align: "right",
    };
  }

  if (column.type === "percent") {
    const numeric = toExcelNumeric(value, "percent");
    if (numeric === null) {
      return { ...baseStyle, type: String, value: "—", align: "right" };
    }
    return {
      ...baseStyle,
      type: Number,
      value: numeric,
      format: '0"%"',
      align: "right",
    };
  }

  if (column.type === "number") {
    const numeric = toExcelNumeric(value, "number");
    if (numeric === null) {
      return { ...baseStyle, type: String, value: "—", align: "right" };
    }
    return {
      ...baseStyle,
      type: Number,
      value: numeric,
      format: Number.isInteger(numeric) ? "#,##0" : "#,##0.##",
      align: "right",
    };
  }

  if (column.type === "boolean") {
    return {
      ...baseStyle,
      type: String,
      value: formatReportCellDisplay(value, "boolean"),
      align: "center",
    };
  }

  const rawText =
    value === null || value === undefined || value === "" ? "" : String(value);
  return {
    ...baseStyle,
    type: String,
    value: sanitizeSpreadsheetText(rawText),
    align: column.align ?? "left",
    wrap: true,
  };
}

function appendTableSection(
  rows: SheetData,
  section: ReportTableSection,
  includeEmptyBanner = true,
): void {
  rows.push([
    {
      type: String,
      value: sanitizeSpreadsheetText(section.title),
      fontWeight: "bold",
      fontSize: 12,
      textColor: CHARCOAL,
      columnSpan: Math.max(section.columns.length, 1),
    },
  ]);

  const headerRow: Row = section.columns.map((column) => ({
    type: String,
    value: column.label,
    fontWeight: "bold",
    textColor: WHITE,
    backgroundColor: CHARCOAL,
    borderColor: CHARCOAL,
    borderStyle: "thin",
    align: column.align ?? "left",
    alignVertical: "center",
    height: 24,
    wrap: true,
  }));
  rows.push(headerRow);

  if (section.rows.length === 0) {
    if (includeEmptyBanner) {
      rows.push([
        {
          type: String,
          value: section.emptyMessage,
          textColor: MUTED,
          backgroundColor: STONE,
          borderColor: BORDER,
          borderStyle: "thin",
          columnSpan: Math.max(section.columns.length, 1),
          align: "left",
        },
      ]);
    }
    return;
  }

  for (let rowIndex = 0; rowIndex < section.rows.length; rowIndex++) {
    const rawRow = section.rows[rowIndex]!;
    const zebra = rowIndex % 2 === 1;
    rows.push(
      section.columns.map((column, colIndex) =>
        buildTypedExcelCell(rawRow[colIndex], column, zebra),
      ),
    );
  }
}

function computeExcelColumnWidths(
  section: ReportTableSection,
): Array<{ width: number }> {
  return section.columns.map((column, colIndex) => {
    let maxLen = column.label.length + 3;
    for (const row of section.rows) {
      const display = formatReportCellDisplay(row[colIndex], column.type);
      if (display.length + 2 > maxLen) {
        maxLen = display.length + 2;
      }
    }
    const weightedMin = Math.round((column.widthWeight ?? 1) * 11);
    return {
      width: Math.max(12, weightedMin, Math.min(38, maxLen)),
    };
  });
}

/**
 * Renders a styled multi-sheet Excel (`.xlsx`) workbook from the shared report
 * template (`Summary` + `Detail ledger`) in pure JS compatible with Node and Workers.
 */
export async function buildReportExcel(
  doc: SharedReportDocument,
): Promise<Uint8Array> {
  const summaryRows: SheetData = [
    [
      {
        type: String,
        value: sanitizeSpreadsheetText(doc.business.businessName),
        fontWeight: "bold",
        fontSize: 11,
        textColor: RAUSCH,
        columnSpan: 6,
      },
    ],
    [
      {
        type: String,
        value: sanitizeSpreadsheetText(doc.title),
        fontWeight: "bold",
        fontSize: 16,
        textColor: CHARCOAL,
        columnSpan: 6,
        bottomBorderColor: RAUSCH,
        bottomBorderStyle: "medium",
        height: 28,
      },
    ],
    [
      {
        type: String,
        value: sanitizeSpreadsheetText(doc.description),
        textColor: MUTED,
        columnSpan: 6,
        wrap: true,
      },
    ],
    [],
    [
      {
        type: String,
        value: "Report parameters",
        fontWeight: "bold",
        fontSize: 12,
        textColor: CHARCOAL,
        columnSpan: 2,
      },
    ],
  ];

  for (const meta of doc.metadata) {
    summaryRows.push([
      {
        type: String,
        value: meta.label,
        fontWeight: "bold",
        textColor: CHARCOAL,
        backgroundColor: STONE,
        borderColor: BORDER,
        borderStyle: "thin",
      },
      {
        type: String,
        value: sanitizeSpreadsheetText(meta.value),
        textColor: CHARCOAL,
        backgroundColor: WHITE,
        borderColor: BORDER,
        borderStyle: "thin",
        columnSpan: 3,
      },
    ]);
  }

  summaryRows.push([]);
  summaryRows.push([
    {
      type: String,
      value: "Key metrics",
      fontWeight: "bold",
      fontSize: 12,
      textColor: CHARCOAL,
      columnSpan: 4,
    },
  ]);
  summaryRows.push([
    {
      type: String,
      value: "Metric",
      fontWeight: "bold",
      textColor: WHITE,
      backgroundColor: CHARCOAL,
      borderColor: CHARCOAL,
      borderStyle: "thin",
      height: 24,
    },
    {
      type: String,
      value: "Value",
      fontWeight: "bold",
      textColor: WHITE,
      backgroundColor: CHARCOAL,
      borderColor: CHARCOAL,
      borderStyle: "thin",
      align: "right",
      height: 24,
    },
    {
      type: String,
      value: "Detail",
      fontWeight: "bold",
      textColor: WHITE,
      backgroundColor: CHARCOAL,
      borderColor: CHARCOAL,
      borderStyle: "thin",
      columnSpan: 3,
      height: 24,
    },
  ]);

  doc.metrics.forEach((metric, index) => {
    const zebra = index % 2 === 1;
    const bg = zebra ? STONE : WHITE;
    summaryRows.push([
      {
        type: String,
        value: metric.label,
        fontWeight: "bold",
        textColor: CHARCOAL,
        backgroundColor: bg,
        borderColor: BORDER,
        borderStyle: "thin",
      },
      {
        type: String,
        value: sanitizeSpreadsheetText(metric.value),
        fontWeight: "bold",
        textColor: CHARCOAL,
        backgroundColor: bg,
        borderColor: BORDER,
        borderStyle: "thin",
        align: "right",
      },
      {
        type: String,
        value: sanitizeSpreadsheetText(metric.detail ?? ""),
        textColor: MUTED,
        backgroundColor: bg,
        borderColor: BORDER,
        borderStyle: "thin",
        columnSpan: 3,
        wrap: true,
      },
    ]);
  });

  for (const breakdown of doc.breakdowns) {
    summaryRows.push([]);
    appendTableSection(summaryRows, breakdown);
  }

  const maxSummaryCols = Math.max(
    7,
    ...doc.breakdowns.map((section) => section.columns.length),
  );
  const summaryColumns = Array.from({ length: maxSummaryCols }, (_, idx) => ({
    width: idx === 0 ? 28 : idx === 1 ? 20 : 18,
  }));

  const detailRows: SheetData = [
    [
      {
        type: String,
        value: `${doc.business.businessName} — ${doc.title}`,
        fontWeight: "bold",
        fontSize: 13,
        textColor: CHARCOAL,
        columnSpan: doc.detailTable.columns.length,
        bottomBorderColor: RAUSCH,
        bottomBorderStyle: "medium",
        height: 24,
      },
    ],
    [
      {
        type: String,
        value: `${doc.dateSummaryLabel} · ${doc.buildingLabel} · Currency: PHP`,
        textColor: MUTED,
        columnSpan: doc.detailTable.columns.length,
      },
    ],
    [],
  ];
  appendTableSection(detailRows, doc.detailTable);

  const blob = await writeXlsxFile(
    [
      {
        sheet: "Summary",
        data: summaryRows,
        columns: summaryColumns,
        orientation: "landscape",
      },
      {
        sheet: "Detail ledger",
        data: detailRows,
        columns: computeExcelColumnWidths(doc.detailTable),
        orientation: "landscape",
        stickyRowsCount: 5,
      },
    ],
    {
      fontFamily: "Calibri",
      fontSize: 10,
    },
  ).toBlob();

  return new Uint8Array(await blob.arrayBuffer());
}
