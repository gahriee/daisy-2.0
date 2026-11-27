import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../../src/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as PrismaClient | undefined,
  authenticated: true,
  ownerId: "",
  storageObjects: new Map<
    string,
    { byteSize: number; contentType: string; bytes: Uint8Array }
  >(),
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
vi.mock("@/server/storage/client", () => ({
  ASSETS_BUCKET: "assets",
  signPrivateUpload: async (params: { key: string }) =>
    `https://storage.example.test/upload/${encodeURIComponent(params.key)}`,
  putPrivateObject: async (params: {
    key: string;
    contentType: string;
    body: Uint8Array;
  }) => {
    state.storageObjects.set(params.key, {
      byteSize: params.body.byteLength,
      contentType: params.contentType,
      bytes: params.body,
    });
    return { byteSize: params.body.byteLength };
  },
  headPrivateObject: async (key: string) => {
    const obj = state.storageObjects.get(key);
    if (!obj) return null;
    return { contentLength: obj.byteSize, contentType: obj.contentType };
  },
  signPrivateDownload: async (key: string) =>
    `https://storage.example.test/download/${encodeURIComponent(key)}?sig=ok`,
}));

import {
  AllocationConflictError,
  ConflictError,
  PreconditionError,
  ValidationError,
} from "../../../src/lib/errors";
import { listAuditLogs } from "../../../src/features/audit/service";
import { registerOwnerDevice } from "../../../src/server/auth/device";
import { listOwnerNotifications } from "../../../src/server/notifications/service";
import { createBed, createRoom } from "../../../src/features/rooms/service";
import { updateBusinessSettingsModule } from "../../../src/features/settings/service";
import {
  createTransientGuest,
  createTransientReservation,
} from "../../../src/features/transients/service";
import {
  addMaintenanceUpdate,
  createMaintenanceRequest,
  getMaintenanceCreateContext,
  getMaintenanceOverview,
  getMaintenanceRequestDetail,
  placeMaintenanceHold,
  releaseMaintenanceHold,
} from "../../../src/features/maintenance/service";
import { applyMaintenanceSyncOperation } from "../../../src/features/maintenance/sync-handler";
import { GET as getMaintenanceRoute } from "../../../src/app/api/maintenance/route";
import { POST as createMaintenanceIntentRoute } from "../../../src/app/api/maintenance/attachments/intent/route";
import { PUT as uploadMaintenanceIntentRoute } from "../../../src/app/api/maintenance/attachments/intents/[intentId]/route";
import { GET as downloadMaintenanceAttachmentRoute } from "../../../src/app/api/maintenance/attachments/[attachmentId]/download/route";

const prefix = `maint-test-${randomUUID()}`;
let seq = 0;

async function configureOwnerSettings(ownerId: string) {
  vi.stubEnv("BILLING_DAY_OF_MONTH", "5");
  vi.stubEnv("BILLING_GRACE_PERIOD_DAYS", "5");
  vi.stubEnv("BILLING_PRORATION_POLICY", "DAILY_EXACT");
  vi.stubEnv("BILLING_DEPOSIT_POLICY", "HOLD_SEPARATE");
  vi.stubEnv("BILLING_OVERPAYMENT_POLICY", "REJECT_OVERPAYMENT");
  vi.stubEnv("INVOICE_PREFIX", "INV");
  vi.stubEnv("RECEIPT_PREFIX", "OR");
  vi.stubEnv("PROOF_MAX_MB", "5");
  vi.stubEnv("PROOF_MAX_FILES_PER_RECORD", "5");
  await updateBusinessSettingsModule(ownerId, {
    module: "property",
    expectedVersion: 0,
    businessName: "Daisy Maintenance Property",
    businessPhone: null,
    businessAddress: null,
    tin: null,
    checkInTimeManila: "14:00",
    checkOutTimeManila: "12:00",
    smsOverdueEnabled: false,
    smsOverdueSendTimeManila: "09:00",
  });
}

