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
  archiveRoomType,
  createBed,
  createRoom,
  createRoomType,
  getRoomCreateContext,
  getRoomDetail,
  listInventoryOverview,
  restoreBed,
  restoreRoom,
  restoreRoomType,
  updateRoom,
  updateRoomType,
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
    await db.roomType.deleteMany({
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
      await db.roomType.count({
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

describe("rooms, beds, soft archival, and Owner isolation integration", () => {
  it("manages building-separated room type pricing inheritance, soft archival, restore, and Owner isolation", async () => {
    const db = state.db!;
    state.authenticated = false;
    const unauthRes = await getRoomsRoute(
      new NextRequest("http://localhost:3000/api/rooms"),
    );
    expect(unauthRes.status).toBe(401);
    state.authenticated = true;

    const singleType = await createRoomType(state.ownerId, {
      building: "BOARDING",
      name: "Single AC",
      monthlyRate: "5000",
      description: "Air-conditioned private room",
    });
    expect(singleType.building).toBe("BOARDING");
    expect(singleType.monthlyRate).toBe("5000.00");
    expect(singleType.dailyRate).toBeNull();

    // Transient Building room type uses daily rate only and supports same name across buildings.
    const transientSuiteType = await createRoomType(state.ownerId, {
      building: "TRANSIENT",
      name: "Single AC",
      dailyRate: "750",
    });
    expect(transientSuiteType.building).toBe("TRANSIENT");
    expect(transientSuiteType.monthlyRate).toBeNull();
    expect(transientSuiteType.dailyRate).toBe("750.00");

    // Duplicate active room type name in same building (case-insensitive) fails with ConflictError.
    await expect(
      createRoomType(state.ownerId, {
        building: "BOARDING",
        name: "single ac",
        monthlyRate: "5100",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const doubleType = await createRoomType(state.ownerId, {
      building: "BOARDING",
      name: "Double Fan",
      monthlyRate: "5200",
    });

    // Creating a room without explicit rates inherits the selected room type's pricing.
    const room = await createRoom(state.ownerId, {
      building: "BOARDING",
      number: "201",
      floor: "2nd",
      roomTypeId: singleType.id,
      capacity: 1,
    });
    expect(room.baseMonthlyRate).toBe("5000.00");
    expect(room.transientDailyRate).toBeNull();
    expect(room.roomTypeName).toBe("Single AC");

    // Identical room number is allowed in the separate Transient Building.
    const transientRoom = await createRoom(state.ownerId, {
      building: "TRANSIENT",
      number: "201",
      floor: "2nd",
      roomTypeId: transientSuiteType.id,
      capacity: 1,
    });
    expect(transientRoom.building).toBe("TRANSIENT");
    expect(transientRoom.transientDailyRate).toBe("750.00");
    expect(transientRoom.baseMonthlyRate).toBeNull();

    // Cross-building roomTypeId on createRoom is rejected cleanly.
    await expect(
      createRoom(state.ownerId, {
        building: "BOARDING",
        number: "299",
        roomTypeId: transientSuiteType.id,
        capacity: 1,
      }),
    ).rejects.toBeInstanceOf(PreconditionError);

    // RoomType update, soft archival blocking new rooms, and restore.
    const updatedSingleType = await updateRoomType(state.ownerId, {
      roomTypeId: singleType.id,
      expectedVersion: singleType.version,
      building: "BOARDING",
      name: "Single AC+",
      monthlyRate: "5500",
    });
    expect(updatedSingleType.version).toBe(2);

    const archivedSingleType = await archiveRoomType(
      state.ownerId,
      {
        roomTypeId: updatedSingleType.id,
        expectedVersion: updatedSingleType.version,
      },
      new Date("2026-12-01T00:00:00.000Z"),
    );
    expect(archivedSingleType.archivedAt).not.toBeNull();

    await expect(
      createRoom(state.ownerId, {
        building: "BOARDING",
        number: "202",
        roomTypeId: archivedSingleType.id,
        capacity: 1,
      }),
    ).rejects.toBeInstanceOf(PreconditionError);

    const restoredSingleType = await restoreRoomType(state.ownerId, {
      roomTypeId: archivedSingleType.id,
      expectedVersion: archivedSingleType.version,
    });
    expect(restoredSingleType.archivedAt).toBeNull();

    // Cross-Owner isolation and authenticated filtered read routes.
    await expect(
      updateRoomType(`${prefix}-foreign`, {
        roomTypeId: restoredSingleType.id,
        expectedVersion: restoredSingleType.version,
        name: "Hacked",
        monthlyRate: "100",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

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
    expect(overview.roomTypes.length).toBe(2);
    expect(doubleType.monthlyRate).toBe("5200.00");

    const tombstones = await db.changeFeed.findMany({
      where: { ownerUserId: state.ownerId, operation: "tombstone" },
      select: { entityType: true },
    });
    expect(tombstones.map((t) => t.entityType)).toContain("room_type");
  });

  it("enforces room/bed capacity, duplicate active numbers, version preconditions, and archival blockers", async () => {
    const db = state.db!;
    const singleType = await createRoomType(state.ownerId, {
      building: "BOARDING",
      name: "Single AC",
      monthlyRate: "5000",
    });
    const doubleType = await createRoomType(state.ownerId, {
      building: "BOARDING",
      name: "Double Fan",
      monthlyRate: "5200",
    });

    const room = await createRoom(state.ownerId, {
      number: "201",
      floor: "2nd",
      roomTypeId: singleType.id,
      capacity: 1,
    });

    // Duplicate active room number (case-insensitive) fails with ConflictError.
    await expect(
      createRoom(state.ownerId, {
        number: "201",
        roomTypeId: singleType.id,
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
      number: "201",
      floor: "2nd",
      roomTypeId: doubleType.id,
      capacity: 2,
      baseMonthlyRate: "5200",
    });
    expect(bumped.version).toBe(2);
    expect(bumped.roomTypeName).toBe("Double Fan");

    await expect(
      updateRoom(state.ownerId, {
        roomId: room.id,
        expectedVersion: 1,
        number: "201",
        roomTypeId: doubleType.id,
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
        number: "999",
        roomTypeId: singleType.id,
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

  it("uploads preview + captioned gallery photos, enforces Owner & public visibility, and inherits omitted update rates", async () => {
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

    const singleType = await createRoomType(state.ownerId, {
      building: "TRANSIENT",
      name: "Standard Single",
      dailyRate: "550",
    });
    const studioType = await createRoomType(state.ownerId, {
      building: "TRANSIENT",
      name: "Deluxe Studio",
      dailyRate: "900",
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

    const preview1 = await uploadSamplePng("preview-1.png", 10);
    const shot1 = await uploadSamplePng("shot-1.png", 20);
    const shot2 = await uploadSamplePng("shot-2.png", 30);

    const created = await createRoom(state.ownerId, {
      building: "TRANSIENT",
      number: "301",
      floor: "3rd Floor",
      roomTypeId: singleType.id,
      capacity: 1,
      photos: {
        preview: {
          kind: "intent",
          intentId: preview1.intentId,
          caption: null,
        },
        gallery: [
          {
            kind: "intent",
            intentId: shot1.intentId,
            caption: "Morning light from balcony",
          },
          {
            kind: "intent",
            intentId: shot2.intentId,
            caption: "Private study desk",
          },
        ],
      },
    });

    expect(created.baseMonthlyRate).toBeNull();
    expect(created.transientDailyRate).toBe("550.00");
    expect(created.previewPhoto?.fileName).toBe("preview-1.png");
    expect(created.galleryPhotos.map((p) => p.caption)).toEqual([
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

    // Replacing preview, reordering gallery, editing caption, AND omitting rate fields inherits studioType rates.
    const preview2 = await uploadSamplePng("preview-2.png", 40);
    const updated = await updateRoom(state.ownerId, {
      roomId: created.id,
      expectedVersion: created.version,
      building: "TRANSIENT",
      number: "301",
      floor: "3rd Floor",
      roomTypeId: studioType.id,
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
  }, 30_000);

  it("loads room create-context and owner-scoped room detail cleanly", async () => {
    const roomType = await createRoomType(state.ownerId, {
      building: "BOARDING",
      name: "Standard Solo",
      monthlyRate: "5000.00",
      description: null,
    });
    const room = await createRoom(state.ownerId, {
      building: "BOARDING",
      number: "209",
      floor: "2nd Floor",
      roomTypeId: roomType.id,
      capacity: 1,
      baseMonthlyRate: "5000.00",
      notes: null,
    });

    const createContext = await getRoomCreateContext(state.ownerId);
    expect(
      createContext.activeRoomTypes.some((rt) => rt.id === roomType.id),
    ).toBe(true);

    const detail = await getRoomDetail(state.ownerId, room.id);
    expect(detail?.room.id).toBe(room.id);
    expect(detail?.roomTypes.some((rt) => rt.id === roomType.id)).toBe(true);

    expect(await getRoomDetail(`${state.ownerId}-other`, room.id)).toBeNull();
    expect(await getRoomDetail(state.ownerId, randomUUID())).toBeNull();
  });
});
