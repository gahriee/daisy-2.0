import {
  afterAll,
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../../src/generated/prisma/client";

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

import {
  AllocationConflictError,
  ConflictError,
  PreconditionError,
} from "../../../src/lib/errors";
import { listAuditLogs } from "../../../src/features/audit/service";
import { updateBusinessSettingsModule } from "../../../src/features/settings/service";
import { createBed, createRoom } from "../../../src/features/rooms/service";
import { registerOwnerDevice } from "../../../src/server/auth/device";
import { listOwnerNotifications } from "../../../src/server/notifications/service";
import {
  getPaymentsOverview,
  recordPayment,
} from "../../../src/features/payments/service";
import {
  derivePublicClientBucketKey,
  getPublicPublishedRoomAvailability,
} from "../../../src/features/transients/public-service";
import {
  approveBookingRequest,
  checkInTransientReservation,
  checkOutTransientReservation,
  createTransientGuest,
  createTransientReservation,
  createTransientStayInvoice,
  getTransientRoomListingDetail,
  getTransientsOverview,
  updateRoomTransientPublish,
} from "../../../src/features/transients/service";
import { applyTransientSyncOperation } from "../../../src/features/transients/sync-handler";
import { GET as getTransientsRoute } from "../../../src/app/api/transients/route";
import { GET as getPublicAvailabilityRoute } from "../../../src/app/api/public/availability/route";
import { POST as postPublicBookingRequestRoute } from "../../../src/app/api/public/booking-requests/route";

const prefix = `tr-test-${randomUUID()}`;
let seq = 0;
const usedBucketKeys = new Set<string>();

function trackPublicHeaders(ip: string, extra?: Record<string, string>) {
  const headers = new Headers({
    "x-real-ip": ip,
    ...(extra ?? {}),
  });
  const clientKey = derivePublicClientBucketKey(headers);
  usedBucketKeys.add(`public-booking:availability:${clientKey}`);
  usedBucketKeys.add(`public-booking:submit:${clientKey}`);
  return headers;
}

async function configureOwnerSettings(ownerId: string) {
  vi.stubEnv("BILLING_DAY_OF_MONTH", "5");
  vi.stubEnv("BILLING_GRACE_PERIOD_DAYS", "5");
  vi.stubEnv("BILLING_PRORATION_POLICY", "DAILY_EXACT");
  vi.stubEnv("BILLING_DEPOSIT_POLICY", "HOLD_SEPARATE");
  vi.stubEnv("BILLING_OVERPAYMENT_POLICY", "REJECT_OVERPAYMENT");
  vi.stubEnv("INVOICE_PREFIX", "INV");
  vi.stubEnv("RECEIPT_PREFIX", "OR");
  await updateBusinessSettingsModule(ownerId, {
    module: "property",
    expectedVersion: 0,
    businessName: "Daisy Transient Test Property",
    businessPhone: null,
    businessAddress: null,
    tin: null,
    checkInTimeManila: "14:00",
    checkOutTimeManila: "11:00",
    smsOverdueEnabled: false,
    smsOverdueSendTimeManila: "09:00",
  });
}

async function seedInventory(ownerId: string) {
  const publishedRoom = await createRoom(ownerId, {
    building: "TRANSIENT",
    title: "T-201",
    floor: "2F",
    capacity: 2,
    transientDailyRate: "650.00",
    summary: "PRIVATE OWNER NOTE DO NOT LEAK",
  });
  const unpublishedRoom = await createRoom(ownerId, {
    building: "TRANSIENT",
    title: "T-202",
    floor: "2F",
    capacity: 2,
    transientDailyRate: "550.00",
    summary: "PRIVATE UNPUBLISHED TRANSIENT ROOM",
  });
  const boardingRoom = await createRoom(ownerId, {
    building: "BOARDING",
    title: "B-101",
    floor: "1F",
    capacity: 2,
    baseMonthlyRate: "6000.00",
    summary: "PRIVATE BOARDER ROOM",
  });
  const bedA = await createBed(ownerId, {
    roomId: publishedRoom.id,
    number: "B1",
    label: "Window",
    dailyRate: "650.00",
  });
  const bedB = await createBed(ownerId, {
    roomId: publishedRoom.id,
    number: "B2",
    label: "Door",
    dailyRate: "650.00",
  });

  await updateRoomTransientPublish(ownerId, {
    roomId: publishedRoom.id,
    expectedVersion: publishedRoom.version,
    isTransientPublished: true,
    transientTitle: "Sunny 2F Transient",
    transientDescription: "Quiet air-conditioned transient room",
    transientScope: "BED",
    transientDailyRate: "650.00",
  });

  return {
    publishedRoom,
    unpublishedRoom,
    boardingRoom,
    bedA,
    bedB,
  };
}

beforeAll(() => {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing opted-in TEST_DATABASE_URL");
  }
  state.db = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
});

