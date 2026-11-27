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
  deletedKeys: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  getDatabase: () => {
    if (!state.db) throw new Error("Test DB client not initialized");
    return state.db;
  },
}));
vi.mock("@/server/storage/client", () => ({
  deletePrivateObject: async (key: string) => {
    state.deletedKeys.push(key);
    return true;
  },
}));

import { POST as cleanupRoute } from "../../../src/app/api/jobs/maintenance/cleanup/route";
import { runMaintenanceCleanupJob } from "../../../src/server/jobs/cleanup";

const CRON_SECRET = "test-cron-secret-maintenance-012345";
const prefix = `jobs-cleanup-test-${randomUUID()}`;
const sweepPrefix = "jobs-cleanup-test-";
let seq = 0;

async function cleanupTestOwners(db: PrismaClient, ownerPrefix: string) {
  await db.securityRateLimit.deleteMany({
    where: { key: { startsWith: ownerPrefix } },
  });
  await db.roomPhoto.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.roomPhotoIntent.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.tenantContractPage.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.tenantContractIntent.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.paymentProof.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.paymentProofIntent.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.maintenanceAttachment.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.maintenanceAttachmentIntent.deleteMany({
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
  state.deletedKeys = [];
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv("OWNER_USER_ID", `${prefix}-${seq++}`);
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
        where: { key: { startsWith: sweepPrefix } },
      }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("POST /api/jobs/maintenance/cleanup integration", () => {
  it("fails closed with 401 on missing/invalid bearer token", async () => {
    const resNoAuth = await cleanupRoute(
      new Request("https://daisy.local/api/jobs/maintenance/cleanup", {
        method: "POST",
      }),
    );
    expect(resNoAuth.status).toBe(401);
    expect(resNoAuth.headers.get("cache-control")).toBe("private, no-store");
  });

  it("cleans expired unattached intents and expired rate limits while protecting active/attached intents and ChangeFeed", async () => {
    const db = state.db!;
    const ownerId = process.env.OWNER_USER_ID!;
    await db.owner.create({ data: { id: ownerId } });

    const room = await db.room.create({
      data: {
        ownerUserId: ownerId,
        number: "101",
        building: "BOARDING",
        capacity: 1,
        baseMonthlyRate: "4000.00",
      },
      select: { id: true },
    });

    const staleExpiredAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const activeFutureAt = new Date(Date.now() + 60 * 60 * 1000);

    // 1. Expired unattached intents -> MUST be cancelled + deleted from S3
    const staleProofIntent = await db.paymentProofIntent.create({
      data: {
        ownerUserId: ownerId,
        objectKey: `${ownerId}/proof-stale-${randomUUID()}`,
        fileName: "stale.jpg",
        mimeType: "image/jpeg",
        declaredByteSize: 1234,
        sha256: "a".repeat(64),
        status: "PENDING_UPLOAD",
        expiresAt: staleExpiredAt,
      },
      select: { id: true, objectKey: true },
    });

    const staleMaintIntent = await db.maintenanceAttachmentIntent.create({
      data: {
        ownerUserId: ownerId,
        objectKey: `${ownerId}/maint-stale-${randomUUID()}`,
        fileName: "maint.jpg",
        mimeType: "image/jpeg",
        byteSize: 2234,
        sha256: "b".repeat(64),
        status: "PENDING_UPLOAD",
        expiresAt: staleExpiredAt,
      },
      select: { id: true, objectKey: true },
    });

    // 2. Active PENDING_UPLOAD intent -> MUST stay intact
    const activeRoomIntent = await db.roomPhotoIntent.create({
      data: {
        ownerUserId: ownerId,
        roomId: room.id,
        objectKey: `${ownerId}/room-active-${randomUUID()}`,
        fileName: "room.jpg",
        mimeType: "image/jpeg",
        byteSize: 3000,
        sha256: "c".repeat(64),
        status: "PENDING_UPLOAD",
        expiresAt: activeFutureAt,
      },
      select: { id: true, objectKey: true },
    });

    // 3. ATTACHED old intent -> MUST NEVER be touched or deleted
    const attachedRoomIntent = await db.roomPhotoIntent.create({
      data: {
        ownerUserId: ownerId,
        roomId: room.id,
        objectKey: `${ownerId}/room-attached-${randomUUID()}`,
        fileName: "attached.jpg",
        mimeType: "image/jpeg",
        byteSize: 4000,
        sha256: "d".repeat(64),
        status: "ATTACHED",
        expiresAt: staleExpiredAt,
      },
      select: { id: true, objectKey: true },
    });
    await db.roomPhoto.create({
      data: {
        ownerUserId: ownerId,
        roomId: room.id,
        intentId: attachedRoomIntent.id,
        objectKey: attachedRoomIntent.objectKey,
        role: "PREVIEW",
        fileName: "attached.jpg",
        mimeType: "image/jpeg",
        byteSize: 4000,
        sha256: "d".repeat(64),
      },
    });

    // 4. Expired vs active SecurityRateLimit rows
    const expiredRateKey = `${ownerId}:expired-rate`;
    const activeRateKey = `${ownerId}:active-rate`;
    await db.securityRateLimit.createMany({
      data: [
        {
          key: expiredRateKey,
          count: 5,
          resetsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
        {
          key: activeRateKey,
          count: 2,
          resetsAt: activeFutureAt,
        },
      ],
    });

    // Dry run inspects without deleting or mutating DB or storage
    const drySummary = await runMaintenanceCleanupJob(ownerId, {
      graceHours: 24,
      dryRun: true,
    });
    expect(drySummary.dryRun).toBe(true);
    expect(drySummary.claimedIntents.total).toBe(2);
    expect(state.deletedKeys).toHaveLength(0);

    // Real cleanup via HTTP route
    const res = await cleanupRoute(
      new Request("https://daisy.local/api/jobs/maintenance/cleanup", {
        method: "POST",
        headers: {
          authorization: `Bearer ${CRON_SECRET}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ graceHours: 24, dryRun: false }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary.claimedIntents.paymentProofs).toBe(1);
    expect(body.summary.claimedIntents.maintenanceAttachments).toBe(1);
    expect(body.summary.claimedIntents.roomPhotos).toBe(0);
    expect(body.summary.storageObjectsDeleted).toBe(2);
    expect(state.deletedKeys).toEqual(
      expect.arrayContaining([
        staleProofIntent.objectKey,
        staleMaintIntent.objectKey,
      ]),
    );
    expect(state.deletedKeys).not.toContain(activeRoomIntent.objectKey);
    expect(state.deletedKeys).not.toContain(attachedRoomIntent.objectKey);

    // Active and attached intents remain untouched
    expect(
      (
        await db.roomPhotoIntent.findUnique({
          where: { id: activeRoomIntent.id },
          select: { status: true },
        })
      )?.status,
    ).toBe("PENDING_UPLOAD");
    expect(
      (
        await db.roomPhotoIntent.findUnique({
          where: { id: attachedRoomIntent.id },
          select: { status: true },
        })
      )?.status,
    ).toBe("ATTACHED");

    // Stale rate limit deleted, active preserved
    expect(
      await db.securityRateLimit.findUnique({ where: { key: expiredRateKey } }),
    ).toBeNull();
    expect(
      await db.securityRateLimit.findUnique({ where: { key: activeRateKey } }),
    ).not.toBeNull();

    // Identifier-only audit entry written
    const audits = await db.auditLog.findMany({
      where: {
        ownerUserId: ownerId,
        action: "maintenance.cleanup_completed",
      },
      select: { area: true, actorType: true, metadata: true },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.area).toBe("maintenance");
    expect(audits[0]?.actorType).toBe("scheduled_job");
    expect(JSON.stringify(audits[0]?.metadata)).not.toContain(
      staleProofIntent.objectKey,
    );

    // Immediate second run is an idempotent no-op
    state.deletedKeys = [];
    const secondSummary = await runMaintenanceCleanupJob(ownerId, {
      graceHours: 24,
    });
    expect(secondSummary.claimedIntents.total).toBe(0);
    expect(secondSummary.storageObjectsDeleted).toBe(0);
  });
});
