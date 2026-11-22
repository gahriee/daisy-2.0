import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  formatDocumentColumnLabel,
  formatReportCellDisplay,
  type ReportTableSection,
  type SharedReportDocument,
} from "./template";

const CHARCOAL = "222222";
const WHITE = "FFFFFF";
const STONE = "F7F7F7";
const MUTED = "6A6A6A";
const BORDER = "E4E4E4";
const RAUSCH = "E00B41";
const FONT_FAMILY = "Calibri";

const HAIRLINE_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: BORDER,
} as const;

const HEADER_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: CHARCOAL,
} as const;

const CELL_MARGINS = {
  top: 80,
  bottom: 80,
  left: 110,
  right: 110,
} as const;

function computeDxaWidths(
  weights: number[],
  totalWidthTwips: number,
): number[] {
  const safeWeights = weights.map((w) => (w > 0 ? w : 1));
  const totalWeight = safeWeights.reduce((acc, w) => acc + w, 0);
  const widths = safeWeights.map((w) =>
    Math.floor((w / totalWeight) * totalWidthTwips),
  );
  const assigned = widths.reduce((acc, w) => acc + w, 0);
  if (widths.length > 0) {
    widths[0]! += totalWidthTwips - assigned;
  }
  return widths;
}

function getAlignment(align: "left" | "right" | "center" | undefined) {
  if (align === "right") return AlignmentType.RIGHT;
  if (align === "center") return AlignmentType.CENTER;
  return AlignmentType.LEFT;
}

function buildMetadataTable(
  doc: SharedReportDocument,
  totalWidthTwips: number,
): Table {
  const pairs: Array<Array<{ label: string; value: string }>> = [];
  for (let i = 0; i < doc.metadata.length; i += 2) {
    pairs.push(doc.metadata.slice(i, i + 2));
  }
  const colWidths = computeDxaWidths([1.1, 2.2, 1.1, 2.2], totalWidthTwips);

  return new Table({
    width: { size: totalWidthTwips, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: pairs.map(
      (pair) =>
        new TableRow({
          cantSplit: true,
          children: [0, 1].flatMap((slot) => {
            const entry = pair[slot];
            return [
              new TableCell({
                width: { size: colWidths[slot * 2]!, type: WidthType.DXA },
                margins: CELL_MARGINS,
                shading: {
                  type: ShadingType.CLEAR,
                  color: "auto",
                  fill: STONE,
                },
                borders: {
                  top: HAIRLINE_BORDER,
                  bottom: HAIRLINE_BORDER,
                  left: HAIRLINE_BORDER,
                  right: HAIRLINE_BORDER,
                },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: entry?.label ?? "",
                        bold: true,
                        size: 18,
                        color: MUTED,
                        font: FONT_FAMILY,
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: colWidths[slot * 2 + 1]!, type: WidthType.DXA },
                margins: CELL_MARGINS,
                shading: {
                  type: ShadingType.CLEAR,
                  color: "auto",
                  fill: WHITE,
                },
                borders: {
                  top: HAIRLINE_BORDER,
                  bottom: HAIRLINE_BORDER,
                  left: HAIRLINE_BORDER,
                  right: HAIRLINE_BORDER,
                },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: entry?.value ?? "",
                        size: 18,
                        color: CHARCOAL,
                        font: FONT_FAMILY,
                      }),
                    ],
                  }),
                ],
              }),
            ];
          }),
        }),
    ),
  });
}

function buildMetricsTable(
  doc: SharedReportDocument,
  totalWidthTwips: number,
): Table {
  const count = Math.max(doc.metrics.length, 1);
  const colWidths = computeDxaWidths(
    Array.from({ length: count }, () => 1),
    totalWidthTwips,
  );

  return new Table({
    width: { size: totalWidthTwips, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        cantSplit: true,
        children: doc.metrics.map(
          (metric, index) =>
            new TableCell({
              width: { size: colWidths[index]!, type: WidthType.DXA },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              shading: { type: ShadingType.CLEAR, color: "auto", fill: STONE },
              borders: {
                top: HAIRLINE_BORDER,
                bottom: HAIRLINE_BORDER,
                left: HAIRLINE_BORDER,
                right: HAIRLINE_BORDER,
              },
              children: [
                new Paragraph({
                  spacing: { after: 40 },
                  children: [
                    new TextRun({
                      text: metric.label,
                      bold: true,
                      size: 17,
                      color: MUTED,
                      font: FONT_FAMILY,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { after: 30 },
                  children: [
                    new TextRun({
                      text: metric.value,
                      bold: true,
                      size: 26,
                      color: CHARCOAL,
                      font: FONT_FAMILY,
                    }),
                  ],
                }),
                ...(metric.detail
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: metric.detail,
                            size: 16,
                            color: MUTED,
                            font: FONT_FAMILY,
                          }),
                        ],
                      }),
                    ]
                  : []),
              ],
            }),
        ),
      }),
    ],
  });
}

