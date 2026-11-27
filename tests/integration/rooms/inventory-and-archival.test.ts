import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
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
  getPrivateObject: async (key: string) => {
    const obj = state.storageObjects.get(key);
    if (!obj) return null;
    return { bytes: obj.bytes, contentType: obj.contentType };
  },
}));

import {
  ConflictError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "../../../src/lib/errors";
import {
  cancelAllocationInTx,
  createAllocationInTx,
} from "../../../src/features/allocations/service";
import {
  createRoomPhotoIntent,
  uploadRoomPhotoThroughProxy,
} from "../../../src/features/rooms/photos";
import {
  archiveBed,
  archiveRoom,
  createBed,
  createRoom,
  getRoomDetail,
  listInventoryOverview,
  restoreBed,
  restoreRoom,
  updateRoom,
} from "../../../src/features/rooms/service";
import { getPublicPublishedAvailability } from "../../../src/features/transients/public-service";
import { updateRoomTransientPublish } from "../../../src/features/transients/service";
import { GET as getRoomsRoute } from "../../../src/app/api/rooms/route";
import { GET as getOwnerRoomPhotoRoute } from "../../../src/app/api/rooms/photos/[photoId]/route";
import { GET as getPublicRoomPhotoRoute } from "../../../src/app/api/public/room-photos/[photoId]/route";

const prefix = `rooms-test-${randomUUID()}`;
let seq = 0;

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
    await db.securityRateLimit.deleteMany({
      where: { key: { startsWith: `room-photo-upload:${prefix}` } },
    });
    await db.auditLog.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.changeFeed.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.syncHead.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.roomPhoto.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.roomPhotoIntent.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.allocation.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.bed.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.room.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.businessSettings.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });

    expect(
      await db.roomPhoto.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.roomPhotoIntent.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.room.count({ where: { ownerUserId: { startsWith: prefix } } }),
    ).toBe(0);
    expect(
      await db.owner.count({ where: { id: { startsWith: prefix } } }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("rooms, beds, soft archival, and Owner isolation integration", () => {
  it("manages building-separated direct room pricing, filtered listing, and Owner isolation", async () => {
    state.authenticated = false;
    const unauthRes = await getRoomsRoute(
      new NextRequest("http://localhost:3000/api/rooms"),
    );
    expect(unauthRes.status).toBe(401);
    state.authenticated = true;

    const room = await createRoom(state.ownerId, {
      building: "BOARDING",
      title: "201",
      floor: "2nd",
      baseMonthlyRate: "5000",
      capacity: 1,
    });
    expect(room.baseMonthlyRate).toBe("5000.00");
    expect(room.transientDailyRate).toBeNull();

    // Identical room number is allowed in the separate Transient Building.
    const transientRoom = await createRoom(state.ownerId, {
      building: "TRANSIENT",
      title: "201",
      floor: "2nd",
      transientDailyRate: "750",
      capacity: 1,
    });
    expect(transientRoom.building).toBe("TRANSIENT");
    expect(transientRoom.transientDailyRate).toBe("750.00");
    expect(transientRoom.baseMonthlyRate).toBeNull();

    // Missing required rate per building is rejected cleanly.
    await expect(
      createRoom(state.ownerId, {
        building: "BOARDING",
        title: "299",
        capacity: 1,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const authRes = await getRoomsRoute(
      new NextRequest("http://localhost:3000/api/rooms?building=TRANSIENT"),
    );
    expect(authRes.status).toBe(200);
    const filteredBody = (await authRes.json()) as {
      rooms: Array<{ building: string }>;
    };
    expect(filteredBody.rooms).toHaveLength(1);
    expect(filteredBody.rooms[0]?.building).toBe("TRANSIENT");

    const overview = await listInventoryOverview(state.ownerId, {
      building: "BOARDING",
    });
    expect(overview.rooms).toHaveLength(1);
    expect(overview.rooms[0]?.baseMonthlyRate).toBe("5000.00");
  });

  it("enforces room/bed capacity, duplicate active numbers, version preconditions, and archival blockers", async () => {
    const db = state.db!;

    const room = await createRoom(state.ownerId, {
      title: "201",
      floor: "2nd",
      baseMonthlyRate: "5000",
      capacity: 1,
    });

    // Duplicate active room number (case-insensitive) fails with ConflictError.
    await expect(
      createRoom(state.ownerId, {
        title: "201",
        baseMonthlyRate: "5000",
        capacity: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const bed = await createBed(state.ownerId, {
      roomId: room.id,
      number: "A",
      monthlyRate: "5000",
    });

    // Exceeding capacity fails cleanly.
    await expect(
      createBed(state.ownerId, {
        roomId: room.id,
        number: "B",
        monthlyRate: "5000",
      }),
    ).rejects.toBeInstanceOf(PreconditionError);

    // Updating room & version precondition check.
    const bumped = await updateRoom(state.ownerId, {
      roomId: room.id,
      expectedVersion: room.version,
      title: "201",
      floor: "2nd",
      capacity: 2,
      baseMonthlyRate: "5200",
    });
    expect(bumped.version).toBe(2);
    expect(bumped.baseMonthlyRate).toBe("5200.00");

    await expect(
      updateRoom(state.ownerId, {
        roomId: room.id,
        expectedVersion: 1,
        title: "201",
        capacity: 2,
        baseMonthlyRate: "5300",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Upcoming booking blocks soft archival of BOTH Bed and parent Room.
    const now = new Date("2026-12-01T00:00:00.000Z");
    const futureStart = new Date("2026-12-10T00:00:00.000Z");
    const futureEnd = new Date("2026-12-20T00:00:00.000Z");

    const [alloc] = await db.$transaction((tx) =>
      createAllocationInTx(tx, {
        ownerUserId: state.ownerId,
        roomId: room.id,
        bedId: bed.id,
        scope: "BED",
        type: "TRANSIENT_RESERVATION",
        startDate: futureStart,
        endDate: futureEnd,
        asOfUtc: now,
      }),
    );

    await expect(
      archiveBed(
        state.ownerId,
        { bedId: bed.id, expectedVersion: bed.version },
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      archiveRoom(
        state.ownerId,
        { roomId: room.id, expectedVersion: bumped.version },
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    // Release upcoming allocation -> archival succeeds and emits tombstone feed entries.
    await db.$transaction((tx) =>
      cancelAllocationInTx(tx, {
        ownerUserId: state.ownerId,
        allocationId: alloc!.id,
        asOfUtc: now,
      }),
    );

    const archivedBed = await archiveBed(
      state.ownerId,
      { bedId: bed.id, expectedVersion: bed.version },
      now,
    );
    expect(archivedBed.archivedAt).not.toBeNull();
    expect(archivedBed.status).toBe("ARCHIVED");

    const archivedRoom = await archiveRoom(
      state.ownerId,
      { roomId: room.id, expectedVersion: bumped.version },
      now,
    );
    expect(archivedRoom.archivedAt).not.toBeNull();

    // Restoring room then bed makes inventory active again.
    const restoredRoom = await restoreRoom(state.ownerId, {
      roomId: room.id,
      expectedVersion: archivedRoom.version,
    });
    expect(restoredRoom.archivedAt).toBeNull();

    const restoredBed = await restoreBed(state.ownerId, {
      bedId: bed.id,
      expectedVersion: archivedBed.version,
    });
    expect(restoredBed.status).toBe("AVAILABLE");

    // Cross-Owner isolation on room update.
    await expect(
      updateRoom(`${prefix}-foreign`, {
        roomId: room.id,
        expectedVersion: restoredRoom.version,
        title: "999",
        capacity: 1,
        baseMonthlyRate: "100",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const overview = await listInventoryOverview(state.ownerId, {
      asOfUtc: now,
    });
    expect(overview.summary.activeRooms).toBe(1);
    expect(overview.summary.availableBeds).toBe(1);

    const tombstones = await db.changeFeed.findMany({
      where: { ownerUserId: state.ownerId, operation: "tombstone" },
      select: { entityType: true },
    });
    expect(tombstones.map((t) => t.entityType)).toEqual(
      expect.arrayContaining(["bed", "room"]),
    );
  });

  it("uploads preview + captioned gallery photos, enforces Owner & public visibility, and updates direct room rates", async () => {
    const db = state.db!;
    await db.owner.upsert({
      where: { id: state.ownerId },
      update: {},
      create: { id: state.ownerId },
    });
    await db.businessSettings.upsert({
      where: { ownerUserId: state.ownerId },
      update: {
        businessName: "Daisy Residence",
        checkInTimeManila: "14:00",
        checkOutTimeManila: "12:00",
      },
      create: {
        ownerUserId: state.ownerId,
        businessName: "Daisy Residence",
        checkInTimeManila: "14:00",
        checkOutTimeManila: "12:00",
      },
    });

    // Reject forged content pretending to be PNG.
    const fakePngBytes = new Uint8Array(
      Buffer.from("not-really-a-png-payload"),
    );
    const fakeIntent = await createRoomPhotoIntent({
      ownerUserId: state.ownerId,
      rawInput: {
        fileName: "forged.png",
        mimeType: "image/png",
        byteSize: fakePngBytes.byteLength,
        sha256: createHash("sha256").update(fakePngBytes).digest("hex"),
      },
    });
    await expect(
      uploadRoomPhotoThroughProxy({
        ownerUserId: state.ownerId,
        intentId: fakeIntent.intentId,
        contentType: "image/png",
        bytes: fakePngBytes,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    async function uploadSamplePng(fileName: string, fillByte: number) {
      const bytes = new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        fillByte,
        fillByte + 1,
        fillByte + 2,
      ]);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const intent = await createRoomPhotoIntent({
        ownerUserId: state.ownerId,
        rawInput: {
          fileName,
          mimeType: "image/png",
          byteSize: bytes.byteLength,
          sha256,
        },
      });
      await uploadRoomPhotoThroughProxy({
        ownerUserId: state.ownerId,
        intentId: intent.intentId,
        contentType: "image/png",
        bytes,
      });
      return { intentId: intent.intentId, bytes };
    }

    // Boarding House rooms reject photo upload intents and photo manifest attachments.
    const boardingRoom = await createRoom(state.ownerId, {
      building: "BOARDING",
      title: "B-101",
      baseMonthlyRate: "4500",
      capacity: 1,
    });
    const samplePngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 99,
    ]);
    await expect(
      createRoomPhotoIntent({
        ownerUserId: state.ownerId,
        rawInput: {
          roomId: boardingRoom.id,
          fileName: "boarding-forbidden.png",
          mimeType: "image/png",
          byteSize: samplePngBytes.byteLength,
          sha256: createHash("sha256").update(samplePngBytes).digest("hex"),
        },
      }),
    ).rejects.toBeInstanceOf(PreconditionError);

    const unboundIntent = await uploadSamplePng("unbound.png", 90);
    await expect(
      updateRoom(state.ownerId, {
        roomId: boardingRoom.id,
        expectedVersion: boardingRoom.version,
        title: "B-101",
        baseMonthlyRate: "4500",
        capacity: 1,
        photos: {
          preview: {
            kind: "intent",
            intentId: unboundIntent.intentId,
            caption: null,
          },
          gallery: [],
        },
      }),
    ).rejects.toBeInstanceOf(PreconditionError);

    const preview1 = await uploadSamplePng("preview-1.png", 10);
    const galleryUploads = await Promise.all(
      Array.from({ length: 10 }, (_, idx) =>
        uploadSamplePng(`shot-${idx + 1}.png`, 20 + idx),
      ),
    );

    const created = await createRoom(state.ownerId, {
      building: "TRANSIENT",
      title: "301",
      floor: "3rd Floor",
      transientDailyRate: "550",
      capacity: 1,
      photos: {
        preview: {
          kind: "intent",
          intentId: preview1.intentId,
          caption: null,
        },
        gallery: galleryUploads.map((upload, idx) => ({
          kind: "intent" as const,
          intentId: upload.intentId,
          caption:
            idx === 0
              ? "Morning light from balcony"
              : idx === 1
                ? "Private study desk"
                : `Gallery shot ${idx + 1}`,
        })),
      },
    });

    expect(created.baseMonthlyRate).toBeNull();
    expect(created.transientDailyRate).toBe("550.00");
    expect(created.previewPhoto?.fileName).toBe("preview-1.png");
    expect(created.galleryPhotos).toHaveLength(10);
    expect(created.galleryPhotos.slice(0, 2).map((p) => p.caption)).toEqual([
      "Morning light from balcony",
      "Private study desk",
    ]);

    // Ensure Room needs an active bed before public availability marks it open.
    await createBed(state.ownerId, {
      roomId: created.id,
      number: "301",
      dailyRate: "550.00",
    });

    // Unpublished room photos must return 404 on the public photo endpoint.
    const unpublishedPublicRes = await getPublicRoomPhotoRoute(
      new Request(
        `http://localhost:3000/api/public/room-photos/${created.previewPhoto!.id}`,
      ),
      { params: Promise.resolve({ photoId: created.previewPhoto!.id }) },
    );
    expect(unpublishedPublicRes.status).toBe(404);

    // Owner endpoint serves unpublished photos with private no-store headers, and blocks foreign Owners.
    const ownerRes = await getOwnerRoomPhotoRoute(
      new Request(
        `http://localhost:3000/api/rooms/photos/${created.previewPhoto!.id}`,
      ),
      { params: Promise.resolve({ photoId: created.previewPhoto!.id }) },
    );
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.headers.get("content-type")).toBe("image/png");
    expect(ownerRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await ownerRes.arrayBuffer())).toEqual(
      preview1.bytes,
    );

    const savedOwnerId = state.ownerId;
    state.ownerId = `${prefix}-foreign`;
    const foreignRes = await getOwnerRoomPhotoRoute(
      new Request(
        `http://localhost:3000/api/rooms/photos/${created.previewPhoto!.id}`,
      ),
      { params: Promise.resolve({ photoId: created.previewPhoto!.id }) },
    );
    expect(foreignRes.status).toBe(404);
    state.ownerId = savedOwnerId;

    // Replacing preview, reordering gallery, editing caption, and updating daily rate directly.
    const preview2 = await uploadSamplePng("preview-2.png", 40);
    const updated = await updateRoom(state.ownerId, {
      roomId: created.id,
      expectedVersion: created.version,
      building: "TRANSIENT",
      title: "301",
      floor: "3rd Floor",
      transientDailyRate: "900",
      capacity: 1,
      photos: {
        preview: {
          kind: "intent",
          intentId: preview2.intentId,
          caption: null,
        },
        gallery: [
          {
            kind: "existing",
            photoId: created.galleryPhotos[1]!.id,
            caption: "Dedicated desk and chair",
          },
          {
            kind: "existing",
            photoId: created.galleryPhotos[0]!.id,
            caption: "Updated morning view",
          },
        ],
      },
    });

    expect(updated.baseMonthlyRate).toBeNull();
    expect(updated.transientDailyRate).toBe("900.00");
    expect(updated.previewPhoto?.fileName).toBe("preview-2.png");
    expect(updated.galleryPhotos.map((p) => p.caption)).toEqual([
      "Dedicated desk and chair",
      "Updated morning view",
    ]);

    // Enforce unique PREVIEW partial constraint in DB: still only 1 preview row for the room.
    expect(
      await db.roomPhoto.count({
        where: {
          ownerUserId: state.ownerId,
          roomId: created.id,
          role: "PREVIEW",
        },
      }),
    ).toBe(1);

    // Publishing room exposes previewImageUrl + captioned galleryImages on /api/public/availability & public photo route.
    await updateRoomTransientPublish(state.ownerId, {
      roomId: created.id,
      expectedVersion: updated.version,
      isTransientPublished: true,
      transientTitle: "Room 301 Showcase",
      transientScope: "WHOLE_ROOM",
    });

    const availability = await getPublicPublishedAvailability(state.ownerId, {
      checkInDateManila: "2026-12-20",
      checkOutDateManila: "2026-12-22",
      guests: 1,
    });
    expect(availability.rooms).toHaveLength(1);
    const listedRoom = availability.rooms[0]!;
    expect(listedRoom.previewImageUrl).toContain(
      `/api/public/room-photos/${updated.previewPhoto!.id}`,
    );
    expect(listedRoom.galleryImages.map((img) => img.caption)).toEqual([
      "Dedicated desk and chair",
      "Updated morning view",
    ]);

    const publishedPhotoRes = await getPublicRoomPhotoRoute(
      new Request(
        `http://localhost:3000/api/public/room-photos/${updated.previewPhoto!.id}`,
      ),
      { params: Promise.resolve({ photoId: updated.previewPhoto!.id }) },
    );
    expect(publishedPhotoRes.status).toBe(200);
    expect(publishedPhotoRes.headers.get("cache-control")).toBe("no-store");
    expect(publishedPhotoRes.headers.get("x-content-type-options")).toBe(
      "nosniff",
    );
    expect(new Uint8Array(await publishedPhotoRes.arrayBuffer())).toEqual(
      preview2.bytes,
    );
  }, 45_000);

  it("loads owner-scoped room detail cleanly", async () => {
    const room = await createRoom(state.ownerId, {
      building: "BOARDING",
      title: "209",
      floor: "2nd Floor",
      capacity: 1,
      baseMonthlyRate: "5000.00",
      summary: null,
    });

    const detail = await getRoomDetail(state.ownerId, room.id);
    expect(detail?.id).toBe(room.id);
    expect(detail?.baseMonthlyRate).toBe("5000.00");

    expect(await getRoomDetail(`${state.ownerId}-other`, room.id)).toBeNull();
    expect(await getRoomDetail(state.ownerId, randomUUID())).toBeNull();
  });
});
