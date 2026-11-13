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
}));

vi.mock("server-only", () => ({}));

import {
  allocateSyncSequence,
  appendChangeFeed,
  writeAuditEntry,
} from "../../../src/server/sync/publish";

const prefix = `sync-head-test-${randomUUID()}`;
let seq = 0;
let ownerId = "";

beforeAll(() => {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Missing opted-in TEST_DATABASE_URL");
  state.db = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
});

beforeEach(() => {
  ownerId = `${prefix}-${seq++}`;
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
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });
    expect(
      await db.changeFeed.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.syncHead.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("SyncHead publication lock integration", () => {
  it("allocates strictly monotonic sequences under concurrent transactions", async () => {
    const db = state.db!;
    // Ensure Owner row exists first so concurrent transactions don't race initial Owner FK.
    await db.owner.create({ data: { id: ownerId } });

    const allocated = await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        db.$transaction(async (tx) => {
          const sequence = await allocateSyncSequence(tx, ownerId);
          const entityId = randomUUID();
          await appendChangeFeed(tx, {
            ownerUserId: ownerId,
            sequence,
            entityType: "settings_probe",
            entityId,
            version: 1,
            operation: "upsert",
            payload: { idx },
          });
          await writeAuditEntry(tx, {
            ownerUserId: ownerId,
            sequence,
            area: "settings",
            action: "probe.published",
            actorType: "owner",
            actorId: ownerId,
            entityType: "settings_probe",
            entityId,
          });
          return Number(sequence);
        }),
      ),
    );

    expect([...allocated].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);

    const feedRows = await db.changeFeed.findMany({
      where: { ownerUserId: ownerId },
      orderBy: { sequence: "asc" },
      select: { sequence: true },
    });
    expect(feedRows.map((row) => Number(row.sequence))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("rolls back SyncHead sequence increments when the enclosing transaction aborts", async () => {
    const db = state.db!;
    await db.owner.create({ data: { id: ownerId } });

    await expect(
      db.$transaction(async (tx) => {
        const sequence = await allocateSyncSequence(tx, ownerId);
        expect(sequence).toBe(BigInt(1));
        throw new Error("Simulated failure before commit");
      }),
    ).rejects.toThrow("Simulated failure before commit");

    const nextSeq = await db.$transaction((tx) =>
      allocateSyncSequence(tx, ownerId),
    );
    expect(nextSeq).toBe(BigInt(1));
  });
});
