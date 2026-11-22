import * as fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineWidth,
  setStrokingRgbColor,
  setTextRenderingMode,
  TextRenderingMode,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { GEIST_REGULAR_TTF_BASE64 } from "./fonts/geist-regular-base64";
import {
  formatDocumentColumnLabel,
  formatReportCellDisplay,
  type ReportTableSection,
  type SharedReportDocument,
} from "./template";

const CHARCOAL = rgb(34 / 255, 34 / 255, 34 / 255);
const MUTED = rgb(106 / 255, 106 / 255, 106 / 255);
const RAUSCH = rgb(224 / 255, 11 / 255, 65 / 255);
const STONE = rgb(247 / 255, 247 / 255, 247 / 255);
const WHITE = rgb(1, 1, 1);
const BORDER = rgb(228 / 255, 228 / 255, 228 / 255);

let cachedFontBytes: Uint8Array | null = null;

function getEmbeddedFontBytes(): Uint8Array {
  if (cachedFontBytes) {
    return cachedFontBytes;
  }
  if (typeof Buffer !== "undefined") {
    cachedFontBytes = new Uint8Array(
      Buffer.from(GEIST_REGULAR_TTF_BASE64, "base64"),
    );
    return cachedFontBytes;
  }
  const binary = atob(GEIST_REGULAR_TTF_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  cachedFontBytes = bytes;
  return bytes;
}

function sanitizePdfText(raw: string, supported: Set<number>): string {
  const normalized = raw.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  let result = "";
  for (const ch of normalized) {
    const code = ch.codePointAt(0);
    if (code !== undefined && supported.has(code)) {
      result += ch;
    } else if (code !== undefined && code < 32) {
      result += " ";
    } else {
      result += "?";
    }
  }
  return result;
}

function wrapTextToWidth(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  if (!text) return [""];
  if (maxWidth <= 8) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  const pushWordHardWrapped = (word: string) => {
    let slice = "";
    for (const ch of word) {
      const candidate = slice + ch;
      if (slice && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
        lines.push(slice);
        slice = ch;
      } else {
        slice = candidate;
      }
    }
    if (slice) {
      current = slice;
    }
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      current = word;
    } else {
      pushWordHardWrapped(word);
    }
  }

  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function drawStyledText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    size: number;
    font: PDFFont;
    color: RGB;
    bold?: boolean;
  },
): void {
  if (!text) return;
  if (options.bold) {
    page.pushOperators(
      pushGraphicsState(),
      setLineWidth(Math.max(0.2, options.size * 0.025)),
      setStrokingRgbColor(
        options.color.red,
        options.color.green,
        options.color.blue,
      ),
      setTextRenderingMode(TextRenderingMode.FillAndOutline),
    );
    page.drawText(text, {
      x: options.x,
      y: options.y,
      size: options.size,
      font: options.font,
      color: options.color,
    });
    page.pushOperators(popGraphicsState());
    return;
  }

  page.drawText(text, {
    x: options.x,
    y: options.y,
    size: options.size,
    font: options.font,
    color: options.color,
  });
}

function computeColumnWidths(weights: number[], totalWidth: number): number[] {
  const safe = weights.map((w) => (w > 0 ? w : 1));
  const sum = safe.reduce((acc, w) => acc + w, 0);
  return safe.map((w) => (w / sum) * totalWidth);
}

type PdfLayoutContext = {
  pdfDoc: PDFDocument;
  font: PDFFont;
  supportedCodePoints: Set<number>;
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  contentWidth: number;
  page: PDFPage;
  cursorY: number;
  doc: SharedReportDocument;
};

function startNewPage(ctx: PdfLayoutContext): void {
  const page = ctx.pdfDoc.addPage([ctx.pageWidth, ctx.pageHeight]);
  ctx.page = page;
  const headerY = ctx.pageHeight - ctx.marginTop;

  page.drawRectangle({
    x: ctx.marginX,
    y: headerY + 8,
    width: ctx.contentWidth,
    height: 1.5,
    color: RAUSCH,
  });
  drawStyledText(
    page,
    sanitizePdfText(
      `${ctx.doc.business.businessName} · ${ctx.doc.title}`,
      ctx.supportedCodePoints,
    ),
    {
      x: ctx.marginX,
      y: headerY - 6,
      size: 8.5,
      font: ctx.font,
      color: CHARCOAL,
      bold: true,
    },
  );
  const scopeLabel = sanitizePdfText(
    `${ctx.doc.dateSummaryLabel} · ${ctx.doc.buildingLabel}`,
    ctx.supportedCodePoints,
  );
  const scopeWidth = ctx.font.widthOfTextAtSize(scopeLabel, 8);
  drawStyledText(page, scopeLabel, {
    x: ctx.marginX + ctx.contentWidth - scopeWidth,
    y: headerY - 6,
    size: 8,
    font: ctx.font,
    color: MUTED,
  });

  ctx.cursorY = headerY - 24;
}