function buildWordTableSection(
  section: ReportTableSection,
  totalWidthTwips: number,
): Array<Paragraph | Table> {
  const colWidths = computeDxaWidths(
    section.columns.map((c) => c.widthWeight ?? 1),
    totalWidthTwips,
  );

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: section.columns.map(
      (column, index) =>
        new TableCell({
          width: { size: colWidths[index]!, type: WidthType.DXA },
          margins: CELL_MARGINS,
          shading: { type: ShadingType.CLEAR, color: "auto", fill: CHARCOAL },
          borders: {
            top: HEADER_BORDER,
            bottom: HEADER_BORDER,
            left: HEADER_BORDER,
            right: HEADER_BORDER,
          },
          children: [
            new Paragraph({
              alignment: getAlignment(column.align),
              children: [
                new TextRun({
                  text: formatDocumentColumnLabel(column),
                  bold: true,
                  size: 17,
                  color: WHITE,
                  font: FONT_FAMILY,
                }),
              ],
            }),
          ],
        }),
    ),
  });

  const bodyRows =
    section.rows.length === 0
      ? [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                columnSpan: section.columns.length,
                margins: CELL_MARGINS,
                shading: {
                  type: ShadingType.CLEAR,
                  color: "auto",
                  fill: STONE,
                },
                borders: {
                  top: HAIRLINE_BORDER,
                  bottom: HAIRLINE_BORDER,
                  left: HAIRLINE_BORDER,
                  right: HAIRLINE_BORDER,
                },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: section.emptyMessage,
                        italics: true,
                        size: 18,
                        color: MUTED,
                        font: FONT_FAMILY,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ]
      : section.rows.map((rawRow, rowIndex) => {
          const fill = rowIndex % 2 === 1 ? STONE : WHITE;
          return new TableRow({
            cantSplit: true,
            children: section.columns.map(
              (column, colIndex) =>
                new TableCell({
                  width: { size: colWidths[colIndex]!, type: WidthType.DXA },
                  margins: CELL_MARGINS,
                  shading: {
                    type: ShadingType.CLEAR,
                    color: "auto",
                    fill,
                  },
                  borders: {
                    top: HAIRLINE_BORDER,
                    bottom: HAIRLINE_BORDER,
                    left: HAIRLINE_BORDER,
                    right: HAIRLINE_BORDER,
                  },
                  children: [
                    new Paragraph({
                      alignment: getAlignment(column.align),
                      children: [
                        new TextRun({
                          text: formatReportCellDisplay(
                            rawRow[colIndex],
                            column.type,
                          ),
                          size: 17,
                          color: CHARCOAL,
                          font: FONT_FAMILY,
                        }),
                      ],
                    }),
                  ],
                }),
            ),
          });
        });

  return [
    new Paragraph({
      keepNext: true,
      spacing: { before: 240, after: 80 },
      children: [
        new TextRun({
          text: section.title,
          bold: true,
          size: 22,
          color: CHARCOAL,
          font: FONT_FAMILY,
        }),
      ],
    }),
    new Table({
      width: { size: totalWidthTwips, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: [headerRow, ...bodyRows],
    }),
  ];
}

/**
 * Renders a branded, uniform Word (`.docx`) report from the shared report template.
 */
export async function buildReportWord(
  doc: SharedReportDocument,
): Promise<Uint8Array> {
  const landscape = doc.detailTable.columns.length >= 8;
  const pageWidthTwips = landscape ? 15840 : 12240;
  const pageHeightTwips = landscape ? 12240 : 15840;
  const marginTwips = 720; // 0.5 in
  const printableWidth = pageWidthTwips - marginTwips * 2;

  const businessSublineParts = [
    doc.business.businessAddress,
    doc.business.businessPhone,
    doc.business.tin ? `TIN ${doc.business.tin}` : null,
  ].filter(Boolean);

  const document = new Document({
    title: `${doc.business.businessName} — ${doc.title}`,
    description: doc.description,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: pageWidthTwips,
              height: pageHeightTwips,
              orientation: landscape
                ? PageOrientation.LANDSCAPE
                : PageOrientation.PORTRAIT,
            },
            margin: {
              top: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
              right: marginTwips,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${doc.business.businessName} · ${doc.title} (${doc.dateSummaryLabel})`,
                    size: 16,
                    color: MUTED,
                    font: FONT_FAMILY,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${doc.buildingLabel} · Currency: PHP · Page `,
                    size: 16,
                    color: MUTED,
                    font: FONT_FAMILY,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: MUTED,
                    font: FONT_FAMILY,
                  }),
                  new TextRun({
                    text: " of ",
                    size: 16,
                    color: MUTED,
                    font: FONT_FAMILY,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: MUTED,
                    font: FONT_FAMILY,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            spacing: { after: 30 },
            children: [
              new TextRun({
                text: doc.business.businessName,
                bold: true,
                size: 20,
                color: RAUSCH,
                font: FONT_FAMILY,
              }),
            ],
          }),
          ...(businessSublineParts.length > 0
            ? [
                new Paragraph({
                  spacing: { after: 80 },
                  children: [
                    new TextRun({
                      text: businessSublineParts.join(" · "),
                      size: 17,
                      color: MUTED,
                      font: FONT_FAMILY,
                    }),
                  ],
                }),
              ]
            : []),
          new Paragraph({
            spacing: { after: 50 },
            children: [
              new TextRun({
                text: doc.title,
                bold: true,
                size: 34,
                color: CHARCOAL,
                font: FONT_FAMILY,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 160 },
            border: {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: RAUSCH,
                space: 6,
              },
            },
            children: [
              new TextRun({
                text: doc.description,
                size: 19,
                color: MUTED,
                font: FONT_FAMILY,
              }),
            ],
          }),
          buildMetadataTable(doc, printableWidth),
          new Paragraph({
            keepNext: true,
            spacing: { before: 220, after: 80 },
            children: [
              new TextRun({
                text: "Summary metrics",
                bold: true,
                size: 22,
                color: CHARCOAL,
                font: FONT_FAMILY,
              }),
            ],
          }),
          buildMetricsTable(doc, printableWidth),
          ...doc.breakdowns.flatMap((section) =>
            buildWordTableSection(section, printableWidth),
          ),
          ...buildWordTableSection(doc.detailTable, printableWidth),
        ],
      },
    ],
  });

  const arrayBuffer = await Packer.toArrayBuffer(document);
  return new Uint8Array(arrayBuffer);
}