async function seedRoomWithBeds(
  ownerId: string,
  roomNumber: string,
  bedNumbers: string[],
) {
  const room = await createRoom(ownerId, {
    building: "TRANSIENT",
    title: roomNumber,
    capacity: bedNumbers.length,
    transientDailyRate: "750.00",
  });
  const beds = [];
  for (const num of bedNumbers) {
    beds.push(
      await createBed(ownerId, {
        roomId: room.id,
        number: num,
        monthlyRate: null,
        dailyRate: "750.00",
      }),
    );
  }
  return { room, beds };
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
  state.storageObjects.clear();
  vi.stubEnv("OWNER_USER_ID", state.ownerId);
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  const db = state.db;
  if (!db) return;
  try {
    await db.securityRateLimit.deleteMany({
      where: { key: { startsWith: `maintenance-upload:${prefix}` } },
    });
    await db.notificationRead.deleteMany({
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
    await db.maintenanceAttachment.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.maintenanceAttachmentIntent.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.maintenanceUpdate.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.allocation.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.transientReservation.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.transientGuest.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.maintenanceRequest.deleteMany({
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
    await db.securityEvent.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.businessSettings.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });

    expect(
      await db.maintenanceRequest.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.allocation.count({
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

describe("maintenance requests, attachment relay, bed holds, urgent alerts & offline sync integration", () => {
  it("enforces authentication and supports S3 attachment upload intents, SHA-256 verification, and 60s signed downloads", async () => {
    state.authenticated = false;
    const unauthList = await getMaintenanceRoute();
    expect(unauthList.status).toBe(401);

    const unauthIntent = await createMaintenanceIntentRoute(
      new Request("http://localhost:3000/api/maintenance/attachments/intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(unauthIntent.status).toBe(401);

    state.authenticated = true;
    await configureOwnerSettings(state.ownerId);
    const { room, beds } = await seedRoomWithBeds(state.ownerId, "201", [
      "A",
      "B",
    ]);

    const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    const sha256 = createHash("sha256").update(photoBytes).digest("hex");
    const opId = randomUUID();

    // First intent creation returns 201.
    const intentRes = await createMaintenanceIntentRoute(
      new Request("http://localhost:3000/api/maintenance/attachments/intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          fileName: "shower-leak.jpg",
          mimeType: "image/jpeg",
          byteSize: photoBytes.byteLength,
          sha256,
          opId,
          clientFileId: "photo-1",
        }),
      }),
    );
    expect(intentRes.status).toBe(201);
    const intentBody = (await intentRes.json()) as {
      intentId: string;
      reused: boolean;
      uploadUrl: string;
    };
    expect(intentBody.reused).toBe(false);

    // Repeating with the same (opId, clientFileId) reuses the intent idempotently (200).
    const reusedRes = await createMaintenanceIntentRoute(
      new Request("http://localhost:3000/api/maintenance/attachments/intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          fileName: "shower-leak.jpg",
          mimeType: "image/jpeg",
          byteSize: photoBytes.byteLength,
          sha256,
          opId,
          clientFileId: "photo-1",
        }),
      }),
    );
    expect(reusedRes.status).toBe(200);
    const reusedBody = (await reusedRes.json()) as {
      intentId: string;
      reused: boolean;
    };
    expect(reusedBody.intentId).toBe(intentBody.intentId);
    expect(reusedBody.reused).toBe(true);

    // Reusing the same key with a different checksum returns 409 conflict.
    const mismatchIntentRes = await createMaintenanceIntentRoute(
      new Request("http://localhost:3000/api/maintenance/attachments/intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          fileName: "shower-leak.jpg",
          mimeType: "image/jpeg",
          byteSize: photoBytes.byteLength,
          sha256: "b".repeat(64),
          opId,
          clientFileId: "photo-1",
        }),
      }),
    );
    expect(mismatchIntentRes.status).toBe(409);

    // Relay PUT with wrong digest rejects before uploading to storage.
    const tamperedBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);
    const badPut = await uploadMaintenanceIntentRoute(
      new Request(`http://localhost:3000${intentBody.uploadUrl}`, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
          Origin: "http://localhost:3000",
        },
        body: tamperedBytes,
      }),
      { params: Promise.resolve({ intentId: intentBody.intentId }) },
    );
    expect(badPut.status).toBe(400);

    // Relay PUT with matching bytes succeeds and stores in private storage.
    const goodPut = await uploadMaintenanceIntentRoute(
      new Request(`http://localhost:3000${intentBody.uploadUrl}`, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
          Origin: "http://localhost:3000",
        },
        body: photoBytes,
      }),
      { params: Promise.resolve({ intentId: intentBody.intentId }) },
    );
    expect(goodPut.status).toBe(200);

    const request = await createMaintenanceRequest(state.ownerId, {
      roomId: room.id,
      bedId: beds[0]!.id,
      title: "Leaking faucet",
      description: "Steady drip from bathroom sink valve.",
      category: "PLUMBING",
      priority: "URGENT",
      attachmentIntentIds: [intentBody.intentId],
    });
    expect(request.attachments).toHaveLength(1);
    expect(request.updates).toHaveLength(0);

    const attachmentId = request.attachments[0]!.id;
    const downloadJsonRes = await downloadMaintenanceAttachmentRoute(
      new Request(
        `http://localhost:3000/api/maintenance/attachments/${attachmentId}/download?format=json`,
      ),
      { params: Promise.resolve({ attachmentId }) },
    );
    expect(downloadJsonRes.status).toBe(200);
    expect(downloadJsonRes.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    const dlBody = (await downloadJsonRes.json()) as {
      downloadUrl: string;
      expiresInSeconds: number;
    };
    expect(dlBody.expiresInSeconds).toBe(60);
    expect(dlBody.downloadUrl).toContain(
      "https://storage.example.test/download/",
    );

    const redirectRes = await downloadMaintenanceAttachmentRoute(
      new Request(
        `http://localhost:3000/api/maintenance/attachments/${attachmentId}/download`,
      ),
      { params: Promise.resolve({ attachmentId }) },
    );
    expect(redirectRes.status).toBe(307);

    // Urgent maintenance projects PII-free notification pointing to /maintenance?requestId=...
    const alerts = await listOwnerNotifications(state.ownerId);
    const urgentAlert = alerts.find(
      (n) => n.key === `maintenance:urgent:${request.id}`,
    );
    expect(urgentAlert).toBeDefined();
    expect(urgentAlert?.destination).toBe(
      `/maintenance?requestId=${request.id}`,
    );
    expect(urgentAlert?.message).toContain("Room 201");
    expect(urgentAlert?.message).toContain("Bed A");
    expect(urgentAlert?.message).not.toContain("Steady drip");

    const overviewRes = await getMaintenanceRoute();
    expect(overviewRes.status).toBe(200);
    const overview = await getMaintenanceOverview(state.ownerId);
    expect(overview.totals.urgentOpenCount).toBe(1);
  });

  it(
    "enforces unified allocation holds, blocks conflicting transient bookings, rejects holding occupied beds, and auto-releases on resolution",
    { timeout: 45_000 },
    async () => {
      const db = state.db!;
      await configureOwnerSettings(state.ownerId);
      const { room, beds } = await seedRoomWithBeds(state.ownerId, "202", [
        "A",
        "B",
      ]);

      const guest = await createTransientGuest(state.ownerId, {
        fullName: "Carlos Mendoza",
        phone: "+63 917 555 0199",
        email: null,
        notes: null,
      });

      // Reserve Bed B from Dec 10 to Dec 15.
      await createTransientReservation(state.ownerId, {
        guestId: guest.id,
        roomId: room.id,
        bedId: beds[1]!.id,
        scope: "BED",
        checkInDateManila: "2026-12-10",
        checkOutDateManila: "2026-12-15",
        partySize: 1,
        tentative: false,
        issueInvoiceImmediately: false,
      });

      const req = await createMaintenanceRequest(state.ownerId, {
        roomId: room.id,
        bedId: beds[0]!.id,
        title: "Bed frame weld repair",
        description: "Frame creaks heavily and needs welding.",
        category: "STRUCTURAL",
        priority: "URGENT",
        attachmentIntentIds: [],
      });

      // Attempting a WHOLE_ROOM hold overlapping Bed B's reservation must fail with AllocationConflictError.
      await expect(
        placeMaintenanceHold(state.ownerId, {
          requestId: req.id,
          expectedVersion: req.version,
          scope: "WHOLE_ROOM",
          bedId: null,
          startDateManila: "2026-12-11",
          endDateManila: "2026-12-13",
          notes: "Welding fumes",
        }),
      ).rejects.toBeInstanceOf(AllocationConflictError);

      // Placing a per-bed hold on Bed A succeeds and sets Bed A status -> MAINTENANCE when active today or starts today.
      const todayManila = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const afterTomorrow = (() => {
        const [y, m, d] = todayManila.split("-").map(Number);
        const dt = new Date(Date.UTC(y!, m! - 1, d! + 3));
        return dt.toISOString().slice(0, 10);
      })();
      const tomorrow = (() => {
        const [y, m, d] = todayManila.split("-").map(Number);
        const dt = new Date(Date.UTC(y!, m! - 1, d! + 1));
        return dt.toISOString().slice(0, 10);
      })();

      const withHold = await placeMaintenanceHold(state.ownerId, {
        requestId: req.id,
        expectedVersion: req.version,
        scope: "BED",
        bedId: beds[0]!.id,
        startDateManila: todayManila,
        endDateManila: afterTomorrow,
        notes: "Disassembled frame",
      });
      expect(withHold.activeHolds).toHaveLength(1);

      const bedAAfterHold = await db.bed.findUniqueOrThrow({
        where: { id: beds[0]!.id },
        select: { status: true },
      });
      expect(bedAAfterHold.status).toBe("MAINTENANCE");

      // Immediate active hold puts Bed A into MAINTENANCE, rejecting transient reservations immediately.
      await expect(
        createTransientReservation(state.ownerId, {
          guestId: guest.id,
          roomId: room.id,
          bedId: beds[0]!.id,
          scope: "BED",
          checkInDateManila: todayManila,
          checkOutDateManila: tomorrow,
          partySize: 1,
          tentative: false,
          issueInvoiceImmediately: false,
        }),
      ).rejects.toBeInstanceOf(PreconditionError);

      // Resolving the maintenance request automatically releases the hold and restores Bed A to AVAILABLE.
      const resolved = await addMaintenanceUpdate(state.ownerId, {
        requestId: req.id,
        expectedVersion: withHold.version,
        statusTo: "RESOLVED",
        note: "Weld reinforced and inspected.",
        attachmentIntentIds: [],
      });
      expect(resolved.status).toBe("RESOLVED");
      expect(resolved.activeHolds).toHaveLength(0);

      const bedAAfterResolve = await db.bed.findUniqueOrThrow({
        where: { id: beds[0]!.id },
        select: { status: true },
      });
      expect(bedAAfterResolve.status).toBe("AVAILABLE");

      // A future scheduled hold keeps Bed A AVAILABLE now while blocking overlapping stays via AllocationConflictError.
      const reqFuture = await createMaintenanceRequest(state.ownerId, {
        roomId: room.id,
        bedId: beds[0]!.id,
        title: "Scheduled deep clean",
        description: "Planned aircon chemical wash.",
        category: "CLEANING",
        priority: "MEDIUM",
        attachmentIntentIds: [],
      });
      const reqFutureHeld = await placeMaintenanceHold(state.ownerId, {
        requestId: reqFuture.id,
        expectedVersion: reqFuture.version,
        scope: "BED",
        bedId: beds[0]!.id,
        startDateManila: "2027-02-10",
        endDateManila: "2027-02-14",
      });
      await expect(
        createTransientReservation(state.ownerId, {
          guestId: guest.id,
          roomId: room.id,
          bedId: beds[0]!.id,
          scope: "BED",
          checkInDateManila: "2027-02-11",
          checkOutDateManila: "2027-02-13",
          partySize: 1,
          tentative: false,
          issueInvoiceImmediately: false,
        }),
      ).rejects.toBeInstanceOf(AllocationConflictError);

      const reqFutureReleased = await releaseMaintenanceHold(state.ownerId, {
        requestId: reqFuture.id,
        expectedVersion: reqFutureHeld.version,
        action: "COMPLETE",
      });
      expect(reqFutureReleased.activeHolds).toHaveLength(0);

      // Urgent alert is cleared once request is resolved.
      const alertsAfterResolve = await listOwnerNotifications(state.ownerId);
      expect(
        alertsAfterResolve.some(
          (n) => n.key === `maintenance:urgent:${req.id}`,
        ),
      ).toBe(false);

      // Explicit release check as well on a second hold cycle.
      const req2 = await createMaintenanceRequest(state.ownerId, {
        roomId: room.id,
        bedId: beds[0]!.id,
        title: "Paint touch-up",
        description: "Repaint headboard wall.",
        category: "OTHER",
        priority: "LOW",
        attachmentIntentIds: [],
      });
      const req2Held = await placeMaintenanceHold(state.ownerId, {
        requestId: req2.id,
        expectedVersion: req2.version,
        scope: "BED",
        bedId: beds[0]!.id,
        startDateManila: todayManila,
        endDateManila: afterTomorrow,
      });
      const req2Released = await releaseMaintenanceHold(state.ownerId, {
        requestId: req2.id,
        expectedVersion: req2Held.version,
        action: "COMPLETE",
      });
      expect(req2Released.activeHolds).toHaveLength(0);
    },
  );

  it("replays offline queued maintenance operations idempotently and converts stale versions into conflicts", async () => {
    await configureOwnerSettings(state.ownerId);
    const { room, beds } = await seedRoomWithBeds(state.ownerId, "203", ["A"]);
    const device = await registerOwnerDevice({
      ownerUserId: state.ownerId,
      label: "Owner Tablet",
    });
    const token = device.rawToken!;

    // Upload a queued photo attached to opId1 + clientFileId.
    const opIdCreate = randomUUID();
    const requestId = randomUUID();
    const imgBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const sha256 = createHash("sha256").update(imgBytes).digest("hex");

    const intentRes = await createMaintenanceIntentRoute(
      new Request("http://localhost:3000/api/maintenance/attachments/intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          fileName: "breaker.png",
          mimeType: "image/png",
          byteSize: imgBytes.byteLength,
          sha256,
          opId: opIdCreate,
          clientFileId: "offline-photo-1",
        }),
      }),
    );
    const intent = (await intentRes.json()) as {
      intentId: string;
      uploadUrl: string;
    };
    await uploadMaintenanceIntentRoute(
      new Request(`http://localhost:3000${intent.uploadUrl}`, {
        method: "PUT",
        headers: {
          "Content-Type": "image/png",
          Origin: "http://localhost:3000",
        },
        body: imgBytes,
      }),
      { params: Promise.resolve({ intentId: intent.intentId }) },
    );

    const createOp = {
      protocolVersion: 1,
      opId: opIdCreate,
      deviceId: device.deviceId,
      localSequence: 1,
      type: "maintenance.create",
      entityId: requestId,
      baseVersion: 0,
      dependsOn: [],
      occurredAt: "2026-11-14T02:00:00.000Z",
      payload: {
        roomId: room.id,
        bedId: beds[0]!.id,
        title: "Tripping breaker",
        description: "Branch breaker trips under water heater load.",
        category: "ELECTRICAL",
        priority: "HIGH",
        attachmentIntentIds: [intent.intentId],
      },
    };

    const applied = await applyMaintenanceSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken: token,
      rawOperation: createOp,
    });
    expect(applied.status).toBe("applied");
    expect(applied.resultingVersion).toBe(1);
    expect(applied.request?.attachments).toHaveLength(1);

    // Replaying identical opId returns "duplicate" safely without duplicating records.
    const dup = await applyMaintenanceSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken: token,
      rawOperation: createOp,
    });
    expect(dup.status).toBe("duplicate");
    expect(dup.resultingVersion).toBe(1);

    // Concurrent online edit bumps version to 2.
    const onlineUpdated = await addMaintenanceUpdate(state.ownerId, {
      requestId,
      expectedVersion: 1,
      statusTo: "IN_PROGRESS",
      note: "Electrician on site.",
      attachmentIntentIds: [],
    });
    expect(onlineUpdated.version).toBe(2);

    // Stale offline update referencing baseVersion 1 produces "conflict" ("Needs attention").
    const staleUpdate = await applyMaintenanceSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken: token,
      rawOperation: {
        protocolVersion: 1,
        opId: randomUUID(),
        deviceId: device.deviceId,
        localSequence: 2,
        type: "maintenance.update",
        entityId: requestId,
        baseVersion: 1,
        dependsOn: [],
        occurredAt: "2026-11-14T02:10:00.000Z",
        payload: {
          expectedVersion: 1,
          statusTo: "WAITING_PARTS",
          note: "Queued offline while out of signal.",
          attachmentIntentIds: [],
        },
      },
    });
    expect(staleUpdate.status).toBe("conflict");

    // Audit entries are identifier-only.
    const audit = await listAuditLogs(state.ownerId, { area: "maintenance" });
    expect(audit.entries.length).toBeGreaterThanOrEqual(2);
    const serializedAudit = JSON.stringify(audit.entries);
    expect(serializedAudit).not.toContain("Tripping breaker");
    expect(serializedAudit).not.toContain("Electrician on site.");
    expect(serializedAudit).not.toContain("Queued offline");

    // Ensure non-empty upload rejection behaves cleanly as ValidationError in intent service too.
    await expect(
      addMaintenanceUpdate(state.ownerId, {
        requestId,
        expectedVersion: 2,
        statusTo: "",
        note: "",
        attachmentIntentIds: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Ensure stale version throws ConflictError on direct online action.
    await expect(
      addMaintenanceUpdate(state.ownerId, {
        requestId,
        expectedVersion: 1,
        statusTo: "RESOLVED",
        note: "Stale client",
        attachmentIntentIds: [],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("loads maintenance create-context and owner-scoped request detail cleanly", async () => {
    await configureOwnerSettings(state.ownerId);
    const room = await createRoom(state.ownerId, {
      building: "BOARDING",
      title: "M-99",
      floor: "1st Floor",
      capacity: 1,
      baseMonthlyRate: "5000.00",
      transientDailyRate: null,
      summary: null,
    });

    const context = await getMaintenanceCreateContext(state.ownerId);
    expect(
      context.rooms.some((r) => r.id === room.id && r.building === "BOARDING"),
    ).toBe(true);
    expect(context.proofMaxMb).toBe(5);
    expect(context.proofMaxFilesPerRecord).toBe(5);

    const request = await createMaintenanceRequest(state.ownerId, {
      roomId: room.id,
      bedId: null,
      title: "Sink trap drip",
      description: "Minor drip under lavatory",
      category: "PLUMBING",
      priority: "LOW",
      attachmentIntentIds: [],
    });

    const detail = await getMaintenanceRequestDetail(state.ownerId, request.id);
    expect(detail?.request.id).toBe(request.id);
    expect(detail?.proofMaxFilesPerRecord).toBe(5);

    expect(
      await getMaintenanceRequestDetail(`${state.ownerId}-other`, request.id),
    ).toBeNull();
    expect(
      await getMaintenanceRequestDetail(state.ownerId, randomUUID()),
    ).toBeNull();
  });
});