function ensureSpace(ctx: PdfLayoutContext, neededHeight: number): boolean {
  if (ctx.cursorY - neededHeight >= ctx.marginBottom) {
    return false;
  }
  startNewPage(ctx);
  return true;
}

function drawTableSection(
  ctx: PdfLayoutContext,
  section: ReportTableSection,
): void {
  const fontSize = section.columns.length > 9 ? 7.2 : 8;
  const headerFontSize = section.columns.length > 9 ? 7.2 : 8;
  const lineHeight = fontSize * 1.35;
  const headerLineHeight = headerFontSize * 1.35;
  const cellPadX = 5;
  const cellPadY = 5;

  const colWidths = computeColumnWidths(
    section.columns.map((c) => c.widthWeight ?? 1),
    ctx.contentWidth,
  );

  const headerLinesByCol = section.columns.map((col, idx) =>
    wrapTextToWidth(
      sanitizePdfText(formatDocumentColumnLabel(col), ctx.supportedCodePoints),
      ctx.font,
      headerFontSize,
      colWidths[idx]! - cellPadX * 2,
    ),
  );
  const maxHeaderLines = Math.max(
    1,
    ...headerLinesByCol.map((lines) => lines.length),
  );
  const headerHeight = maxHeaderLines * headerLineHeight + cellPadY * 2;

  const drawColumnHeaders = () => {
    const topY = ctx.cursorY;
    ctx.page.drawRectangle({
      x: ctx.marginX,
      y: topY - headerHeight,
      width: ctx.contentWidth,
      height: headerHeight,
      color: CHARCOAL,
    });
    let colX = ctx.marginX;
    for (let i = 0; i < section.columns.length; i++) {
      const col = section.columns[i]!;
      const colWidth = colWidths[i]!;
      const lines = headerLinesByCol[i]!;
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const lineText = lines[lineIdx]!;
        const textWidth = ctx.font.widthOfTextAtSize(lineText, headerFontSize);
        const textX =
          col.align === "right"
            ? colX + colWidth - cellPadX - textWidth
            : col.align === "center"
              ? colX + (colWidth - textWidth) / 2
              : colX + cellPadX;
        const baselineY =
          topY - cellPadY - headerFontSize * 0.85 - lineIdx * headerLineHeight;
        drawStyledText(ctx.page, lineText, {
          x: textX,
          y: baselineY,
          size: headerFontSize,
          font: ctx.font,
          color: WHITE,
          bold: true,
        });
      }
      colX += colWidth;
    }
    ctx.cursorY -= headerHeight;
  };

  // Reserve room for section heading + table header + at least one row.
  ensureSpace(ctx, 20 + headerHeight + 24);
  ctx.cursorY -= 8;
  drawStyledText(
    ctx.page,
    sanitizePdfText(section.title, ctx.supportedCodePoints),
    {
      x: ctx.marginX,
      y: ctx.cursorY,
      size: 10.5,
      font: ctx.font,
      color: CHARCOAL,
      bold: true,
    },
  );
  ctx.cursorY -= 8;
  drawColumnHeaders();

  if (section.rows.length === 0) {
    const emptyHeight = 24;
    ensureSpace(ctx, emptyHeight);
    ctx.page.drawRectangle({
      x: ctx.marginX,
      y: ctx.cursorY - emptyHeight,
      width: ctx.contentWidth,
      height: emptyHeight,
      color: STONE,
      borderColor: BORDER,
      borderWidth: 0.75,
    });
    drawStyledText(
      ctx.page,
      sanitizePdfText(section.emptyMessage, ctx.supportedCodePoints),
      {
        x: ctx.marginX + cellPadX + 2,
        y: ctx.cursorY - emptyHeight + 8,
        size: 8.5,
        font: ctx.font,
        color: MUTED,
      },
    );
    ctx.cursorY -= emptyHeight + 10;
    return;
  }

  for (let rowIdx = 0; rowIdx < section.rows.length; rowIdx++) {
    const rawRow = section.rows[rowIdx]!;
    const wrappedCells = section.columns.map((col, colIdx) => {
      const formatted = sanitizePdfText(
        formatReportCellDisplay(rawRow[colIdx], col.type),
        ctx.supportedCodePoints,
      );
      return wrapTextToWidth(
        formatted,
        ctx.font,
        fontSize,
        colWidths[colIdx]! - cellPadX * 2,
      ).slice(0, 4);
    });
    const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
    const rowHeight = maxLines * lineHeight + cellPadY * 2;

    if (ensureSpace(ctx, rowHeight)) {
      drawStyledText(
        ctx.page,
        sanitizePdfText(
          `${section.title} (continued)`,
          ctx.supportedCodePoints,
        ),
        {
          x: ctx.marginX,
          y: ctx.cursorY,
          size: 9.5,
          font: ctx.font,
          color: CHARCOAL,
          bold: true,
        },
      );
      ctx.cursorY -= 8;
      drawColumnHeaders();
    }

    const rowTopY = ctx.cursorY;
    const zebra = rowIdx % 2 === 1;
    ctx.page.drawRectangle({
      x: ctx.marginX,
      y: rowTopY - rowHeight,
      width: ctx.contentWidth,
      height: rowHeight,
      color: zebra ? STONE : WHITE,
      borderColor: BORDER,
      borderWidth: 0.5,
    });

    let colX = ctx.marginX;
    for (let colIdx = 0; colIdx < section.columns.length; colIdx++) {
      const col = section.columns[colIdx]!;
      const colWidth = colWidths[colIdx]!;
      const lines = wrappedCells[colIdx]!;
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const lineText = lines[lineIdx]!;
        const textWidth = ctx.font.widthOfTextAtSize(lineText, fontSize);
        const textX =
          col.align === "right"
            ? colX + colWidth - cellPadX - textWidth
            : col.align === "center"
              ? colX + (colWidth - textWidth) / 2
              : colX + cellPadX;
        const baselineY =
          rowTopY - cellPadY - fontSize * 0.85 - lineIdx * lineHeight;
        drawStyledText(ctx.page, lineText, {
          x: textX,
          y: baselineY,
          size: fontSize,
          font: ctx.font,
          color: CHARCOAL,
        });
      }
      colX += colWidth;
    }

    ctx.cursorY -= rowHeight;
  }

  ctx.cursorY -= 12;
}

