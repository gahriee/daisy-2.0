import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { manilaDateTimeToUtc } from "../../../src/lib/dates";

const state = vi.hoisted(() => ({
  db: undefined as PrismaClient | undefined,
  authenticated: true,
  ownerId: "",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/server", () => ({
  getAuth: () => ({}),
}));
vi.mock("@/server/db/client", () => ({
  getDatabase: () => {
    if (!state.db) throw new Error("Test DB client not initialized");
    return state.db;
  },
}));
vi.mock("@/server/auth/owner", async (original) => {
  const actual =
    await original<typeof import("../../../src/server/auth/owner")>();
  return {
    ...actual,
    isOwner: async () => state.authenticated,
    requireOwnerUserId: async () => {
      if (!state.authenticated || !state.ownerId) {
        const { UnauthenticatedError } = await import("@/lib/errors");
        throw new UnauthenticatedError();
      }
      return state.ownerId;
    },
  };
});

import { GET as getReportsRoute } from "../../../src/app/api/reports/route";
import { GET as exportReportRoute } from "../../../src/app/api/reports/export/route";
import { getReportsOverview } from "../../../src/features/reports/service";

const prefix = `reports-test-${randomUUID()}`;
const sweepPrefix = "reports-test-";
let seq = 0;

async function cleanupTestOwners(db: PrismaClient, ownerPrefix: string) {
  await db.securityRateLimit.deleteMany({
    where: { key: { startsWith: `reports:${ownerPrefix}` } },
  });
  await db.paymentAllocation.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.payment.deleteMany({
    where: {
      ownerUserId: { startsWith: ownerPrefix },
      reversedPaymentId: { not: null },
    },
  });
  await db.payment.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.invoiceAdjustment.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.invoice.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.tenantAssignment.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.allocation.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.maintenanceRequest.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.transientReservation.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.transientGuest.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.tenant.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.bed.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.room.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.auditLog.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.owner.deleteMany({
    where: { id: { startsWith: ownerPrefix } },
  });
}

beforeAll(() => {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Missing opted-in TEST_DATABASE_URL");
  state.db = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
});

