import { describe, expect, it } from "vitest";
import {
  buildReportCsv,
  buildReportCsvFilename,
  escapeCsvCell,
} from "../../../../src/features/reports/csv";
import {
  REPORT_TYPES,
  type ReportsOverviewDto,
} from "../../../../src/features/reports/schemas";

const sampleOverview: ReportsOverviewDto = {
  filters: {
    asOfDate: "2026-11-16",
    fromDate: "2026-11-01",
    toDate: "2026-11-16",
    building: "all",
  },
  generatedAt: "2026-11-16T02:00:00.000Z",
  occupancy: {
    summary: {
      totalRooms: 1,
      occupiedRooms: 1,
      availableRooms: 0,
      maintenanceRooms: 0,
      boardingRooms: 1,
      transientRooms: 0,
      totalBeds: 2,
      occupiedBeds: 1,
      availableBeds: 1,
      maintenanceBeds: 0,
      occupancyRatePercent: 100,
      boardingOccupancyRatePercent: 100,
      transientOccupancyRatePercent: null,
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
        occupiedBeds: 1,
        availableBeds: 1,
        maintenanceBeds: 0,
        occupancyRatePercent: 100,
        potentialMonthlyRevenue: "4500.00",
        occupiedMonthlyRevenue: "4500.00",
        potentialDailyRateTotal: "0.00",
        occupiedDailyRateTotal: "0.00",
      },
    ],
    byRoomType: [
      {
        roomTypeId: "rt1",
        roomTypeName: "Standard",
        building: "BOARDING",
        buildingLabel: "Boarding House",
        totalRooms: 1,
        occupiedRooms: 1,
        availableRooms: 0,
        maintenanceRooms: 0,
        occupancyRatePercent: 100,
        totalBeds: 2,
        occupiedBeds: 1,
        avgMonthlyRate: "4500.00",
        avgDailyRate: null,
      },
    ],
    rows: [
      {
        roomId: "r1",
        roomCode: "B-101",
        roomName: "North, Wing",
        building: "BOARDING",
        floor: "1",
        isTransientPublished: false,
        capacityBeds: 2,
        occupiedBeds: 1,
        availableBeds: 1,
        maintenanceBeds: 0,
        activeAllocationCount: 1,
        status: "OCCUPIED",
        monthlyRate: "4500.00",
        transientDailyRate: null,
      },
    ],
  },
  rentRoll: {
    summary: {
      activeAssignments: 1,
      totalMonthlyRent: "4500.00",
      totalSecurityDeposits: "4500.00",
      totalOpenBalance: "1500.00",
      averageMonthlyRent: "4500.00",
      openBalanceToRentPercent: 33,
    },
    byRoomType: [],
    leaseExpiries: [],
    rows: [
      {
        assignmentId: "a1",
        tenantId: "t1",
        tenantName: "=SUM(A1:A2)",
        roomId: "r1",
        roomCode: "B-101",
        roomName: "North Wing",
        bedCode: "B1",
        startDate: "2026-10-01",
        endDate: "2027-03-31",
        status: "ACTIVE",
        monthlyRate: "4500.00",
        securityDeposit: "4500.00",
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
    byScope: [],
    rows: [
      {
        invoiceId: "inv1",
        invoiceNumber: "INV-2026-0001",
        scope: "BOARDING",
        partyName: "Ana Santos",
        issuedDate: "2026-11-01",
        dueDate: "2026-11-05",
        daysPastDue: 11,
        bucket: "1_30",
        totalAmount: "1500.00",
        paidAsOfAmount: "0.00",
        balanceDue: "1500.00",
      },
    ],
  },
  collections: {
    summary: {
      entryCount: 2,
      postedCount: 0,
      reversedCount: 1,
      reversalCount: 1,
      grossPostedAmount: "1500.00",
      totalReversalsAmount: "-1500.00",
      netCollectedAmount: "0.00",
      unallocatedCreditTotal: "0.00",
      reversalRatePercent: 100,
    },
    byMethod: [
      {
        method: "CASH",
        methodLabel: "Cash",
        entryCount: 2,
        postedAmount: "1500.00",
        reversalAmount: "-1500.00",
        netAmount: "0.00",
      },
    ],
    byScope: [],
    dailyTrend: [],
    rows: [
      {
        paymentId: "p2",
        receiptNumber: null,
        paidDate: "2026-11-12",
        paidAt: "2026-11-12T04:00:00.000Z",
        status: "REVERSAL",
        method: "CASH",
        scope: "BOARDING",
        partyName: "Ana Santos",
        amount: "-1500.00",
        unallocatedAmount: "0.00",
        reversalReason: "Returned check",
      },
    ],
  },
  transientRevenue: {
    summary: {
      staysCount: 1,
      activeOrCompletedCount: 1,
      cancelledCount: 0,
      noShowCount: 0,
      totalNights: 2,
      grossStayRevenue: "2400.00",
      invoicedAmount: "2400.00",
      collectedAmount: "2400.00",
      averageDailyRate: "1200.00",
      averageNightsPerStay: "2.0",
      collectionRatePercent: 100,
    },
    byStatus: [],
    byRoomType: [],
    rows: [
      {
        reservationId: "tr1",
        guestId: "g1",
        guestName: "Marco Reyes",
        roomCode: "T-201",
        roomName: "Suite",
        checkInDate: "2026-11-10",
        checkOutDate: "2026-11-12",
        nights: 2,
        status: "CHECKED_OUT",
        dailyRate: "1200.00",
        totalAmount: "2400.00",
        invoicedAmount: "2400.00",
        collectedAmount: "2400.00",
      },
    ],
  },
  maintenance: {
    summary: {
      totalInWindow: 1,
      openCount: 1,
      urgentOpenCount: 0,
      activeHoldCount: 1,
      resolvedInWindow: 0,
      cancelledInWindow: 0,
      resolutionRatePercent: 0,
      avgResolutionDays: null,
    },
    byCategory: [],
    byPriority: [],
    byBuilding: [],
    rows: [
      {
        requestId: "m1",
        roomCode: "B-101",
        roomName: "North Wing",
        building: "BOARDING",
        title: '+HYPERLINK("https://evil.example")',
        category: "PLUMBING",
        priority: "HIGH",
        status: "OPEN",
        blocksOccupancy: true,
        reportedDate: "2026-11-14",
        resolvedDate: null,
      },
    ],
  },
};

describe("CSV escaping and report serialization", () => {
  it("neutralizes spreadsheet formulas while preserving negative currency amounts", () => {
    expect(escapeCsvCell("=cmd|'/C calc'!A0")).toBe("'=cmd|'/C calc'!A0");
    expect(escapeCsvCell("+1+1")).toBe("'+1+1");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("-1+2")).toBe("'-1+2");
    expect(escapeCsvCell("-1500.00")).toBe("-1500.00");
    expect(escapeCsvCell('Room "North", Wing')).toBe(`"Room ""North"", Wing"`);
  });

  it("serializes all six report CSV documents with metadata and clean escaping", () => {
    for (const reportType of REPORT_TYPES) {
      const csv = buildReportCsv(reportType, sampleOverview);
      const filename = buildReportCsvFilename(
        reportType,
        sampleOverview.filters,
      );
      expect(filename).toMatch(/^daisy-.*\.csv$/);
      expect(csv).toContain("As of date,2026-11-16");
      expect(csv.endsWith("\r\n")).toBe(true);
    }

    const rentRollCsv = buildReportCsv("rent-roll", sampleOverview);
    expect(rentRollCsv).toContain("'=SUM(A1:A2)");

    const collectionsCsv = buildReportCsv("collections", sampleOverview);
    expect(collectionsCsv).toContain(",-1500.00,");

    const maintenanceCsv = buildReportCsv("maintenance", sampleOverview);
    expect(maintenanceCsv).toContain(`"'+HYPERLINK(""https://evil.example"")"`);
  });
});