/**
 * Renders a branded, multi-page paginated PDF report from the shared report template.
 */
export async function buildReportPdf(
  doc: SharedReportDocument,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(
    fontkit as Parameters<typeof pdfDoc.registerFontkit>[0],
  );
  pdfDoc.setTitle(`${doc.business.businessName} — ${doc.title}`);
  pdfDoc.setCreator("Daisy Boarding & Transient");
  pdfDoc.setProducer("Daisy Reports Engine");

  const font = await pdfDoc.embedFont(getEmbeddedFontBytes(), { subset: true });
  const supportedCodePoints = new Set(font.getCharacterSet());

  const landscape = doc.detailTable.columns.length >= 8;
  const pageWidth = landscape ? 792 : 612;
  const pageHeight = landscape ? 612 : 792;
  const marginX = 32;
  const marginTop = 34;
  const marginBottom = 42;
  const contentWidth = pageWidth - marginX * 2;

  const firstPage = pdfDoc.addPage([pageWidth, pageHeight]);
  const ctx: PdfLayoutContext = {
    pdfDoc,
    font,
    supportedCodePoints,
    pageWidth,
    pageHeight,
    marginX,
    marginTop,
    marginBottom,
    contentWidth,
    page: firstPage,
    cursorY: pageHeight - marginTop,
    doc,
  };

  // Top Rausch accent bar
  firstPage.drawRectangle({
    x: marginX,
    y: ctx.cursorY + 6,
    width: contentWidth,
    height: 2.5,
    color: RAUSCH,
  });

  // Business masthead + subline
  ctx.cursorY -= 8;
  drawStyledText(
    firstPage,
    sanitizePdfText(doc.business.businessName, supportedCodePoints),
    {
      x: marginX,
      y: ctx.cursorY,
      size: 10,
      font,
      color: RAUSCH,
      bold: true,
    },
  );

  const sublineParts = [
    doc.business.businessAddress,
    doc.business.businessPhone,
    doc.business.tin ? `TIN ${doc.business.tin}` : null,
  ].filter(Boolean);
  if (sublineParts.length > 0) {
    const subline = sanitizePdfText(
      sublineParts.join(" · "),
      supportedCodePoints,
    );
    const sublineWidth = font.widthOfTextAtSize(subline, 8);
    drawStyledText(firstPage, subline, {
      x: marginX + contentWidth - sublineWidth,
      y: ctx.cursorY,
      size: 8,
      font,
      color: MUTED,
    });
  }

  ctx.cursorY -= 22;
  drawStyledText(firstPage, sanitizePdfText(doc.title, supportedCodePoints), {
    x: marginX,
    y: ctx.cursorY,
    size: 17,
    font,
    color: CHARCOAL,
    bold: true,
  });
  ctx.cursorY -= 14;

  const descriptionLines = wrapTextToWidth(
    sanitizePdfText(doc.description, supportedCodePoints),
    font,
    9,
    contentWidth,
  );
  for (const line of descriptionLines) {
    drawStyledText(firstPage, line, {
      x: marginX,
      y: ctx.cursorY,
      size: 9,
      font,
      color: MUTED,
    });
    ctx.cursorY -= 12;
  }

  // Metadata summary band
  ctx.cursorY -= 4;
  const metaPairsPerRow = 4;
  const metaColWidth = contentWidth / metaPairsPerRow;
  const metaRowsCount = Math.ceil(doc.metadata.length / metaPairsPerRow);
  const metaRowHeight = 28;
  const metaBoxHeight = metaRowsCount * metaRowHeight;

  firstPage.drawRectangle({
    x: marginX,
    y: ctx.cursorY - metaBoxHeight,
    width: contentWidth,
    height: metaBoxHeight,
    color: STONE,
    borderColor: BORDER,
    borderWidth: 0.75,
  });

  for (let i = 0; i < doc.metadata.length; i++) {
    const entry = doc.metadata[i]!;
    const col = i % metaPairsPerRow;
    const row = Math.floor(i / metaPairsPerRow);
    const cellX = marginX + col * metaColWidth + 8;
    const cellTopY = ctx.cursorY - row * metaRowHeight;
    drawStyledText(
      firstPage,
      sanitizePdfText(entry.label, supportedCodePoints),
      {
        x: cellX,
        y: cellTopY - 10,
        size: 7.5,
        font,
        color: MUTED,
      },
    );
    const valLines = wrapTextToWidth(
      sanitizePdfText(entry.value, supportedCodePoints),
      font,
      8.5,
      metaColWidth - 14,
    );
    drawStyledText(firstPage, valLines[0] ?? "", {
      x: cellX,
      y: cellTopY - 21,
      size: 8.5,
      font,
      color: CHARCOAL,
      bold: true,
    });
  }
  ctx.cursorY -= metaBoxHeight + 14;

  // KPI Metrics row
  const metricsGap = 8;
  const cardWidth =
    (contentWidth - metricsGap * Math.max(doc.metrics.length - 1, 0)) /
    Math.max(doc.metrics.length, 1);
  const metricHeight = 52;
  for (let i = 0; i < doc.metrics.length; i++) {
    const metric = doc.metrics[i]!;
    const cardX = marginX + i * (cardWidth + metricsGap);
    firstPage.drawRectangle({
      x: cardX,
      y: ctx.cursorY - metricHeight,
      width: cardWidth,
      height: metricHeight,
      color: STONE,
      borderColor: BORDER,
      borderWidth: 0.75,
    });
    drawStyledText(
      firstPage,
      sanitizePdfText(metric.label, supportedCodePoints),
      {
        x: cardX + 8,
        y: ctx.cursorY - 12,
        size: 7.5,
        font,
        color: MUTED,
        bold: true,
      },
    );
    drawStyledText(
      firstPage,
      sanitizePdfText(metric.value, supportedCodePoints),
      {
        x: cardX + 8,
        y: ctx.cursorY - 28,
        size: 13,
        font,
        color: CHARCOAL,
        bold: true,
      },
    );
    if (metric.detail) {
      const detailLines = wrapTextToWidth(
        sanitizePdfText(metric.detail, supportedCodePoints),
        font,
        7,
        cardWidth - 16,
      );
      drawStyledText(firstPage, detailLines[0] ?? "", {
        x: cardX + 8,
        y: ctx.cursorY - 41,
        size: 7,
        font,
        color: MUTED,
      });
    }
  }
  ctx.cursorY -= metricHeight + 10;

  // Render breakdowns + detail register using shared section layout
  for (const breakdown of doc.breakdowns) {
    drawTableSection(ctx, breakdown);
  }
  drawTableSection(ctx, doc.detailTable);

  // Stamp page footers across all generated pages
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    const p = pages[i]!;
    const footerY = 22;
    p.drawRectangle({
      x: marginX,
      y: footerY + 11,
      width: contentWidth,
      height: 0.5,
      color: BORDER,
    });
    drawStyledText(
      p,
      sanitizePdfText(
        `${doc.title} · Generated ${doc.generatedAtLabel} (UTC+8)`,
        supportedCodePoints,
      ),
      {
        x: marginX,
        y: footerY,
        size: 7.5,
        font,
        color: MUTED,
      },
    );
    const pageLabel = `Page ${i + 1} of ${totalPages}`;
    const pageLabelWidth = font.widthOfTextAtSize(pageLabel, 7.5);
    drawStyledText(p, pageLabel, {
      x: marginX + contentWidth - pageLabelWidth,
      y: footerY,
      size: 7.5,
      font,
      color: MUTED,
    });
  }

  return pdfDoc.save();
}