beforeEach(() => {
  state.authenticated = true;
  state.ownerId = `${prefix}-${seq++}`;
  vi.stubEnv("OWNER_USER_ID", state.ownerId);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const db = state.db;
  if (!db) return;
  try {
    await cleanupTestOwners(db, sweepPrefix);

    expect(
      await db.owner.count({
        where: { id: { startsWith: sweepPrefix } },
      }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: { ownerUserId: { startsWith: sweepPrefix } },
      }),
    ).toBe(0);
    expect(
      await db.securityRateLimit.count({
        where: { key: { startsWith: `reports:${sweepPrefix}` } },
      }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("reports overview & bounded CSV exports integration", () => {
  it("fails closed with 401 when unauthenticated on read and export endpoints", async () => {
    state.authenticated = false;

    const readRes = await getReportsRoute(
      new Request("https://daisy.local/api/reports"),
    );
    expect(readRes.status).toBe(401);
    expect(readRes.headers.get("cache-control")).toBe("private, no-store");

    const exportRes = await exportReportRoute(
      new Request(
        "https://daisy.local/api/reports/export?reportType=occupancy",
      ),
    );
    expect(exportRes.status).toBe(401);
    expect(exportRes.headers.get("cache-control")).toBe("private, no-store");
  });

  it("computes historical receivables, reversals, rent roll, transient revenue, occupancy, and maintenance accurately and logs export audits only", async () => {
    const db = state.db!;
    const ownerId = state.ownerId;
    const otherOwnerId = `${prefix}-other-${seq++}`;

    await db.owner.createMany({
      data: [{ id: ownerId }, { id: otherOwnerId }],
    });

    const boardingRoom = await db.room.create({
      data: {
        ownerUserId: ownerId,
        title: "B-101",
        building: "BOARDING",
        floor: "1",
        capacity: 2,
        baseMonthlyRate: "5000.00",
      },
      select: { id: true },
    });

    const bed1 = await db.bed.create({
      data: {
        ownerUserId: ownerId,
        roomId: boardingRoom.id,
        number: "B1",
        monthlyRate: "5000.00",
        status: "OCCUPIED",
      },
      select: { id: true },
    });

    await db.bed.create({
      data: {
        ownerUserId: ownerId,
        roomId: boardingRoom.id,
        number: "B2",
        monthlyRate: "5000.00",
        status: "AVAILABLE",
      },
      select: { id: true },
    });

    const transientRoom = await db.room.create({
      data: {
        ownerUserId: ownerId,
        title: "Suite 201",
        building: "TRANSIENT",
        floor: "2",
        capacity: 1,
        transientDailyRate: "1400.00",
        isTransientPublished: true,
      },
      select: { id: true },
    });

    const transientBed = await db.bed.create({
      data: {
        ownerUserId: ownerId,
        roomId: transientRoom.id,
        number: "T1",
        dailyRate: "1400.00",
        status: "AVAILABLE",
      },
      select: { id: true },
    });

    const tenant = await db.tenant.create({
      data: {
        ownerUserId: ownerId,
        fullName: "Maria Cruz",
        phone: "09171234567",
      },
      select: { id: true },
    });

    const alloc = await db.allocation.create({
      data: {
        ownerUserId: ownerId,
        roomId: boardingRoom.id,
        bedId: bed1.id,
        scope: "BED",
        type: "TENANT_ASSIGNMENT",
        status: "ACTIVE",
        startDate: manilaDateTimeToUtc("2026-10-01", "00:00"),
        endDate: manilaDateTimeToUtc("2027-03-31", "23:59"),
      },
      select: { id: true },
    });

    const assignment = await db.tenantAssignment.create({
      data: {
        ownerUserId: ownerId,
        tenantId: tenant.id,
        roomId: boardingRoom.id,
        bedId: bed1.id,
        allocationId: alloc.id,
        startDate: manilaDateTimeToUtc("2026-10-01", "00:00"),
        endDate: manilaDateTimeToUtc("2027-03-31", "23:59"),
        monthlyRate: "5000.00",
        securityDeposit: "5000.00",
        status: "ACTIVE",
      },
      select: { id: true },
    });

    // Invoice issued Oct 01, due Oct 10 for 5000.00, paid Oct 12, then reversed Nov 05
    const inv = await db.invoice.create({
      data: {
        ownerUserId: ownerId,
        tenantId: tenant.id,
        assignmentId: assignment.id,
        invoiceNumber: "INV-2026-0101",
        billingPeriod: "2026-10",
        periodStartDate: manilaDateTimeToUtc("2026-10-01", "00:00"),
        periodEndDate: manilaDateTimeToUtc("2026-10-31", "23:59"),
        status: "ISSUED",
        dueDate: manilaDateTimeToUtc("2026-10-10", "00:00"),
        subtotalAmount: "5000.00",
        adjustmentAmount: "0.00",
        totalAmount: "5000.00",
        paidAmount: "0.00",
        issuedAt: manilaDateTimeToUtc("2026-10-01", "08:00"),
      },
      select: { id: true },
    });

    const origPayment = await db.payment.create({
      data: {
        ownerUserId: ownerId,
        tenantId: tenant.id,
        receiptNumber: "OR-2026-0001",
        status: "REVERSED",
        method: "GCASH",
        amount: "5000.00",
        unallocatedAmount: "0.00",
        paidAt: manilaDateTimeToUtc("2026-10-12", "10:00"),
        reversedAt: manilaDateTimeToUtc("2026-11-05", "09:00"),
        createdByActorType: "owner",
        createdByActorId: ownerId,
        snapshotTenantName: "Maria Cruz",
      },
      select: { id: true },
    });

    await db.paymentAllocation.create({
      data: {
        ownerUserId: ownerId,
        paymentId: origPayment.id,
        invoiceId: inv.id,
        amount: "5000.00",
      },
    });

    const revPayment = await db.payment.create({
      data: {
        ownerUserId: ownerId,
        tenantId: tenant.id,
        receiptNumber: null,
        status: "REVERSAL",
        method: "GCASH",
        amount: "-5000.00",
        unallocatedAmount: "0.00",
        paidAt: manilaDateTimeToUtc("2026-11-05", "09:00"),
        reversedPaymentId: origPayment.id,
        reversalReason: "Bank transfer bounced",
        reversedAt: manilaDateTimeToUtc("2026-11-05", "09:00"),
        createdByActorType: "owner",
        createdByActorId: ownerId,
        snapshotTenantName: "Maria Cruz",
      },
      select: { id: true },
    });

    await db.paymentAllocation.create({
      data: {
        ownerUserId: ownerId,
        paymentId: revPayment.id,
        invoiceId: inv.id,
        amount: "-5000.00",
      },
    });

    // Transient stays & revenue
    const guest = await db.transientGuest.create({
      data: {
        ownerUserId: ownerId,
        fullName: "Marco Reyes",
        phone: "09189876543",
      },
      select: { id: true },
    });

    await db.transientReservation.create({
      data: {
        ownerUserId: ownerId,
        guestId: guest.id,
        roomId: transientRoom.id,
        bedId: transientBed.id,
        scope: "WHOLE_ROOM",
        checkInDateManila: "2026-11-10",
        checkOutDateManila: "2026-11-12",
        startDate: manilaDateTimeToUtc("2026-11-10", "14:00"),
        endDate: manilaDateTimeToUtc("2026-11-12", "11:00"),
        nights: 2,
        dailyRate: "1400.00",
        totalAmount: "2800.00",
        status: "CHECKED_OUT",
        createdByActorType: "owner",
        createdByActorId: ownerId,
      },
    });

    await db.transientReservation.create({
      data: {
        ownerUserId: ownerId,
        guestId: guest.id,
        roomId: transientRoom.id,
        bedId: transientBed.id,
        scope: "WHOLE_ROOM",
        checkInDateManila: "2026-11-14",
        checkOutDateManila: "2026-11-15",
        startDate: manilaDateTimeToUtc("2026-11-14", "14:00"),
        endDate: manilaDateTimeToUtc("2026-11-15", "11:00"),
        nights: 1,
        dailyRate: "1400.00",
        totalAmount: "1400.00",
        status: "CANCELLED",
        createdByActorType: "owner",
        createdByActorId: ownerId,
      },
    });

    // Maintenance hold on transient room (active MAINTENANCE_HOLD allocation)
    const maint = await db.maintenanceRequest.create({
      data: {
        ownerUserId: ownerId,
        roomId: transientRoom.id,
        bedId: transientBed.id,
        title: "AC compressor repair",
        description: "Cooling fault",
        category: "APPLIANCE",
        priority: "HIGH",
        status: "OPEN",
        createdByActorType: "owner",
        createdByActorId: ownerId,
        createdAt: manilaDateTimeToUtc("2026-11-15", "11:00"),
      },
      select: { id: true },
    });

    await db.allocation.create({
      data: {
        ownerUserId: ownerId,
        roomId: transientRoom.id,
        bedId: transientBed.id,
        maintenanceRequestId: maint.id,
        scope: "WHOLE_ROOM",
        type: "MAINTENANCE_HOLD",
        status: "ACTIVE",
        startDate: manilaDateTimeToUtc("2026-11-15", "11:00"),
        endDate: manilaDateTimeToUtc("2026-11-18", "18:00"),
      },
    });

    // Unrelated owner fixture that must stay isolated
    await db.room.create({
      data: {
        ownerUserId: otherOwnerId,
        title: "X-999",
        building: "BOARDING",
        floor: "9",
        capacity: 4,
        baseMonthlyRate: "9999.00",
      },
    });

    // Historical check as of 2026-10-31 (before Nov 5 reversal -> invoice was PAID!)
    const octSnapshot = await getReportsOverview(ownerId, {
      asOfDate: "2026-10-31",
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
    });
    expect(octSnapshot.receivablesAging.summary.openInvoicesCount).toBe(0);
    expect(octSnapshot.receivablesAging.summary.totalOutstanding).toBe("0.00");
    expect(octSnapshot.collections.summary.netCollectedAmount).toBe("5000.00");

    // Current snapshot via API as of 2026-11-15 (reversal applied -> 5000.00 31-60d past due)
    const apiRes = await getReportsRoute(
      new Request(
        "https://daisy.local/api/reports?asOfDate=2026-11-15&fromDate=2026-11-01&toDate=2026-11-15",
      ),
    );
    expect(apiRes.status).toBe(200);
    expect(apiRes.headers.get("cache-control")).toBe("private, no-store");
    const novSnapshot = await apiRes.json();

    expect(novSnapshot.occupancy.summary.totalRooms).toBe(2);
    expect(novSnapshot.occupancy.summary.occupiedRooms).toBe(1);
    expect(novSnapshot.occupancy.summary.maintenanceRooms).toBe(1);
    expect(novSnapshot.occupancy.byBuilding).toHaveLength(2);
    expect(novSnapshot.rentRoll.summary.activeAssignments).toBe(1);
    expect(novSnapshot.rentRoll.summary.totalOpenBalance).toBe("5000.00");
    expect(novSnapshot.rentRoll.summary.averageMonthlyRent).toBe("5000.00");
    expect(novSnapshot.rentRoll.summary.openBalanceToRentPercent).toBe(100);
    expect(
      novSnapshot.rentRoll.leaseExpiries.reduce(
        (acc: number, b: { count: number }) => acc + b.count,
        0,
      ),
    ).toBe(1);

    expect(novSnapshot.receivablesAging.summary.openInvoicesCount).toBe(1);
    expect(novSnapshot.receivablesAging.summary.overdueInvoicesCount).toBe(1);
    expect(novSnapshot.receivablesAging.summary.overdueAmount).toBe("5000.00");
    expect(novSnapshot.receivablesAging.byScope).toHaveLength(2);
    expect(novSnapshot.receivablesAging.rows[0].bucket).toBe("31_60");
    expect(novSnapshot.receivablesAging.rows[0].balanceDue).toBe("5000.00");

    expect(novSnapshot.collections.summary.reversalCount).toBe(1);
    expect(novSnapshot.collections.summary.netCollectedAmount).toBe("-5000.00");
    expect(novSnapshot.collections.dailyTrend).toHaveLength(15);
    expect(novSnapshot.collections.byScope).toHaveLength(2);

    expect(novSnapshot.transientRevenue.summary.staysCount).toBe(2);
    expect(novSnapshot.transientRevenue.summary.cancelledCount).toBe(1);
    expect(novSnapshot.transientRevenue.summary.grossStayRevenue).toBe(
      "2800.00",
    );
    expect(novSnapshot.transientRevenue.summary.averageDailyRate).toBe(
      "1400.00",
    );
    expect(novSnapshot.transientRevenue.byStatus).toHaveLength(6);

    expect(novSnapshot.maintenance.summary.openCount).toBe(1);
    expect(novSnapshot.maintenance.summary.activeHoldCount).toBe(1);
    expect(novSnapshot.maintenance.byPriority).toHaveLength(4);
    expect(novSnapshot.maintenance.byBuilding).toHaveLength(2);

    // Screen read MUST write zero audit logs
    const auditsAfterRead = await db.auditLog.count({
      where: { ownerUserId: ownerId },
    });
    expect(auditsAfterRead).toBe(0);

    // CSV export writes identifier-only audit entry and returns attachment headers
    const exportRes = await exportReportRoute(
      new Request(
        "https://daisy.local/api/reports/export?reportType=receivables-aging&asOfDate=2026-11-15",
      ),
    );
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get("cache-control")).toBe("private, no-store");
    expect(exportRes.headers.get("referrer-policy")).toBe("no-referrer");
    expect(exportRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(exportRes.headers.get("content-disposition")).toContain(
      'filename="daisy-receivables-aging-2026-11-15.csv"',
    );
    const csvText = await exportRes.text();
    expect(csvText).toContain("INV-2026-0101");
    expect(csvText).toContain("5000.00");

    const exportAudits = await db.auditLog.findMany({
      where: { ownerUserId: ownerId, area: "reports" },
      select: {
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
      },
    });
    expect(exportAudits).toHaveLength(1);
    expect(exportAudits[0]?.action).toBe("report.exported");
    expect(exportAudits[0]?.entityId).toBe("receivables-aging");
    expect(JSON.stringify(exportAudits[0]?.metadata)).not.toContain("Maria");

    // Multi-format exports (Excel, Word, PDF) use the shared template and log export audits
    const formatAssertions = [
      {
        format: "xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: "daisy-receivables-aging-2026-11-15.xlsx",
        signature: [0x50, 0x4b, 0x03, 0x04],
      },
      {
        format: "docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: "daisy-receivables-aging-2026-11-15.docx",
        signature: [0x50, 0x4b, 0x03, 0x04],
      },
      {
        format: "pdf",
        contentType: "application/pdf",
        filename: "daisy-receivables-aging-2026-11-15.pdf",
        signature: [0x25, 0x50, 0x44, 0x46],
      },
    ] as const;

    for (const check of formatAssertions) {
      const res = await exportReportRoute(
        new Request(
          `https://daisy.local/api/reports/export?reportType=receivables-aging&asOfDate=2026-11-15&format=${check.format}`,
        ),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(check.contentType);
      expect(res.headers.get("content-disposition")).toContain(
        `filename="${check.filename}"`,
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(Array.from(bytes.slice(0, 4))).toEqual(check.signature);
    }

    const invalidFormatRes = await exportReportRoute(
      new Request(
        "https://daisy.local/api/reports/export?reportType=occupancy&format=txt",
      ),
    );
    expect(invalidFormatRes.status).toBe(400);

    // Pre-populate export rate limit to threshold (30) and assert 31st returns 429 + Retry-After
    await db.securityRateLimit.upsert({
      where: { key: `reports:${ownerId}:export` },
      create: {
        key: `reports:${ownerId}:export`,
        count: 30,
        resetsAt: new Date(Date.now() + 300_000),
      },
      update: {
        count: 30,
        resetsAt: new Date(Date.now() + 300_000),
      },
    });

    const throttledRes = await exportReportRoute(
      new Request(
        "https://daisy.local/api/reports/export?reportType=occupancy",
      ),
    );
    expect(throttledRes.status).toBe(429);
    expect(Number(throttledRes.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
