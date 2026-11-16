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

import { GET as getDashboardRoute } from "../../../src/app/api/dashboard/route";
import { getDashboardSnapshot } from "../../../src/features/dashboard/service";

const prefix = `dashboard-test-${randomUUID()}`;
const sweepPrefix = "dashboard-test-";
let seq = 0;

async function cleanupTestOwners(db: PrismaClient, ownerPrefix: string) {
  await db.notice.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.bookingRequest.deleteMany({
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
  await db.roomType.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.businessSettings.deleteMany({
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
  } finally {
    await db.$disconnect();
  }
});

describe("Dashboard operational snapshot integration", () => {
  it("fails closed on GET /api/dashboard when unauthenticated and returns null occupancy when empty", async () => {
    state.authenticated = false;
    const unauthRes = await getDashboardRoute();
    expect(unauthRes.status).toBe(401);

    state.authenticated = true;
    const db = state.db!;
    await db.owner.create({ data: { id: state.ownerId } });

    const res = await getDashboardRoute();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");

    const snapshot = (await res.json()) as Awaited<
      ReturnType<typeof getDashboardSnapshot>
    >;
    expect(snapshot.configuration.policiesConfigured).toBe(false);
    expect(snapshot.configuration.stayScheduleConfigured).toBe(false);
    expect(snapshot.occupancy.boarding.totalRooms).toBe(0);
    expect(snapshot.occupancy.boarding.occupancyPercent).toBeNull();
    expect(snapshot.occupancy.transient.totalRooms).toBe(0);
    expect(snapshot.occupancy.transient.occupancyPercent).toBeNull();
    expect(snapshot.billing.openBalance).toBe("0.00");
    expect(snapshot.billing.collectedThisMonth).toBe("0.00");
  });

  it("aggregates one Owner-scoped snapshot without leaking foreign records or creating audit rows", async () => {
    const db = state.db!;
    const ownerA = state.ownerId;
    const ownerB = `${prefix}-foreign-${seq++}`;
    const asOfUtc = manilaDateTimeToUtc("2026-11-16", "14:00");

    await db.owner.createMany({
      data: [{ id: ownerA }, { id: ownerB }],
    });

    await db.businessSettings.create({
      data: {
        ownerUserId: ownerA,
        businessName: "Daisy Boarding House",
        billingDayOfMonth: 5,
        gracePeriodDays: 5,
        prorationPolicy: "DAILY_EXACT",
        depositPolicy: "HOLD_SEPARATE",
        overpaymentPolicy: "CREDIT_NEXT_INVOICE",
        invoicePrefix: "INV",
        receiptPrefix: "OR",
        checkInTimeManila: "14:00",
        checkOutTimeManila: "12:00",
      },
    });

    const boardingTypeId = randomUUID();
    const transientTypeId = randomUUID();
    const foreignTypeId = randomUUID();
    await db.roomType.createMany({
      data: [
        {
          id: boardingTypeId,
          ownerUserId: ownerA,
          building: "BOARDING",
          name: "Standard Boarding",
          monthlyRate: "5000.00",
        },
        {
          id: transientTypeId,
          ownerUserId: ownerA,
          building: "TRANSIENT",
          name: "Transient Deluxe",
          dailyRate: "1500.00",
        },
        {
          id: foreignTypeId,
          ownerUserId: ownerB,
          building: "BOARDING",
          name: "Foreign Room Type",
          monthlyRate: "7000.00",
        },
      ],
    });

    const bRoom1 = randomUUID();
    const bRoom2 = randomUUID();
    const bRoom3 = randomUUID();
    const tRoom1 = randomUUID();
    const tRoom2 = randomUUID();
    const fRoom1 = randomUUID();

    await db.room.createMany({
      data: [
        {
          id: bRoom1,
          ownerUserId: ownerA,
          building: "BOARDING",
          number: "101",
          roomTypeId: boardingTypeId,
          capacity: 1,
          baseMonthlyRate: "5000.00",
        },
        {
          id: bRoom2,
          ownerUserId: ownerA,
          building: "BOARDING",
          number: "102",
          roomTypeId: boardingTypeId,
          capacity: 1,
          baseMonthlyRate: "5000.00",
        },
        {
          id: bRoom3,
          ownerUserId: ownerA,
          building: "BOARDING",
          number: "103",
          roomTypeId: boardingTypeId,
          capacity: 1,
          baseMonthlyRate: "5000.00",
        },
        {
          id: tRoom1,
          ownerUserId: ownerA,
          building: "TRANSIENT",
          number: "T1",
          roomTypeId: transientTypeId,
          capacity: 2,
          transientDailyRate: "1500.00",
          isTransientPublished: true,
        },
        {
          id: tRoom2,
          ownerUserId: ownerA,
          building: "TRANSIENT",
          number: "T2",
          roomTypeId: transientTypeId,
          capacity: 2,
          transientDailyRate: "1500.00",
          isTransientPublished: false,
        },
        {
          id: fRoom1,
          ownerUserId: ownerB,
          building: "BOARDING",
          number: "999",
          roomTypeId: foreignTypeId,
          capacity: 1,
          baseMonthlyRate: "7000.00",
        },
      ],
    });

    const bBed1 = randomUUID();
    const bBed2 = randomUUID();
    const bBed3 = randomUUID();
    const tBed1 = randomUUID();
    const tBed2 = randomUUID();
    await db.bed.createMany({
      data: [
        {
          id: bBed1,
          ownerUserId: ownerA,
          roomId: bRoom1,
          number: "1",
          monthlyRate: "5000.00",
          status: "OCCUPIED",
        },
        {
          id: bBed2,
          ownerUserId: ownerA,
          roomId: bRoom2,
          number: "1",
          monthlyRate: "5000.00",
          status: "AVAILABLE",
        },
        {
          id: bBed3,
          ownerUserId: ownerA,
          roomId: bRoom3,
          number: "1",
          monthlyRate: "5000.00",
          status: "MAINTENANCE",
        },
        {
          id: tBed1,
          ownerUserId: ownerA,
          roomId: tRoom1,
          number: "1",
          dailyRate: "1500.00",
          status: "OCCUPIED",
        },
        {
          id: tBed2,
          ownerUserId: ownerA,
          roomId: tRoom2,
          number: "1",
          dailyRate: "1500.00",
          status: "AVAILABLE",
        },
      ],
    });

    const tenantId = randomUUID();
    const foreignTenantId = randomUUID();
    await db.tenant.createMany({
      data: [
        { id: tenantId, ownerUserId: ownerA, fullName: "Juan Dela Cruz" },
        {
          id: foreignTenantId,
          ownerUserId: ownerB,
          fullName: "Foreign Tenant",
        },
      ],
    });

    const assignmentAllocId = randomUUID();
    await db.allocation.create({
      data: {
        id: assignmentAllocId,
        ownerUserId: ownerA,
        roomId: bRoom1,
        bedId: bBed1,
        type: "TENANT_ASSIGNMENT",
        status: "ACTIVE",
        startDate: manilaDateTimeToUtc("2026-11-16", "00:00"),
        endDate: manilaDateTimeToUtc("2026-11-20", "00:00"),
      },
    });
    await db.tenantAssignment.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerA,
        tenantId,
        roomId: bRoom1,
        bedId: bBed1,
        allocationId: assignmentAllocId,
        startDate: manilaDateTimeToUtc("2026-11-16", "00:00"),
        endDate: manilaDateTimeToUtc("2026-11-20", "00:00"),
        monthlyRate: "5000.00",
        securityDeposit: "5000.00",
        status: "ACTIVE",
      },
    });

    const guestId = randomUUID();
    await db.transientGuest.create({
      data: { id: guestId, ownerUserId: ownerA, fullName: "Maria Santos" },
    });

    const checkInStayId = randomUUID();
    const checkOutStayId = randomUUID();
    await db.transientReservation.createMany({
      data: [
        {
          id: checkInStayId,
          ownerUserId: ownerA,
          guestId,
          roomId: tRoom1,
          bedId: tBed1,
          scope: "WHOLE_ROOM",
          checkInDateManila: "2026-11-16",
          checkOutDateManila: "2026-11-18",
          startDate: manilaDateTimeToUtc("2026-11-16", "14:00"),
          endDate: manilaDateTimeToUtc("2026-11-18", "12:00"),
          nights: 2,
          partySize: 2,
          dailyRate: "1500.00",
          totalAmount: "3000.00",
          status: "CHECKED_IN",
          createdByActorType: "owner",
          createdByActorId: ownerA,
        },
        {
          id: checkOutStayId,
          ownerUserId: ownerA,
          guestId,
          roomId: tRoom2,
          bedId: tBed2,
          scope: "WHOLE_ROOM",
          checkInDateManila: "2026-11-14",
          checkOutDateManila: "2026-11-16",
          startDate: manilaDateTimeToUtc("2026-11-14", "14:00"),
          endDate: manilaDateTimeToUtc("2026-11-16", "12:00"),
          nights: 2,
          partySize: 1,
          dailyRate: "1500.00",
          totalAmount: "3000.00",
          status: "CHECKED_IN",
          createdByActorType: "owner",
          createdByActorId: ownerA,
        },
      ],
    });
    await db.allocation.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerA,
        roomId: tRoom1,
        bedId: tBed1,
        transientReservationId: checkInStayId,
        scope: "WHOLE_ROOM",
        type: "TRANSIENT_RESERVATION",
        status: "ACTIVE",
        startDate: manilaDateTimeToUtc("2026-11-16", "14:00"),
        endDate: manilaDateTimeToUtc("2026-11-18", "12:00"),
      },
    });

    await db.bookingRequest.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerA,
        referenceCode: `REQ-${randomUUID().slice(0, 8)}`,
        idempotencyKey: randomUUID(),
        requestFingerprint: "fp-test",
        roomId: tRoom1,
        scope: "WHOLE_ROOM",
        guestName: "Pending Visitor",
        checkInDateManila: "2026-11-20",
        checkOutDateManila: "2026-11-22",
        nights: 2,
        partySize: 1,
        quotedDailyRate: "1500.00",
        quotedTotalAmount: "3000.00",
        status: "PENDING",
      },
    });

    const maintReqId = randomUUID();
    await db.maintenanceRequest.create({
      data: {
        id: maintReqId,
        ownerUserId: ownerA,
        roomId: bRoom3,
        bedId: bBed3,
        title: "Broken water valve",
        description: "Replace main shutoff valve",
        category: "PLUMBING",
        priority: "URGENT",
        status: "OPEN",
        createdByActorType: "owner",
        createdByActorId: ownerA,
      },
    });
    await db.allocation.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerA,
        roomId: bRoom3,
        bedId: bBed3,
        maintenanceRequestId: maintReqId,
        type: "MAINTENANCE_HOLD",
        status: "ACTIVE",
        startDate: manilaDateTimeToUtc("2026-11-15", "00:00"),
        endDate: manilaDateTimeToUtc("2026-11-19", "00:00"),
      },
    });

    await db.invoice.createMany({
      data: [
        {
          id: randomUUID(),
          ownerUserId: ownerA,
          tenantId,
          invoiceNumber: "INV-2026-000001",
          billingPeriod: "2026-11",
          periodStartDate: manilaDateTimeToUtc("2026-11-01", "00:00"),
          periodEndDate: manilaDateTimeToUtc("2026-12-01", "00:00"),
          dueDate: manilaDateTimeToUtc("2026-11-10", "00:00"),
          status: "PARTIALLY_PAID",
          subtotalAmount: "5000.00",
          totalAmount: "5000.00",
          paidAmount: "2000.00",
          snapshotTenantName: "Juan Dela Cruz",
        },
        {
          id: randomUUID(),
          ownerUserId: ownerA,
          transientGuestId: guestId,
          invoiceNumber: "INV-2026-000002",
          periodStartDate: manilaDateTimeToUtc("2026-11-16", "00:00"),
          periodEndDate: manilaDateTimeToUtc("2026-11-18", "00:00"),
          dueDate: manilaDateTimeToUtc("2026-11-18", "00:00"),
          status: "ISSUED",
          subtotalAmount: "3000.00",
          totalAmount: "3000.00",
          paidAmount: "0.00",
          snapshotTenantName: "Maria Santos",
        },
        {
          id: randomUUID(),
          ownerUserId: ownerA,
          tenantId,
          periodStartDate: manilaDateTimeToUtc("2026-12-01", "00:00"),
          periodEndDate: manilaDateTimeToUtc("2027-01-01", "00:00"),
          dueDate: manilaDateTimeToUtc("2026-12-05", "00:00"),
          status: "DRAFT",
          subtotalAmount: "5000.00",
          totalAmount: "5000.00",
          paidAmount: "0.00",
        },
        {
          id: randomUUID(),
          ownerUserId: ownerB,
          tenantId: foreignTenantId,
          invoiceNumber: "INV-2026-999999",
          periodStartDate: manilaDateTimeToUtc("2026-11-01", "00:00"),
          periodEndDate: manilaDateTimeToUtc("2026-12-01", "00:00"),
          dueDate: manilaDateTimeToUtc("2026-11-05", "00:00"),
          status: "ISSUED",
          subtotalAmount: "99000.00",
          totalAmount: "99000.00",
          paidAmount: "0.00",
          snapshotTenantName: "Foreign Tenant",
        },
      ],
    });

    const reversedId = randomUUID();
    await db.payment.createMany({
      data: [
        {
          id: randomUUID(),
          ownerUserId: ownerA,
          tenantId,
          receiptNumber: "OR-2026-000001",
          status: "POSTED",
          method: "CASH",
          amount: "2000.00",
          paidAt: manilaDateTimeToUtc("2026-11-12", "10:00"),
          createdByActorType: "owner",
          createdByActorId: ownerA,
        },
        {
          id: reversedId,
          ownerUserId: ownerA,
          tenantId,
          receiptNumber: "OR-2026-000002",
          status: "REVERSED",
          method: "GCASH",
          amount: "1500.00",
          paidAt: manilaDateTimeToUtc("2026-11-13", "10:00"),
          reversedAt: manilaDateTimeToUtc("2026-11-14", "10:00"),
          createdByActorType: "owner",
          createdByActorId: ownerA,
        },
        {
          id: randomUUID(),
          ownerUserId: ownerA,
          tenantId,
          status: "REVERSAL",
          method: "GCASH",
          amount: "-1500.00",
          paidAt: manilaDateTimeToUtc("2026-11-14", "10:00"),
          reversedPaymentId: reversedId,
          reversalReason: "Duplicate entry",
          reversedAt: manilaDateTimeToUtc("2026-11-14", "10:00"),
          createdByActorType: "owner",
          createdByActorId: ownerA,
        },
        {
          id: randomUUID(),
          ownerUserId: ownerA,
          tenantId,
          receiptNumber: "OR-2026-000000",
          status: "POSTED",
          method: "CASH",
          amount: "5000.00",
          paidAt: manilaDateTimeToUtc("2026-10-25", "10:00"),
          createdByActorType: "owner",
          createdByActorId: ownerA,
        },
        {
          id: randomUUID(),
          ownerUserId: ownerB,
          tenantId: foreignTenantId,
          receiptNumber: "OR-2026-999999",
          status: "POSTED",
          method: "CASH",
          amount: "88000.00",
          paidAt: manilaDateTimeToUtc("2026-11-15", "10:00"),
          createdByActorType: "owner",
          createdByActorId: ownerB,
        },
      ],
    });

    await db.notice.createMany({
      data: [
        {
          id: randomUUID(),
          ownerUserId: ownerA,
          audience: "EVERYONE",
          title: "Scheduled water tank cleaning",
          body: "Water supply pauses 9:00 AM to 11:00 AM.",
          startDateManila: "2026-11-15",
          endDateManila: "2026-11-17",
          startDate: manilaDateTimeToUtc("2026-11-15", "00:00"),
          endDate: manilaDateTimeToUtc("2026-11-18", "00:00"),
        },
        {
          id: randomUUID(),
          ownerUserId: ownerA,
          audience: "EVERYONE",
          title: "Expired notice",
          body: "Already concluded.",
          startDateManila: "2026-11-01",
          endDateManila: "2026-11-03",
          startDate: manilaDateTimeToUtc("2026-11-01", "00:00"),
          endDate: manilaDateTimeToUtc("2026-11-04", "00:00"),
        },
      ],
    });

    await db.auditLog.createMany({
      data: [
        {
          id: randomUUID(),
          ownerUserId: ownerA,
          area: "payments",
          action: "payment.recorded",
          actorType: "owner",
          actorId: ownerA,
          entityType: "payment",
          entityId: randomUUID(),
          sequence: BigInt(1),
        },
        {
          id: randomUUID(),
          ownerUserId: ownerB,
          area: "payments",
          action: "payment.recorded",
          actorType: "owner",
          actorId: ownerB,
          entityType: "payment",
          entityId: randomUUID(),
          sequence: BigInt(1),
        },
      ],
    });

    const snapshot = await getDashboardSnapshot(ownerA, { asOfUtc });

    expect(snapshot.businessDateManila).toBe("2026-11-16");
    expect(snapshot.currentMonthKey).toBe("2026-11");
    expect(snapshot.configuration.policiesConfigured).toBe(true);
    expect(snapshot.configuration.stayScheduleConfigured).toBe(true);

    expect(snapshot.occupancy.boarding).toEqual({
      totalRooms: 3,
      occupiedRooms: 1,
      availableRooms: 1,
      maintenanceRooms: 1,
      publishedRooms: 0,
      occupancyPercent: 33,
    });
    expect(snapshot.occupancy.transient).toEqual({
      totalRooms: 2,
      occupiedRooms: 1,
      availableRooms: 1,
      maintenanceRooms: 0,
      publishedRooms: 1,
      occupancyPercent: 50,
    });

    expect(snapshot.billing.openInvoiceCount).toBe(2);
    expect(snapshot.billing.openBalance).toBe("6000.00");
    expect(snapshot.billing.overdueInvoiceCount).toBe(1);
    expect(snapshot.billing.overdueBalance).toBe("3000.00");
    expect(snapshot.billing.dueSoonInvoiceCount).toBe(1);
    expect(snapshot.billing.draftInvoiceCount).toBe(1);
    expect(snapshot.billing.collectedThisMonth).toBe("2000.00");
    expect(snapshot.billing.previousMonthKey).toBe("2026-10");
    expect(snapshot.billing.collectedPreviousMonth).toBe("5000.00");
    expect(snapshot.billing.dueAndOverdueInvoices).toHaveLength(2);
    expect(snapshot.billing.dueAndOverdueInvoices[0]?.isOverdue).toBe(true);

    expect(snapshot.staysToday.pendingBookingRequests).toBe(1);
    expect(snapshot.staysToday.pendingBookingRequestsList).toHaveLength(1);
    expect(snapshot.staysToday.pendingBookingRequestsList[0]?.guestName).toBe(
      "Pending Visitor",
    );
    expect(snapshot.staysToday.checkInsTodayCount).toBe(1);
    expect(snapshot.staysToday.checkOutsTodayCount).toBe(1);
    expect(snapshot.staysToday.boardingMoveInsTodayCount).toBe(1);
    expect(snapshot.staysToday.boardingEndingSoonCount).toBe(1);

    expect(snapshot.maintenance.openCount).toBe(1);
    expect(snapshot.maintenance.urgentCount).toBe(1);
    expect(snapshot.maintenance.activeHoldCount).toBe(1);
    expect(snapshot.maintenance.openRequests[0]?.hasActiveHold).toBe(true);

    expect(snapshot.notices.activeCount).toBe(1);
    expect(snapshot.notices.activeNotices[0]?.title).toBe(
      "Scheduled water tank cleaning",
    );

    expect(snapshot.recentActivity).toHaveLength(1);
    expect(snapshot.recentActivity[0]?.action).toBe("payment.recorded");

    const auditCountAfter = await db.auditLog.count({
      where: { ownerUserId: ownerA },
    });
    expect(auditCountAfter).toBe(1);
  });
});
