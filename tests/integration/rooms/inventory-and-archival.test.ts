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
  ConflictError,
  NotFoundError,
  PreconditionError,
} from "../../../src/lib/errors";
import {
  cancelAllocationInTx,
  createAllocationInTx,
} from "../../../src/features/allocations/service";
import {
  archiveBed,
  archiveRoom,
  archiveRoomType,
  createBed,
  createRoom,
  createRoomType,
  listInventoryOverview,
  restoreBed,
  restoreRoom,
  restoreRoomType,
  updateRoom,
  updateRoomType,
} from "../../../src/features/rooms/service";
import { GET as getRoomsRoute } from "../../../src/app/api/rooms/route";

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
    await db.auditLog.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.changeFeed.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.syncHead.deleteMany({
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
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });

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
  it("manages room type pricing inheritance, soft archival, restore, and Owner isolation", async () => {
    const db = state.db!;
    state.authenticated = false;
    const unauthRes = await getRoomsRoute();
    expect(unauthRes.status).toBe(401);
    state.authenticated = true;

    const singleType = await createRoomType(state.ownerId, {
      name: "Single AC",
      monthlyRate: "5000",
      dailyRate: "750",
      description: "Air-conditioned private room",
    });
    expect(singleType.monthlyRate).toBe("5000.00");
    expect(singleType.dailyRate).toBe("750.00");

    // Duplicate active room type name (case-insensitive) fails with ConflictError.
    await expect(
      createRoomType(state.ownerId, {
        name: "single ac",
        monthlyRate: "5100",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const doubleType = await createRoomType(state.ownerId, {
      name: "Double Fan",
      monthlyRate: "5200",
    });

    // Creating a room without explicit rates inherits the selected room type's pricing.
    const room = await createRoom(state.ownerId, {
      number: "201",
      floor: "2nd",
      roomTypeId: singleType.id,
      capacity: 1,
    });
    expect(room.baseMonthlyRate).toBe("5000.00");
    expect(room.transientDailyRate).toBe("750.00");
    expect(room.roomTypeName).toBe("Single AC");

    // RoomType update, soft archival blocking new rooms, and restore.
    const updatedSingleType = await updateRoomType(state.ownerId, {
      roomTypeId: singleType.id,
      expectedVersion: singleType.version,
      name: "Single AC+",
      monthlyRate: "5500",
      dailyRate: "800",
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

    // Cross-Owner isolation and authenticated read route.
    await expect(
      updateRoomType(`${prefix}-foreign`, {
        roomTypeId: restoredSingleType.id,
        expectedVersion: restoredSingleType.version,
        name: "Hacked",
        monthlyRate: "100",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const authRes = await getRoomsRoute();
    expect(authRes.status).toBe(200);
    const overview = await listInventoryOverview(state.ownerId);
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
      name: "Single AC",
      monthlyRate: "5000",
      dailyRate: "750",
    });
    const doubleType = await createRoomType(state.ownerId, {
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
});