beforeEach(() => {
  state.authenticated = true;
  state.ownerId = `${prefix}-${seq++}`;
  vi.stubEnv("OWNER_USER_ID", state.ownerId);
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("SESSION_SECRET", "daisy-transients-integration-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  const db = state.db;
  if (!db) return;

  try {
    await db.notificationRead.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.securityEvent.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.auditLog.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.changeFeed.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.syncOperationOutcome.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.syncHead.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.paymentProof.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.paymentProofIntent.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.paymentAllocation.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.payment.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.invoiceAdjustment.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.invoiceItem.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.invoice.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.allocation.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.bookingRequest.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.transientReservation.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.transientGuest.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.documentSequence.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.bed.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.room.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.device.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.businessSettings.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });
    await db.securityRateLimit.deleteMany({
      where: {
        OR: [
          { key: { startsWith: `auth:${prefix}` } },
          ...(usedBucketKeys.size > 0
            ? [{ key: { in: Array.from(usedBucketKeys) } }]
            : []),
        ],
      },
    });

    expect(
      await db.bookingRequest.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.transientReservation.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.owner.count({ where: { id: { startsWith: prefix } } }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("transients, public booking, billing bridge & sync integration", () => {
  it("filters public availability strictly to published rooms without leaking private notes, rejects unauthenticated owner route, and enforces origin/idempotency/rate limits", async () => {
    await configureOwnerSettings(state.ownerId);
    const { publishedRoom, unpublishedRoom } = await seedInventory(
      state.ownerId,
    );

    state.authenticated = false;
    const unauthRes = await getTransientsRoute();
    expect(unauthRes.status).toBe(401);
    state.authenticated = true;

    const ip = `203.0.113.${seq + 10}`;
    const availHeaders = trackPublicHeaders(ip);
    const availRes = await getPublicAvailabilityRoute(
      new Request(
        "http://localhost:3000/api/public/availability?checkIn=2026-12-01&checkOut=2026-12-03&guests=1",
        { headers: availHeaders },
      ),
    );
    expect(availRes.status).toBe(200);
    expect(availRes.headers.get("cache-control")).toBe("no-store");

    const availJson = (await availRes.json()) as {
      rooms: Array<{
        roomId: string;
        availableUnitsForRange: number;
        title: string;
      }>;
      nights: number;
    };
    const serialized = JSON.stringify(availJson);
    expect(availJson.nights).toBe(2);
    expect(availJson.rooms.map((r) => r.roomId)).toEqual([publishedRoom.id]);
    expect(availJson.rooms[0]?.availableUnitsForRange).toBe(2);
    expect(serialized).not.toContain(unpublishedRoom.id);
    expect(serialized).not.toContain("PRIVATE OWNER NOTE");

    // Foreign Origin rejection
    const foreignRes = await postPublicBookingRequestRoute(
      new Request("http://localhost:3000/api/public/booking-requests", {
        method: "POST",
        headers: trackPublicHeaders(ip, {
          origin: "https://evil.example",
          "content-type": "application/json",
        }),
        body: JSON.stringify({}),
      }),
    );
    expect(foreignRes.status).toBe(403);

    // Same-origin submission + idempotency replay + fingerprint mismatch 409
    const basePayload = {
      idempotencyKey: `pub-idem-${randomUUID()}`,
      roomId: publishedRoom.id,
      scope: "BED",
      checkInDateManila: "2026-12-01",
      checkOutDateManila: "2026-12-03",
      partySize: 1,
      guestName: "Liza Bautista",
      guestPhone: "+63 917 888 0001",
      guestEmail: "liza.bautista@example.com",
      notes: "Arriving 3 PM",
      privacyConsentAccepted: true,
    };

    const submitRes1 = await postPublicBookingRequestRoute(
      new Request("http://localhost:3000/api/public/booking-requests", {
        method: "POST",
        headers: trackPublicHeaders(ip, {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        }),
        body: JSON.stringify(basePayload),
      }),
    );
    expect(submitRes1.status).toBe(201);
    const ack1 = (await submitRes1.json()) as {
      id: string;
      referenceCode: string;
    };
    expect(ack1.referenceCode).toMatch(/^REQ-/);

    const replayRes = await postPublicBookingRequestRoute(
      new Request("http://localhost:3000/api/public/booking-requests", {
        method: "POST",
        headers: trackPublicHeaders(ip, {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        }),
        body: JSON.stringify(basePayload),
      }),
    );
    expect(replayRes.status).toBe(201);
    const ackReplay = (await replayRes.json()) as { id: string };
    expect(ackReplay.id).toBe(ack1.id);

    const conflictRes = await postPublicBookingRequestRoute(
      new Request("http://localhost:3000/api/public/booking-requests", {
        method: "POST",
        headers: trackPublicHeaders(ip, {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          ...basePayload,
          guestName: "Different Visitor",
        }),
      }),
    );
    expect(conflictRes.status).toBe(409);

    // AuditLog identifier-only (public_visitor) + PII-free notification projection
    const audits = await listAuditLogs(state.ownerId, {
      area: "transients",
    });
    const publicAudit = audits.entries.find(
      (a) => a.action === "booking_request.submitted" && a.entityId === ack1.id,
    );
    expect(publicAudit?.actorType).toBe("public_visitor");
    expect(JSON.stringify(publicAudit)).not.toContain("Liza Bautista");
    expect(JSON.stringify(publicAudit)).not.toContain("+63 917 888 0001");

    const notifications = await listOwnerNotifications(state.ownerId);
    const reqNote = notifications.find(
      (n) => n.key === `booking_request:pending:${ack1.id}`,
    );
    expect(reqNote?.title).toBe("New booking request");
    expect(reqNote?.destination).toBe(`/transients/requests/${ack1.id}`);
    expect(reqNote?.message).not.toContain("Liza Bautista");

    // DB-backed rate limit: we already sent 3 valid/replayed/conflicted POSTs on `ip`; send 8 more to hit 429 on total 11th submit
    let hit429 = false;
    let retryHeader: string | null = null;
    for (let i = 0; i < 8; i++) {
      const res = await postPublicBookingRequestRoute(
        new Request("http://localhost:3000/api/public/booking-requests", {
          method: "POST",
          headers: trackPublicHeaders(ip, {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            ...basePayload,
            idempotencyKey: `pub-rl-${randomUUID()}`,
          }),
        }),
      );
      if (res.status === 429) {
        hit429 = true;
        retryHeader = res.headers.get("retry-after");
        break;
      }
    }
    expect(hit429).toBe(true);
    expect(Number(retryHeader)).toBeGreaterThanOrEqual(1);
  }, 45_000);

  it("enforces rate-change review & allocation conflict rollback on request approval, supports check-in/out bed release, and settles stay invoices via /payments", async () => {
    await configureOwnerSettings(state.ownerId);
    const { publishedRoom, bedA, bedB } = await seedInventory(state.ownerId);

    const ip = `203.0.113.${seq + 50}`;
    const submitRes = await postPublicBookingRequestRoute(
      new Request("http://localhost:3000/api/public/booking-requests", {
        method: "POST",
        headers: trackPublicHeaders(ip, {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          idempotencyKey: `pub-approve-${randomUUID()}`,
          roomId: publishedRoom.id,
          scope: "BED",
          checkInDateManila: "2026-12-10",
          checkOutDateManila: "2026-12-12",
          partySize: 1,
          guestName: "Paolo Cruz",
          guestPhone: "09179990002",
          guestEmail: "paolo@example.com",
          notes: "Early arrival",
          privacyConsentAccepted: true,
        }),
      }),
    );
    expect(submitRes.status).toBe(201);
    const ack = (await submitRes.json()) as { id: string };

    // Occupy Bed A first with a direct transient stay overlapping Dec 10-12
    const blockerGuest = await createTransientGuest(state.ownerId, {
      fullName: "Existing Guest",
      phone: "09170001111",
    });
    await createTransientReservation(state.ownerId, {
      guestId: blockerGuest.id,
      roomId: publishedRoom.id,
      bedId: bedA.id,
      scope: "BED",
      checkInDateManila: "2026-12-10",
      checkOutDateManila: "2026-12-12",
      partySize: 1,
    });

    // Updating the room's transient daily rate triggers rate-change confirmation on approval
    await updateRoomTransientPublish(state.ownerId, {
      roomId: publishedRoom.id,
      expectedVersion: publishedRoom.version + 1,
      isTransientPublished: true,
      transientTitle: "Sunny 2F Transient",
      transientDescription: "Quiet air-conditioned transient room",
      transientScope: "BED",
      transientDailyRate: "720.00",
    });

    await expect(
      approveBookingRequest(state.ownerId, {
        requestId: ack.id,
        expectedVersion: 1,
        bedId: bedB.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Picking occupied Bed A fails with AllocationConflictError and rolls back cleanly (request stays PENDING)
    await expect(
      approveBookingRequest(state.ownerId, {
        requestId: ack.id,
        expectedVersion: 1,
        bedId: bedA.id,
        confirmRateChange: true,
      }),
    ).rejects.toBeInstanceOf(AllocationConflictError);

    const overviewBeforeRetry = await getTransientsOverview(state.ownerId);
    expect(
      overviewBeforeRetry.requests.find((r) => r.id === ack.id)?.status,
    ).toBe("PENDING");
    expect(
      overviewBeforeRetry.guests.some((g) => g.fullName === "Paolo Cruz"),
    ).toBe(false);

    // Approving on Bed B succeeds, issues stay invoice, check-in & check-out release Bed B immediately
    const approved = await approveBookingRequest(state.ownerId, {
      requestId: ack.id,
      expectedVersion: 1,
      bedId: bedB.id,
      confirmRateChange: true,
      issueInvoiceImmediately: false,
    });
    expect(approved.reservation.dailyRate).toBe("720.00");
    expect(approved.reservation.totalAmount).toBe("1440.00");

    const checkedIn = await checkInTransientReservation(state.ownerId, {
      reservationId: approved.reservation.id,
      expectedVersion: approved.reservation.version,
    });
    expect(checkedIn.status).toBe("CHECKED_IN");

    const checkedOut = await checkOutTransientReservation(state.ownerId, {
      reservationId: checkedIn.id,
      expectedVersion: checkedIn.version,
      actualCheckOutDateManila: "2026-12-11",
    });
    expect(checkedOut.status).toBe("CHECKED_OUT");

    // Bed B can immediately accept another reservation on Dec 11-13 after checkout truncation
    const rebook = await createTransientReservation(state.ownerId, {
      guestId: blockerGuest.id,
      roomId: publishedRoom.id,
      bedId: bedB.id,
      scope: "BED",
      checkInDateManila: "2026-12-11",
      checkOutDateManila: "2026-12-13",
      partySize: 1,
    });
    expect(rebook.status).toBe("CONFIRMED");

    // Issue stay invoice for approved stay and record payment via /payments
    const invoice = await createTransientStayInvoice(state.ownerId, {
      reservationId: approved.reservation.id,
      issueImmediately: true,
    });
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(invoice.transientGuestId).toBe(approved.reservation.guestId);

    const payOverviewBefore = await getPaymentsOverview(state.ownerId);
    expect(
      payOverviewBefore.transientGuests.some(
        (g) => g.id === approved.reservation.guestId,
      ),
    ).toBe(true);

    const payment = await recordPayment(state.ownerId, {
      transientGuestId: approved.reservation.guestId,
      amount: invoice.totalAmount,
      method: "CASH",
      allocations: [{ invoiceId: invoice.id, amount: invoice.totalAmount }],
      proofIntentIds: [],
    });
    expect(payment.payerKind).toBe("TRANSIENT");
    expect(payment.receiptNumber).toMatch(/^OR-\d{4}-\d{6}$/);
  }, 60_000);

  it("handles offline transient guest creation, tentative stay conflict marking Needs attention, and opId replay idempotency", async () => {
    await configureOwnerSettings(state.ownerId);
    const { publishedRoom, bedA } = await seedInventory(state.ownerId);

    const registered = await registerOwnerDevice({
      ownerUserId: state.ownerId,
      label: "Transient Offline Phone",
    });
    if (!registered.rawToken) {
      throw new Error("Expected raw device token for new test device");
    }

    const onlineGuest = await createTransientGuest(state.ownerId, {
      fullName: "Online Occupant",
      phone: "09172223333",
    });
    await createTransientReservation(state.ownerId, {
      guestId: onlineGuest.id,
      roomId: publishedRoom.id,
      bedId: bedA.id,
      scope: "BED",
      checkInDateManila: "2026-12-20",
      checkOutDateManila: "2026-12-22",
      partySize: 1,
    });

    const offlineGuestId = randomUUID();
    const guestOpId = randomUUID();
    const guestResult = await applyTransientSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken: registered.rawToken,
      rawOperation: {
        protocolVersion: 1,
        opId: guestOpId,
        deviceId: registered.deviceId,
        localSequence: 1,
        type: "transient_guest.create",
        entityId: offlineGuestId,
        baseVersion: 0,
        dependsOn: [],
        occurredAt: new Date().toISOString(),
        payload: {
          fullName: "Offline Walk-in",
          phone: "09174445555",
          email: null,
          notes: "Created in airplane mode",
        },
      },
    });
    expect(guestResult.status).toBe("applied");

    // Replaying exact same opId returns duplicate
    const dupResult = await applyTransientSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken: registered.rawToken,
      rawOperation: {
        protocolVersion: 1,
        opId: guestOpId,
        deviceId: registered.deviceId,
        localSequence: 1,
        type: "transient_guest.create",
        entityId: offlineGuestId,
        baseVersion: 0,
        dependsOn: [],
        occurredAt: new Date().toISOString(),
        payload: {
          fullName: "Offline Walk-in",
          phone: "09174445555",
          email: null,
          notes: "Created in airplane mode",
        },
      },
    });
    expect(dupResult.status).toBe("duplicate");

    // Tentative stay on overlapping Bed A surfaces conflict (Needs attention) instead of throwing
    const conflictStayResult = await applyTransientSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken: registered.rawToken,
      rawOperation: {
        protocolVersion: 1,
        opId: randomUUID(),
        deviceId: registered.deviceId,
        localSequence: 2,
        type: "transient_reservation.create",
        entityId: randomUUID(),
        baseVersion: 0,
        dependsOn: [guestOpId],
        occurredAt: new Date().toISOString(),
        payload: {
          guestId: offlineGuestId,
          roomId: publishedRoom.id,
          bedId: bedA.id,
          scope: "BED",
          checkInDateManila: "2026-12-20",
          checkOutDateManila: "2026-12-22",
          partySize: 1,
        },
      },
    });
    expect(conflictStayResult.status).toBe("conflict");
    expect(conflictStayResult.reason?.toLowerCase()).toContain(
      "already allocated",
    );
  }, 45_000);

  it("loads owner-scoped transient room listing detail cleanly and enforces building isolation and unlimited night stays", async () => {
    await configureOwnerSettings(state.ownerId);
    const { publishedRoom, boardingRoom, bedA } = await seedInventory(
      state.ownerId,
    );

    const listing = await getTransientRoomListingDetail(
      state.ownerId,
      publishedRoom.id,
    );
    expect(listing?.id).toBe(publishedRoom.id);

    expect(
      await getTransientRoomListingDetail(
        `${state.ownerId}-other`,
        publishedRoom.id,
      ),
    ).toBeNull();
    expect(
      await getTransientRoomListingDetail(state.ownerId, randomUUID()),
    ).toBeNull();

    // Boarding House rooms cannot be published or booked in Transient Building flows.
    await expect(
      updateRoomTransientPublish(state.ownerId, {
        roomId: boardingRoom.id,
        expectedVersion: boardingRoom.version,
        isTransientPublished: true,
        transientTitle: "Invalid Boarding Transient",
        transientScope: "WHOLE_ROOM",
        transientDailyRate: "700.00",
      }),
    ).rejects.toBeInstanceOf(PreconditionError);

    const guest = await createTransientGuest(state.ownerId, {
      fullName: "Extended Stay Guest",
      phone: "+63 917 999 0002",
    });

    await expect(
      createTransientReservation(state.ownerId, {
        guestId: guest.id,
        roomId: boardingRoom.id,
        bedId: null,
        scope: "WHOLE_ROOM",
        checkInDateManila: "2027-01-10",
        checkOutDateManila: "2027-01-12",
        partySize: 1,
      }),
    ).rejects.toBeInstanceOf(PreconditionError);

    // Extended >60-night transient stays (90 nights: 2027-01-01 -> 2027-04-01) succeed without an artificial cap.
    const ip = `203.0.113.${seq + 80}`;
    const longPublicRes = await postPublicBookingRequestRoute(
      new Request("http://localhost:3000/api/public/booking-requests", {
        method: "POST",
        headers: trackPublicHeaders(ip, {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          idempotencyKey: `pub-long-${randomUUID()}`,
          roomId: publishedRoom.id,
          scope: "BED",
          checkInDateManila: "2027-01-01",
          checkOutDateManila: "2027-04-01",
          partySize: 1,
          guestName: "Long Transient Visitor",
          guestPhone: "+63 917 777 8899",
          guestEmail: "long.visitor@example.com",
          notes: "Three-month transient project stay",
          privacyConsentAccepted: true,
        }),
      }),
    );
    expect(longPublicRes.status).toBe(201);

    const longOwnerStay = await createTransientReservation(state.ownerId, {
      guestId: guest.id,
      roomId: publishedRoom.id,
      bedId: bedA.id,
      scope: "BED",
      checkInDateManila: "2027-01-01",
      checkOutDateManila: "2027-04-01",
      partySize: 1,
    });
    expect(longOwnerStay.nights).toBe(90);
    expect(longOwnerStay.totalAmount).toBe("58500.00");
  });

  it("persists guest demographics, adults/children breakdown, and scopes single-room availability safely", async () => {
    await configureOwnerSettings(state.ownerId);
    const { publishedRoom, unpublishedRoom } = await seedInventory(
      state.ownerId,
    );

    const familyRoom = await createRoom(state.ownerId, {
      building: "TRANSIENT",
      title: "T-205",
      floor: "2F",
      capacity: 4,
      transientDailyRate: "1800.00",
    });
    await createBed(state.ownerId, {
      roomId: familyRoom.id,
      number: "F1",
      label: "Main Bed",
      dailyRate: "1800.00",
    });
    await updateRoomTransientPublish(state.ownerId, {
      roomId: familyRoom.id,
      expectedVersion: familyRoom.version,
      isTransientPublished: true,
      transientTitle: "Family Suite 205",
      transientDescription: "Spacious room with balcony",
      transientScope: "WHOLE_ROOM",
      transientDailyRate: "1800.00",
    });

    const singleRoomMatch = await getPublicPublishedRoomAvailability(
      state.ownerId,
      familyRoom.id,
      {
        checkInDateManila: "2027-02-10",
        checkOutDateManila: "2027-02-12",
        guests: 3,
      },
    );
    expect(singleRoomMatch).not.toBeNull();
    expect(singleRoomMatch?.room.roomId).toBe(familyRoom.id);
    expect(singleRoomMatch?.room.title).toBe("Family Suite 205");
    expect(singleRoomMatch?.room.isAvailableForRequestedStay).toBe(true);

    expect(
      await getPublicPublishedRoomAvailability(
        state.ownerId,
        unpublishedRoom.id,
        {
          checkInDateManila: "2027-02-10",
          checkOutDateManila: "2027-02-12",
          guests: 1,
        },
      ),
    ).toBeNull();

    expect(
      await getPublicPublishedRoomAvailability(
        state.ownerId,
        "not-a-valid-uuid",
        {
          checkInDateManila: "2027-02-10",
          checkOutDateManila: "2027-02-12",
          guests: 1,
        },
      ),
    ).toBeNull();

    expect(publishedRoom.id).toBeTruthy();

    const ip = `203.0.113.${seq + 95}`;
    const demographicPayload = {
      idempotencyKey: `pub-demo-${randomUUID()}`,
      roomId: familyRoom.id,
      scope: "WHOLE_ROOM",
      checkInDateManila: "2027-02-10",
      checkOutDateManila: "2027-02-12",
      partySize: 3,
      adultsCount: 2,
      childrenCount: 1,
      guestName: "Elena Mendoza",
      guestAge: 34,
      guestSex: "FEMALE",
      guestAddress: "Session Road, Baguio City",
      guestPhone: "+63 917 444 5566",
      guestEmail: "elena@example.com",
      notes: "Arriving late afternoon",
      privacyConsentAccepted: true,
    };

    const submitRes = await postPublicBookingRequestRoute(
      new Request("http://localhost:3000/api/public/booking-requests", {
        method: "POST",
        headers: trackPublicHeaders(ip, {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        }),
        body: JSON.stringify(demographicPayload),
      }),
    );
    expect(submitRes.status).toBe(201);
    const ack = (await submitRes.json()) as {
      id: string;
      guestAge: number | null;
      guestSex: string | null;
      guestAddress: string | null;
      adultsCount: number | null;
      childrenCount: number | null;
    };
    expect(ack.guestAge).toBe(34);
    expect(ack.guestSex).toBe("FEMALE");
    expect(ack.guestAddress).toBe("Session Road, Baguio City");
    expect(ack.adultsCount).toBe(2);
    expect(ack.childrenCount).toBe(1);

    const conflictAddressRes = await postPublicBookingRequestRoute(
      new Request("http://localhost:3000/api/public/booking-requests", {
        method: "POST",
        headers: trackPublicHeaders(ip, {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          ...demographicPayload,
          guestAddress: "Burnham Park, Baguio City",
        }),
      }),
    );
    expect(conflictAddressRes.status).toBe(409);

    const overviewBeforeApprove = await getTransientsOverview(state.ownerId);
    const storedRequest = overviewBeforeApprove.requests.find(
      (r) => r.id === ack.id,
    );
    expect(storedRequest).toMatchObject({
      guestAge: 34,
      guestSex: "FEMALE",
      guestAddress: "Session Road, Baguio City",
      adultsCount: 2,
      childrenCount: 1,
      partySize: 3,
    });

    const audits = await listAuditLogs(state.ownerId, { area: "transients" });
    const entry = audits.entries.find(
      (a) => a.action === "booking_request.submitted" && a.entityId === ack.id,
    );
    expect(entry).toBeDefined();
    const serializedEntry = JSON.stringify(entry);
    expect(serializedEntry).not.toContain("Elena Mendoza");
    expect(serializedEntry).not.toContain("Session Road, Baguio City");
    expect(serializedEntry).not.toContain("guestAge");
    expect(serializedEntry).not.toContain("guestSex");
    expect(serializedEntry).not.toContain("guestAddress");

    const approved = await approveBookingRequest(state.ownerId, {
      requestId: ack.id,
      expectedVersion: 1,
      confirmRateChange: false,
      issueInvoiceImmediately: false,
    });
    const overviewAfterApprove = await getTransientsOverview(state.ownerId);
    const createdGuest = overviewAfterApprove.guests.find(
      (g) => g.id === approved.reservation.guestId,
    );
    expect(createdGuest?.notes).toContain("Age: 34");
    expect(createdGuest?.notes).toContain("Sex: Female");
    expect(createdGuest?.notes).toContain("Address: Session Road, Baguio City");
  }, 60_000);
});
