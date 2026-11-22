import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildReportExcel } from "../../../../src/features/reports/export-excel";
import { buildReportPdf } from "../../../../src/features/reports/export-pdf";
import { buildReportWord } from "../../../../src/features/reports/export-word";
import {
  REPORT_EXPORT_FORMATS,
  REPORT_TYPES,
  type ReportsOverviewDto,
} from "../../../../src/features/reports/schemas";
import {
  buildReportExportFilename,
  buildSharedReportDocument,
  formatReportCellDisplay,
  sanitizeSpreadsheetText,
} from "../../../../src/features/reports/template";

const fixtureOverview: ReportsOverviewDto = {
  filters: {
    asOfDate: "2026-11-18",
    fromDate: "2026-11-01",
    toDate: "2026-11-18",
    building: "all",
  },
  generatedAt: "2026-11-18T11:30:00.000Z",
  occupancy: {
    summary: {
      totalRooms: 2,
      occupiedRooms: 1,
      availableRooms: 0,
      maintenanceRooms: 1,
      boardingRooms: 1,
      transientRooms: 1,
      totalBeds: 4,
      occupiedBeds: 2,
      availableBeds: 1,
      maintenanceBeds: 1,
      occupancyRatePercent: 50,
      boardingOccupancyRatePercent: 100,
      transientOccupancyRatePercent: 0,
    },
    byBuilding: [
      {
        building: "BOARDING",
        buildingLabel: "Boarding House",
        totalRooms: 1,
        occupiedRooms: 1,
        availableRooms: 0,
        maintenanceRooms: 0,
        totalBeds: 2,
        occupiedBeds: 2,
        availableBeds: 0,
        maintenanceBeds: 0,
        occupancyRatePercent: 100,
        potentialMonthlyRevenue: "6500.00",
        occupiedMonthlyRevenue: "6500.00",
        potentialDailyRateTotal: "0.00",
        occupiedDailyRateTotal: "0.00",
      },
      {
        building: "TRANSIENT",
        buildingLabel: "Transient Building",
        totalRooms: 1,
        occupiedRooms: 0,
        availableRooms: 0,
        maintenanceRooms: 1,
        totalBeds: 2,
        occupiedBeds: 0,
        availableBeds: 1,
        maintenanceBeds: 1,
        occupancyRatePercent: 0,
        potentialMonthlyRevenue: "0.00",
        occupiedMonthlyRevenue: "0.00",
        potentialDailyRateTotal: "1800.00",
        occupiedDailyRateTotal: "0.00",
      },
    ],
    byRoomType: [
      {
        roomTypeId: "rt-1",
        roomTypeName: "Deluxe Studio Room",
        building: "BOARDING",
        buildingLabel: "Boarding House",
        totalRooms: 1,
        occupiedRooms: 1,
        availableRooms: 0,
        maintenanceRooms: 0,
        occupancyRatePercent: 100,
        totalBeds: 2,
        occupiedBeds: 2,
        avgMonthlyRate: "6500.00",
        avgDailyRate: null,
      },
    ],
    rows: [
      {
        roomId: "room-1",
        roomCode: "B-101",
        roomName: "North Wing",
        building: "BOARDING",
        floor: "1",
        isTransientPublished: false,
        capacityBeds: 2,
        occupiedBeds: 2,
        availableBeds: 0,
        maintenanceBeds: 0,
        activeAllocationCount: 2,
        status: "OCCUPIED",
        monthlyRate: "6500.00",
        transientDailyRate: null,
      },
      {
        roomId: "room-2",
        roomCode: "T-201",
        roomName: "Garden Suite",
        building: "TRANSIENT",
        floor: "2",
        isTransientPublished: true,
        capacityBeds: 2,
        occupiedBeds: 0,
        availableBeds: 1,
        maintenanceBeds: 1,
        activeAllocationCount: 0,
        status: "MAINTENANCE",
        monthlyRate: "0.00",
        transientDailyRate: "1800.00",
      },
    ],
  },
  rentRoll: {
    summary: {
      activeAssignments: 1,
      totalMonthlyRent: "6500.00",
      totalSecurityDeposits: "6500.00",
      totalOpenBalance: "1500.00",
      averageMonthlyRent: "6500.00",
      openBalanceToRentPercent: 23,
    },
    byRoomType: [
      {
        roomTypeId: "rt-1",
        roomTypeName: "Deluxe Studio Room",
        activeAssignments: 1,
        sharePercent: 100,
        totalMonthlyRent: "6500.00",
        totalSecurityDeposits: "6500.00",
        totalOpenBalance: "1500.00",
      },
    ],
    leaseExpiries: [
      {
        bucket: "WITHIN_30",
        label: "Next 30 days",
        count: 1,
        monthlyRentAtRisk: "6500.00",
      },
    ],
    rows: [
      {
        assignmentId: "asg-1",
        tenantId: "ten-1",
        tenantName: "=SUM(A1:A2)",
        roomId: "room-1",
        roomCode: "B-101",
        roomName: "North Wing",
        bedCode: "A",
        startDate: "2026-06-01",
        endDate: "2026-12-10",
        status: "ACTIVE",
        monthlyRate: "6500.00",
        securityDeposit: "6500.00",
        openInvoiceBalance: "1500.00",
      },
    ],
  },
  receivablesAging: {
    summary: {
      openInvoicesCount: 1,
      overdueInvoicesCount: 1,
      totalOutstanding: "1500.00",
      overdueAmount: "1500.00",
      currentAmount: "0.00",
      bucket1To30Amount: "1500.00",
      bucket31To60Amount: "0.00",
      bucket61To90Amount: "0.00",
      bucket91PlusAmount: "0.00",
    },
    buckets: [
      {
        bucket: "1_30",
        label: "1–30 days past due",
        count: 1,
        outstandingAmount: "1500.00",
      },
    ],
    byScope: [
      {
        scope: "BOARDING",
        scopeLabel: "Boarding House",
        openInvoicesCount: 1,
        overdueInvoicesCount: 1,
        outstandingAmount: "1500.00",
        overdueAmount: "1500.00",
      },
    ],
    rows: [
      {
        invoiceId: "inv-1",
        invoiceNumber: "INV-2026-0101",
        scope: "BOARDING",
        partyName: "Elena Cruz",
        issuedDate: "2026-11-01",
        dueDate: "2026-11-05",
        daysPastDue: 13,
        bucket: "1_30",
        totalAmount: "3000.00",
        paidAsOfAmount: "1500.00",
        balanceDue: "1500.00",
      },
    ],
  },
  collections: {
    summary: {
      entryCount: 2,
      postedCount: 1,
      reversedCount: 1,
      reversalCount: 1,
      grossPostedAmount: "3500.00",
      totalReversalsAmount: "-1500.00",
      netCollectedAmount: "2000.00",
      unallocatedCreditTotal: "0.00",
      reversalRatePercent: 43,
    },
    byMethod: [
      {
        method: "CASH",
        methodLabel: "Cash",
        entryCount: 2,
        postedAmount: "3500.00",
        reversalAmount: "-1500.00",
        netAmount: "2000.00",
      },
    ],
    byScope: [
      {
        scope: "BOARDING",
        scopeLabel: "Boarding House",
        entryCount: 2,
        postedAmount: "3500.00",
        reversalAmount: "-1500.00",
        netAmount: "2000.00",
      },
    ],
    dailyTrend: [],
    rows: [
      {
        paymentId: "pay-1",
        receiptNumber: "RCPT-2026-0041",
        paidDate: "2026-11-10",
        paidAt: "2026-11-10T04:00:00.000Z",
        status: "POSTED",
        method: "CASH",
        scope: "BOARDING",
        partyName: "Elena Cruz",
        amount: "3500.00",
        unallocatedAmount: "0.00",
        reversalReason: null,
      },
      {
        paymentId: "pay-2",
        receiptNumber: null,
        paidDate: "2026-11-12",
        paidAt: "2026-11-12T06:00:00.000Z",
        status: "REVERSAL",
        method: "CASH",
        scope: "BOARDING",
        partyName: "Elena Cruz",
        amount: "-1500.00",
        unallocatedAmount: "0.00",
        reversalReason: "Duplicate entry",
      },
    ],
  },
  transientRevenue: {
    summary: {
      staysCount: 1,
      activeOrCompletedCount: 1,
      cancelledCount: 0,
      noShowCount: 0,
      totalNights: 3,
      grossStayRevenue: "5400.00",
      invoicedAmount: "5400.00",
      collectedAmount: "5400.00",
      averageDailyRate: "1800.00",
      averageNightsPerStay: "3.0",
      collectionRatePercent: 100,
    },
    byStatus: [
      {
        status: "CHECKED_OUT",
        statusLabel: "Checked out",
        staysCount: 1,
        totalNights: 3,
        stayAmount: "5400.00",
        invoicedAmount: "5400.00",
        collectedAmount: "5400.00",
      },
    ],
    byRoomType: [
      {
        roomTypeId: "rt-2",
        roomTypeName: "Garden Suite",
        staysCount: 1,
        activeOrCompletedCount: 1,
        cancelledOrNoShowCount: 0,
        totalNights: 3,
        grossStayRevenue: "5400.00",
        invoicedAmount: "5400.00",
        collectedAmount: "5400.00",
      },
    ],
    rows: [
      {
        reservationId: "tr-1",
        guestId: "g-1",
        guestName: "Marco Reyes",
        roomCode: "T-201",
        roomName: "Garden Suite",
        checkInDate: "2026-11-10",
        checkOutDate: "2026-11-13",
        nights: 3,
        status: "CHECKED_OUT",
        dailyRate: "1800.00",
        totalAmount: "5400.00",
        invoicedAmount: "5400.00",
        collectedAmount: "5400.00",
      },
    ],
  },
  maintenance: {
    summary: {
      totalInWindow: 1,
      openCount: 1,
      urgentOpenCount: 1,
      activeHoldCount: 1,
      resolvedInWindow: 0,
      cancelledInWindow: 0,
      resolutionRatePercent: 0,
      avgResolutionDays: null,
    },
    byCategory: [
      {
        category: "PLUMBING",
        categoryLabel: "Plumbing",
        totalCount: 1,
        openCount: 1,
        activeHoldCount: 1,
        resolvedCount: 0,
      },
    ],
    byPriority: [
      {
        priority: "URGENT",
        priorityLabel: "Urgent",
        totalCount: 1,
        openCount: 1,
        activeHoldCount: 1,
        resolvedCount: 0,
      },
    ],
    byBuilding: [],
    rows: [
      {
        requestId: "mnt-1",
        roomCode: "T-201",
        roomName: "Garden Suite",
        building: "TRANSIENT",
        title: '+HYPERLINK("https://evil.example")',
        category: "PLUMBING",
        priority: "URGENT",
        status: "OPEN",
        blocksOccupancy: true,
        reportedDate: "2026-11-15",
        resolvedDate: null,
      },
    ],
  },
};

