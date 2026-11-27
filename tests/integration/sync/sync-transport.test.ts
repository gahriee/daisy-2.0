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
import { TENANT_SYNC_PROTOCOL_VERSION } from "../../../src/features/tenants/sync-contracts";
import { MAINTENANCE_SYNC_PROTOCOL_VERSION } from "../../../src/features/maintenance/sync-contracts";
import { registerOwnerDevice } from "../../../src/server/auth/device";

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

import { POST as bootstrapRoute } from "../../../src/app/api/sync/bootstrap/route";
import { POST as pushRoute } from "../../../src/app/api/sync/push/route";
import { GET as pullRoute } from "../../../src/app/api/sync/pull/route";
import { RebootstrapRequiredError } from "../../../src/lib/errors";
import { signSyncCursor } from "../../../src/server/sync/cursor";
import {
  bootstrapSyncSnapshot,
  pullSyncChanges,
} from "../../../src/server/sync/service";

const ORIGIN = "https://daisy.local";
const CURSOR_SECRET = "integration-sync-cursor-secret-0123456789";
const prefix = `sync-test-${randomUUID()}`;
const sweepPrefix = "sync-test-";
let seq = 0;

async function cleanupTestOwners(db: PrismaClient, ownerPrefix: string) {
  await db.securityRateLimit.deleteMany({
    where: { key: { startsWith: `sync:${ownerPrefix}` } },
  });
  await db.securityRateLimit.deleteMany({
    where: { key: { startsWith: `auth:${ownerPrefix}` } },
  });
  await db.maintenanceUpdate.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.maintenanceRequest.deleteMany({
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
  await db.changeFeed.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.syncOperationOutcome.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.syncHead.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.auditLog.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.securityEvent.deleteMany({
    where: { ownerUserId: { startsWith: ownerPrefix } },
  });
  await db.device.deleteMany({
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
  vi.stubEnv("APP_ORIGIN", ORIGIN);
  vi.stubEnv("SYNC_CURSOR_SECRET", CURSOR_SECRET);
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
      await db.changeFeed.count({
        where: { ownerUserId: { startsWith: sweepPrefix } },
      }),
    ).toBe(0);
    expect(
      await db.syncOperationOutcome.count({
        where: { ownerUserId: { startsWith: sweepPrefix } },
      }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("/api/sync/* transport endpoints", () => {
  it("fails closed on missing auth, cross-origin writes, and missing/revoked devices", async () => {
    state.authenticated = false;
    const unauthPull = await pullRoute(
      new Request(`${ORIGIN}/api/sync/pull?cursor=abc`),
    );
    expect(unauthPull.status).toBe(401);
    expect(unauthPull.headers.get("cache-control")).toBe("private, no-store");

    state.authenticated = true;
    const badOriginPush = await pushRoute(
      new Request(`${ORIGIN}/api/sync/push`, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ operations: [] }),
      }),
    );
    expect(badOriginPush.status).toBe(403);

    const noDeviceBootstrap = await bootstrapRoute(
      new Request(`${ORIGIN}/api/sync/bootstrap`, {
        method: "POST",
        headers: { origin: ORIGIN },
      }),
    );
    expect(noDeviceBootstrap.status).toBe(403);
  });

  it("handles push batch execution, dependency retry vs blocked propagation, duplicate replay, fixed-watermark bootstrap, pull deltas, cursor expiry, and gap detection", async () => {
    const db = state.db!;
    const ownerId = state.ownerId;
    await db.owner.create({ data: { id: ownerId } });

    const { deviceId, rawToken } = await registerOwnerDevice({
      ownerUserId: ownerId,
      label: "Tablet A",
    });
    const deviceCookie = `daisy_device=${encodeURIComponent(rawToken!)}`;

    const room = await db.room.create({
      data: {
        ownerUserId: ownerId,
        title: "101",
        building: "BOARDING",
        capacity: 1,
        baseMonthlyRate: "4500.00",
      },
      select: { id: true },
    });
    const bed = await db.bed.create({
      data: {
        ownerUserId: ownerId,
        roomId: room.id,
        number: "1",
        monthlyRate: "4500.00",
      },
      select: { id: true },
    });

    // Empty initial bootstrap finishes cleanly at watermark "0" with a signed pull syncCursor.
    const initBootRes = await bootstrapRoute(
      new Request(`${ORIGIN}/api/sync/bootstrap`, {
        method: "POST",
        headers: { origin: ORIGIN, cookie: deviceCookie },
      }),
    );
    expect(initBootRes.status).toBe(200);
    expect(initBootRes.headers.get("cache-control")).toBe("private, no-store");
    const initBootBody = await initBootRes.json();
    expect(initBootBody.watermark).toBe("0");
    expect(initBootBody.hasMore).toBe(false);
    expect(initBootBody.syncCursor).toBeTruthy();

    // Push: missing dependency stays retryable ("retry"), while independent ops apply cleanly.
    const t1Id = randomUUID();
    const t2Id = randomUUID();
    const missingPreOpId = randomUUID();
    const opUpdateMissingDepId = randomUUID();
    const opCreateT1Id = randomUUID();
    const opCreateMaintId = randomUUID();
    const maintId = randomUUID();

    const createT1Op = {
      protocolVersion: TENANT_SYNC_PROTOCOL_VERSION,
      opId: opCreateT1Id,
      deviceId,
      localSequence: 1,
      type: "tenant.create",
      entityId: t1Id,
      baseVersion: 0,
      dependsOn: [],
      occurredAt: "2026-11-16T05:00:00.000Z",
      payload: {
        fullName: "Offline Tenant One",
        phone: "09170001111",
      },
    };

    const createMaintOp = {
      protocolVersion: MAINTENANCE_SYNC_PROTOCOL_VERSION,
      opId: opCreateMaintId,
      deviceId,
      localSequence: 2,
      type: "maintenance.create",
      entityId: maintId,
      baseVersion: 0,
      dependsOn: [],
      occurredAt: "2026-11-16T05:01:00.000Z",
      payload: {
        roomId: room.id,
        bedId: bed.id,
        title: "Loose cabinet hinge",
        description: "Check screws",
        category: "STRUCTURAL",
        priority: "LOW",
        attachmentIntentIds: [],
      },
    };

    const pushRes1 = await pushRoute(
      new Request(`${ORIGIN}/api/sync/push`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          cookie: deviceCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operations: [
            {
              protocolVersion: TENANT_SYNC_PROTOCOL_VERSION,
              opId: opUpdateMissingDepId,
              deviceId,
              localSequence: 1,
              type: "tenant.update",
              entityId: t2Id,
              baseVersion: 1,
              dependsOn: [missingPreOpId],
              occurredAt: "2026-11-16T05:00:00.000Z",
              payload: { fullName: "Waiting On Predecessor" },
            },
            createT1Op,
            createMaintOp,
          ],
        }),
      }),
    );
    expect(pushRes1.status).toBe(200);
    const pushBody1 = await pushRes1.json();
    expect(pushBody1.outcomes[0]).toMatchObject({
      opId: opUpdateMissingDepId,
      status: "retry",
      retryable: true,
    });
    expect(pushBody1.outcomes[1]).toMatchObject({
      opId: opCreateT1Id,
      status: "applied",
      resultingVersion: 1,
    });
    expect(pushBody1.outcomes[2]).toMatchObject({
      opId: opCreateMaintId,
      status: "applied",
      resultingVersion: 1,
    });

    // Missing dependency wrote no terminal SyncOperationOutcome row.
    expect(
      await db.syncOperationOutcome.findUnique({
        where: {
          ownerUserId_opId: {
            ownerUserId: ownerId,
            opId: opUpdateMissingDepId,
          },
        },
      }),
    ).toBeNull();

    // Replay createT1Op -> duplicate; same opId with altered payload -> rejected.
    const opStaleId = randomUUID();
    const opBlockedId = randomUUID();
    const pushRes2 = await pushRoute(
      new Request(`${ORIGIN}/api/sync/push`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          cookie: deviceCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operations: [
            createT1Op,
            {
              ...createT1Op,
              payload: {
                fullName: "Tampered Replay Name",
                phone: "09170001111",
              },
            },
            {
              protocolVersion: TENANT_SYNC_PROTOCOL_VERSION,
              opId: opStaleId,
              deviceId,
              localSequence: 3,
              type: "tenant.update",
              entityId: t1Id,
              baseVersion: 9, // Conflict! actual version is 1
              dependsOn: [opCreateT1Id],
              occurredAt: "2026-11-16T05:02:00.000Z",
              payload: { fullName: "Stale Conflict Name" },
            },
            {
              protocolVersion: TENANT_SYNC_PROTOCOL_VERSION,
              opId: opBlockedId,
              deviceId,
              localSequence: 4,
              type: "tenant.archive",
              entityId: t1Id,
              baseVersion: 10,
              dependsOn: [opStaleId],
              occurredAt: "2026-11-16T05:03:00.000Z",
              payload: {},
            },
          ],
        }),
      }),
    );
    expect(pushRes2.status).toBe(200);
    const pushBody2 = await pushRes2.json();
    expect(pushBody2.outcomes[0].status).toBe("duplicate");
    expect(pushBody2.outcomes[1].status).toBe("rejected");
    expect(pushBody2.outcomes[2].status).toBe("conflict");
    expect(pushBody2.outcomes[3].status).toBe("blocked");

    // Pull deltas strictly after initial empty cursor sees the 2 committed changes (tenant + maintenance).
    const pullRes1 = await pullRoute(
      new Request(
        `${ORIGIN}/api/sync/pull?cursor=${encodeURIComponent(initBootBody.syncCursor)}`,
        { headers: { cookie: deviceCookie } },
      ),
    );
    expect(pullRes1.status).toBe(200);
    const pullBody1 = await pullRes1.json();
    expect(pullBody1.changes).toHaveLength(2);
    expect(
      pullBody1.changes.map((c: { entityType: string }) => c.entityType),
    ).toEqual(["tenant", "maintenance_request"]);

    // Now archive t1 so ChangeFeed has a tombstone as well, then test fixed-watermark multi-page bootstrap.
    const opArchiveId = randomUUID();
    await pushRoute(
      new Request(`${ORIGIN}/api/sync/push`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          cookie: deviceCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operations: [
            {
              protocolVersion: TENANT_SYNC_PROTOCOL_VERSION,
              opId: opArchiveId,
              deviceId,
              localSequence: 5,
              type: "tenant.archive",
              entityId: t1Id,
              baseVersion: 1,
              dependsOn: [opCreateT1Id],
              occurredAt: "2026-11-16T05:04:00.000Z",
              payload: {},
            },
          ],
        }),
      }),
    );

    // Multi-page bootstrap with limit=1 takes page 1 at watermark N, mutates t3 concurrently AFTER page 1,
    // and page 2 still sees ONLY entities <= watermark N (including t1 tombstone)!
    const page1 = await bootstrapSyncSnapshot({
      ownerUserId: ownerId,
      deviceToken: rawToken,
      rawBody: { limit: 1 },
    });
    expect(page1.hasMore).toBe(true);
    expect(page1.records).toHaveLength(1);
    expect(page1.cursor).toBeTruthy();

    // Concurrent new tenant created AFTER bootstrap page 1 started -> watermark > page1.watermark
    const lateTenantId = randomUUID();
    await pushRoute(
      new Request(`${ORIGIN}/api/sync/push`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          cookie: deviceCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operations: [
            {
              protocolVersion: TENANT_SYNC_PROTOCOL_VERSION,
              opId: randomUUID(),
              deviceId,
              localSequence: 6,
              type: "tenant.create",
              entityId: lateTenantId,
              baseVersion: 0,
              dependsOn: [],
              occurredAt: "2026-11-16T05:05:00.000Z",
              payload: {
                fullName: "After Watermark Tenant",
                phone: "09172223333",
              },
            },
          ],
        }),
      }),
    );

    const page2 = await bootstrapSyncSnapshot({
      ownerUserId: ownerId,
      deviceToken: rawToken,
      rawBody: { cursor: page1.cursor!, limit: 10 },
    });
    expect(page2.watermark).toBe(page1.watermark);
    expect(page2.hasMore).toBe(false);
    expect(page2.syncCursor).toBeTruthy();

    const allBootRecords = [...page1.records, ...page2.records];
    expect(allBootRecords).toHaveLength(2);
    expect(allBootRecords.find((r) => r.entityId === t1Id)?.operation).toBe(
      "tombstone",
    );
    expect(
      allBootRecords.find((r) => r.entityId === lateTenantId),
    ).toBeUndefined();

    // Incremental pull from page2.syncCursor catches lateTenantId cleanly!
    const pullAfterBoot = await pullRoute(
      new Request(
        `${ORIGIN}/api/sync/pull?cursor=${encodeURIComponent(page2.syncCursor!)}`,
        { headers: { cookie: deviceCookie } },
      ),
    );
    expect(pullAfterBoot.status).toBe(200);
    const pullAfterBootBody = await pullAfterBoot.json();
    expect(pullAfterBootBody.changes).toHaveLength(1);
    expect(pullAfterBootBody.changes[0].entityId).toBe(lateTenantId);

    // Tampered pull cursor returns HTTP 410 rebootstrap_required.
    const badCursorPull = await pullRoute(
      new Request(`${ORIGIN}/api/sync/pull?cursor=tampered.cursor`, {
        headers: { cookie: deviceCookie },
      }),
    );
    expect(badCursorPull.status).toBe(410);
    const badCursorBody = await badCursorPull.json();
    expect(badCursorBody.code).toBe("rebootstrap_required");

    // Expired cursor returns 410 RebootstrapRequiredError.
    const expiredCursor = signSyncCursor({
      v: 1,
      kind: "pull",
      ownerUserId: ownerId,
      deviceId,
      seq: "0",
      issuedAt: Date.now() - 10_000,
      expiresAt: Date.now() - 1,
    });
    await expect(
      pullSyncChanges({
        ownerUserId: ownerId,
        deviceToken: rawToken,
        rawQuery: { cursor: expiredCursor },
      }),
    ).rejects.toBeInstanceOf(RebootstrapRequiredError);

    // Stale/ahead cursor (e.g. after server reset where cursor seq > SyncHead.lastSequence) returns 410.
    const aheadCursor = signSyncCursor({
      v: 1,
      kind: "pull",
      ownerUserId: ownerId,
      deviceId,
      seq: "999999",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    const aheadPullRes = await pullRoute(
      new Request(
        `${ORIGIN}/api/sync/pull?cursor=${encodeURIComponent(aheadCursor)}`,
        { headers: { cookie: deviceCookie } },
      ),
    );
    expect(aheadPullRes.status).toBe(410);

    // Rate-limit threshold check on /api/sync/push -> 429 + Retry-After
    await db.securityRateLimit.upsert({
      where: { key: `sync:${ownerId}:push` },
      create: {
        key: `sync:${ownerId}:push`,
        count: 120,
        resetsAt: new Date(Date.now() + 60_000),
      },
      update: {
        count: 120,
        resetsAt: new Date(Date.now() + 60_000),
      },
    });
    const throttledPush = await pushRoute(
      new Request(`${ORIGIN}/api/sync/push`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          cookie: deviceCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ operations: [createT1Op] }),
      }),
    );
    expect(throttledPush.status).toBe(429);
    expect(Number(throttledPush.headers.get("retry-after"))).toBeGreaterThan(0);

    // Revoking device blocks subsequent pull/bootstrap/push (403).
    await db.device.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    });
    const revokedPull = await pullRoute(
      new Request(
        `${ORIGIN}/api/sync/pull?cursor=${encodeURIComponent(page2.syncCursor!)}`,
        { headers: { cookie: deviceCookie } },
      ),
    );
    expect(revokedPull.status).toBe(403);
  });
});
