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
  ownerId: "",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  getDatabase: () => {
    if (!state.db) throw new Error("Test DB client not initialized");
    return state.db;
  },
}));

import {
  AllocationConflictError,
  ConflictError,
} from "../../../src/lib/errors";
import {
  cancelAllocationInTx,
  completeAllocationInTx,
  createAllocationInTx,
} from "../../../src/features/allocations/service";
import { createBed, createRoom } from "../../../src/features/rooms/service";
import { isPgConstraintError } from "../../../src/server/db/pg-errors";

const prefix = `alloc-test-${randomUUID()}`;
let seq = 0;

beforeAll(() => {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Missing opted-in TEST_DATABASE_URL");
  state.db = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
});

beforeEach(() => {
  state.ownerId = `${prefix}-${seq++}`;
});

afterAll(async () => {
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
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });

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

describe("unified allocation engine & btree_gist exclusion integration", () => {
  it("allows abutting [startDate, endDate) intervals and rejects overlaps at both service and DB constraint levels", async () => {
    const db = state.db!;
    const room = await createRoom(state.ownerId, {
      title: "101",
      baseMonthlyRate: "4500.00",
      capacity: 1,
    });
    const bed = await createBed(state.ownerId, {
      roomId: room.id,
      number: "A",
      monthlyRate: "4500.00",
    });

    const jan1 = new Date("2026-12-01T00:00:00.000Z");
    const jan15 = new Date("2026-12-15T00:00:00.000Z");
    const feb1 = new Date("2027-01-01T00:00:00.000Z");
    const jan10 = new Date("2026-12-10T00:00:00.000Z");
    const jan20 = new Date("2026-12-20T00:00:00.000Z");

    const [first] = await db.$transaction((tx) =>
      createAllocationInTx(tx, {
        ownerUserId: state.ownerId,
        roomId: room.id,
        bedId: bed.id,
        scope: "BED",
        type: "TENANT_ASSIGNMENT",
        startDate: jan1,
        endDate: jan15,
        asOfUtc: jan1,
      }),
    );
    expect(first?.status).toBe("ACTIVE");

    // Exact abutting interval [jan15, feb1) must succeed.
    const [abutting] = await db.$transaction((tx) =>
      createAllocationInTx(tx, {
        ownerUserId: state.ownerId,
        roomId: room.id,
        bedId: bed.id,
        scope: "BED",
        type: "TRANSIENT_RESERVATION",
        startDate: jan15,
        endDate: feb1,
        asOfUtc: jan1,
      }),
    );
    expect(abutting?.status).toBe("ACTIVE");

    // Overlapping service call fails with AllocationConflictError.
    await expect(
      db.$transaction((tx) =>
        createAllocationInTx(tx, {
          ownerUserId: state.ownerId,
          roomId: room.id,
          bedId: bed.id,
          scope: "BED",
          type: "MAINTENANCE_HOLD",
          startDate: jan10,
          endDate: jan20,
          asOfUtc: jan1,
        }),
      ),
    ).rejects.toBeInstanceOf(AllocationConflictError);

    // Direct DB insert bypassing service prechecks must still be rejected by btree_gist (23P01).
    let rawPgError: unknown;
    try {
      await db.allocation.create({
        data: {
          ownerUserId: state.ownerId,
          roomId: room.id,
          bedId: bed.id,
          scope: "BED",
          type: "MAINTENANCE_HOLD",
          status: "ACTIVE",
          startDate: jan10,
          endDate: jan20,
        },
      });
    } catch (error) {
      rawPgError = error;
    }
    expect(
      isPgConstraintError(
        rawPgError,
        "23P01",
        "Allocation_active_bed_interval_excl",
      ),
    ).toBe(true);

    // Cancelling the abutting reservation frees [jan15, feb1) for a new booking.
    await db.$transaction((tx) =>
      cancelAllocationInTx(tx, {
        ownerUserId: state.ownerId,
        allocationId: abutting!.id,
        asOfUtc: jan1,
      }),
    );

    const [rebooked] = await db.$transaction((tx) =>
      createAllocationInTx(tx, {
        ownerUserId: state.ownerId,
        roomId: room.id,
        bedId: bed.id,
        scope: "BED",
        type: "MAINTENANCE_HOLD",
        startDate: jan15,
        endDate: feb1,
        asOfUtc: jan1,
      }),
    );
    expect(rebooked?.status).toBe("ACTIVE");

    // Completing early truncates endDate cleanly and leaves room before old end.
    const completed = await db.$transaction((tx) =>
      completeAllocationInTx(tx, {
        ownerUserId: state.ownerId,
        allocationId: first!.id,
        truncatedEndDate: jan10,
        asOfUtc: jan10,
      }),
    );
    expect(completed.status).toBe("COMPLETED");
    expect(completed.endDate).toBe(jan10.toISOString());
  });

  it("claims all beds on WHOLE_ROOM allocation, blocks overlapping bed additions, and prevents concurrent double-booking", async () => {
    const db = state.db!;
    const room = await createRoom(state.ownerId, {
      title: "DORM-1",
      baseMonthlyRate: "3000.00",
      capacity: 3,
    });
    const bedA = await createBed(state.ownerId, {
      roomId: room.id,
      number: "A",
      monthlyRate: "3000.00",
    });
    const bedB = await createBed(state.ownerId, {
      roomId: room.id,
      number: "B",
      monthlyRate: "3000.00",
    });

    const start = new Date("2027-02-01T00:00:00.000Z");
    const end = new Date("2027-02-10T00:00:00.000Z");

    const wholeRoom = await db.$transaction((tx) =>
      createAllocationInTx(tx, {
        ownerUserId: state.ownerId,
        roomId: room.id,
        scope: "WHOLE_ROOM",
        type: "TRANSIENT_RESERVATION",
        startDate: start,
        endDate: end,
        asOfUtc: start,
      }),
    );
    expect(wholeRoom).toHaveLength(2);
    expect(wholeRoom[0]?.allocationGroupId).toBe(
      wholeRoom[1]?.allocationGroupId,
    );

    // Individual bed booking overlapping either bed fails cleanly.
    await expect(
      db.$transaction((tx) =>
        createAllocationInTx(tx, {
          ownerUserId: state.ownerId,
          roomId: room.id,
          bedId: bedA.id,
          scope: "BED",
          type: "TENANT_ASSIGNMENT",
          startDate: start,
          endDate: end,
          asOfUtc: start,
        }),
      ),
    ).rejects.toBeInstanceOf(AllocationConflictError);

    // Adding a 3rd bed to a room with an active whole-room claim is blocked.
    await expect(
      createBed(
        state.ownerId,
        {
          roomId: room.id,
          number: "C",
          monthlyRate: "3000.00",
        },
        start,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    // Competing concurrent single-bed claims for next month: exactly one succeeds.
    const nextStart = new Date("2027-03-01T00:00:00.000Z");
    const nextEnd = new Date("2027-03-10T00:00:00.000Z");
    const outcomes = await Promise.allSettled([
      db.$transaction((tx) =>
        createAllocationInTx(tx, {
          ownerUserId: state.ownerId,
          roomId: room.id,
          bedId: bedB.id,
          scope: "BED",
          type: "TRANSIENT_RESERVATION",
          startDate: nextStart,
          endDate: nextEnd,
          asOfUtc: nextStart,
        }),
      ),
      db.$transaction((tx) =>
        createAllocationInTx(tx, {
          ownerUserId: state.ownerId,
          roomId: room.id,
          bedId: bedB.id,
          scope: "BED",
          type: "TENANT_ASSIGNMENT",
          startDate: nextStart,
          endDate: nextEnd,
          asOfUtc: nextStart,
        }),
      ),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