function assertZipSignature(bytes: Uint8Array, expectedEntry: string) {
  expect(bytes.length).toBeGreaterThan(200);
  // PK\x03\x04 ZIP magic bytes
  expect(bytes[0]).toBe(0x50);
  expect(bytes[1]).toBe(0x4b);
  expect(bytes[2]).toBe(0x03);
  expect(bytes[3]).toBe(0x04);
  const asciiView = Buffer.from(bytes).toString("latin1");
  expect(asciiView).toContain(expectedEntry);
}

describe("shared report template and multi-format exporters", () => {
  it("neutralizes spreadsheet formulas and builds uniform filenames for every format", () => {
    expect(sanitizeSpreadsheetText("=1+1")).toBe("'=1+1");
    expect(sanitizeSpreadsheetText("-1500.00")).toBe("-1500.00");
    expect(formatReportCellDisplay("3500.00", "currency")).toBe("₱3,500.00");
    expect(formatReportCellDisplay(true, "boolean")).toBe("Yes");
    expect(formatReportCellDisplay(null, "text")).toBe("—");

    for (const reportType of REPORT_TYPES) {
      for (const format of REPORT_EXPORT_FORMATS) {
        const filename = buildReportExportFilename(
          reportType,
          fixtureOverview.filters,
          format,
        );
        expect(filename).toMatch(
          new RegExp(`^daisy-${reportType}-.*\\.${format}$`),
        );
      }
    }
  });

  it("builds consistent shared report documents and generates valid Excel, Word, and PDF files for all six reports", async () => {
    const business = {
      businessName: "Villa Daisy Residences",
      businessAddress: "Quezon City, Metro Manila",
      businessPhone: "+63 917 555 0100",
      tin: "123-456-789-000",
    };

    for (const reportType of REPORT_TYPES) {
      const doc = buildSharedReportDocument(
        reportType,
        fixtureOverview,
        business,
      );
      expect(doc.business.businessName).toBe("Villa Daisy Residences");
      expect(doc.metrics.length).toBeGreaterThanOrEqual(4);
      expect(doc.breakdowns.length).toBeGreaterThanOrEqual(2);
      expect(doc.detailTable.columns.length).toBeGreaterThanOrEqual(9);

      const xlsxBytes = await buildReportExcel(doc);
      assertZipSignature(xlsxBytes, "xl/worksheets/sheet2.xml");

      const docxBytes = await buildReportWord(doc);
      assertZipSignature(docxBytes, "word/document.xml");

      const pdfBytes = await buildReportPdf(doc);
      const pdfHeader = Buffer.from(pdfBytes.slice(0, 5)).toString("ascii");
      const pdfTail = Buffer.from(pdfBytes.slice(-32)).toString("ascii");
      expect(pdfHeader).toBe("%PDF-");
      expect(pdfTail).toContain("%%EOF");
    }
  }, 20000);

  it("paginates multi-page PDFs cleanly and supports empty ledgers without error", async () => {
    const denseOverview: ReportsOverviewDto = {
      ...fixtureOverview,
      occupancy: {
        ...fixtureOverview.occupancy,
        rows: Array.from({ length: 42 }, (_, idx) => ({
          ...fixtureOverview.occupancy.rows[0]!,
          roomId: `room-${idx}`,
          roomCode: `B-${100 + idx}`,
          roomName: `Boarding Suite ${idx + 1} with longer wrapped title`,
        })),
      },
      rentRoll: {
        ...fixtureOverview.rentRoll,
        rows: [],
      },
    };

    const multiPageDoc = buildSharedReportDocument("occupancy", denseOverview);
    const pdfBytes = await buildReportPdf(multiPageDoc);
    const loadedPdf = await PDFDocument.load(pdfBytes);
    expect(loadedPdf.getPageCount()).toBeGreaterThanOrEqual(2);

    const emptyDoc = buildSharedReportDocument("rent-roll", denseOverview);
    const emptyXlsx = await buildReportExcel(emptyDoc);
    const emptyDocx = await buildReportWord(emptyDoc);
    const emptyPdf = await buildReportPdf(emptyDoc);
    assertZipSignature(emptyXlsx, "xl/worksheets/sheet1.xml");
    assertZipSignature(emptyDocx, "word/document.xml");
    expect(Buffer.from(emptyPdf.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });
});
