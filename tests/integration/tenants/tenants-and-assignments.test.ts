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

import { ConflictError, ForbiddenError } from "../../../src/lib/errors";
import { listAuditLogs } from "../../../src/features/audit/service";
import {
  createBed,
  createRoom,
  createRoomType,
} from "../../../src/features/rooms/service";
import {
  archiveTenant,
  assignTenantToBed,
  createTenant,
  getTenantDetail,
  listTenantsOverview,
  moveOutTenantAssignment,
  restoreTenant,
  updateTenant,
} from "../../../src/features/tenants/service";
import { applyTenantSyncOperation } from "../../../src/features/tenants/sync-handler";
import { TENANT_SYNC_PROTOCOL_VERSION } from "../../../src/features/tenants/sync-contracts";
import { registerOwnerDevice } from "../../../src/server/auth/device";
import { listOwnerNotifications } from "../../../src/server/notifications/service";
import { GET as getTenantsRoute } from "../../../src/app/api/tenants/route";

const prefix = `tenants-test-${randomUUID()}`;
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
    await db.tenantAssignment.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.allocation.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.tenant.deleteMany({
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
    await db.device.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.securityEvent.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });

    expect(
      await db.tenant.count({ where: { ownerUserId: { startsWith: prefix } } }),
    ).toBe(0);
    expect(
      await db.owner.count({ where: { id: { startsWith: prefix } } }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("tenants CRUD/sync and online-only TenantAssignment integration", () => {
  it("handles tenant syncable UUIDs, versions, tombstones, assignment exclusivity, atomic move-in/out, notifications, and identifier-only audit", async () => {
    const db = state.db!;

    state.authenticated = false;
    const unauth = await getTenantsRoute();
    expect(unauth.status).toBe(401);
    state.authenticated = true;

    const doubleType = await createRoomType(state.ownerId, {
      name: "Double",
      monthlyRate: "4800",
    });
    const room = await createRoom(state.ownerId, {
      number: "301",
      roomTypeId: doubleType.id,
      capacity: 2,
    });
    const bedA = await createBed(state.ownerId, {
      roomId: room.id,
      number: "A",
      monthlyRate: "4800",
    });
    const bedB = await createBed(state.ownerId, {
      roomId: room.id,
      number: "B",
      monthlyRate: "4800",
    });

    const tenantId = randomUUID();
    const tenant = await createTenant(state.ownerId, {
      id: tenantId,
      fullName: "Juan Dela Cruz",
      phone: "+63 917 123 4567",
      email: "juan@example.com",
    });
    expect(tenant.id).toBe(tenantId);
    expect(tenant.version).toBe(1);

    // Move in immediately (asOfUtc inside [start, end)) -> bed moves AVAILABLE -> OCCUPIED.
    const now = new Date("2026-11-13T04:00:00.000Z"); // 2026-11-13 12:00 Manila
    const assignment = await assignTenantToBed(
      state.ownerId,
      {
        tenantId: tenant.id,
        bedId: bedA.id,
        startDateManila: "2026-11-13",
        endDateManila: "2026-11-18",
        monthlyRate: "4800",
        securityDeposit: "4800",
      },
      now,
    );
    expect(assignment.status).toBe("ACTIVE");

    const bedAfterAssign = await db.bed.findUniqueOrThrow({
      where: { id: bedA.id },
      select: { status: true },
    });
    expect(bedAfterAssign.status).toBe("OCCUPIED");

    // Partial unique index & service guard block a 2nd active assignment for same tenant on Bed B.
    await expect(
      assignTenantToBed(
        state.ownerId,
        {
          tenantId: tenant.id,
          bedId: bedB.id,
          startDateManila: "2026-11-13",
          endDateManila: "2026-12-13",
          monthlyRate: "4800",
          securityDeposit: "0",
        },
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    // Archiving a tenant with an active assignment is blocked cleanly.
    await expect(
      archiveTenant(state.ownerId, {
        tenantId: tenant.id,
        expectedVersion: tenant.version,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Ending-soon notification projects cleanly for assignment ending within 7 days.
    const notifications = await listOwnerNotifications(state.ownerId);
    const endingNotif = notifications.find((n) =>
      n.key.startsWith(`assignment:ending:${assignment.id}:`),
    );
    expect(endingNotif?.destination).toBe(`/tenants/${tenant.id}`);

    // Move out -> completes assignment, truncates Allocation, restores Bed A -> AVAILABLE.
    const completed = await moveOutTenantAssignment(
      state.ownerId,
      {
        assignmentId: assignment.id,
        expectedVersion: assignment.version,
        mode: "complete",
        actualMoveOutDateManila: "2026-11-15",
      },
      new Date("2026-11-15T04:00:00.000Z"),
    );
    expect(completed.status).toBe("COMPLETED");
    expect(completed.actualMoveOutDateManila).toBe("2026-11-15");

    const bedAfterMoveOut = await db.bed.findUniqueOrThrow({
      where: { id: bedA.id },
      select: { status: true },
    });
    expect(bedAfterMoveOut.status).toBe("AVAILABLE");

    const linkedAlloc = await db.allocation.findUniqueOrThrow({
      where: { id: assignment.allocationId },
      select: { status: true, endDate: true },
    });
    expect(linkedAlloc.status).toBe("COMPLETED");

    // Scheduled future assignment cancelled before stay began -> CANCELLED assignment + allocation.
    const futureAssignment = await assignTenantToBed(
      state.ownerId,
      {
        tenantId: tenant.id,
        bedId: bedB.id,
        startDateManila: "2026-12-01",
        endDateManila: "2027-06-01",
        monthlyRate: "4800",
        securityDeposit: "4800",
      },
      now,
    );
    const cancelled = await moveOutTenantAssignment(
      state.ownerId,
      {
        assignmentId: futureAssignment.id,
        expectedVersion: futureAssignment.version,
        mode: "cancel",
        actualMoveOutDateManila: "",
      },
      now,
    );
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.actualMoveOutDate).toBeNull();

    // Update, Archive tombstone, and Restore republishing on Tenant.
    const updated = await updateTenant(state.ownerId, {
      tenantId: tenant.id,
      expectedVersion: tenant.version,
      fullName: "Juan D. Cruz",
      phone: "+63 917 999 8888",
    });
    expect(updated.version).toBe(2);

    const archived = await archiveTenant(state.ownerId, {
      tenantId: tenant.id,
      expectedVersion: updated.version,
    });
    expect(archived.archivedAt).not.toBeNull();

    const detail = await getTenantDetail(state.ownerId, tenant.id);
    expect(detail?.assignments).toHaveLength(2);
    expect(detail?.derivedBalance).toBe("0.00");

    const restored = await restoreTenant(state.ownerId, {
      tenantId: tenant.id,
      expectedVersion: archived.version,
    });
    expect(restored.archivedAt).toBeNull();

    // AuditLog entries must never contain tenant PII (name/phone/email).
    const rawAuditRows = await db.auditLog.findMany({
      where: { ownerUserId: state.ownerId, area: "tenants" },
      select: { action: true, metadata: true },
    });
    expect(JSON.stringify(rawAuditRows)).not.toContain("Juan");
    expect(JSON.stringify(rawAuditRows)).not.toContain("juan@example.com");
    expect(JSON.stringify(rawAuditRows)).not.toContain("123 4567");
    expect(JSON.stringify(rawAuditRows)).not.toContain("999 8888");

    const auditSummary = await listAuditLogs(state.ownerId, {
      area: "tenants",
    });
    expect(auditSummary.entries.length).toBeGreaterThanOrEqual(4);

    const overview = await listTenantsOverview(state.ownerId);
    expect(overview.tenants).toHaveLength(1);
  }, 45_000);

  it("enforces idempotency, conflict outcomes, blocked dependents, and device checks in tenant sync handler", async () => {
    const db = state.db!;
    const reg = await registerOwnerDevice({
      ownerUserId: state.ownerId,
      label: "Owner phone",
    });
    const deviceId = reg.deviceId;
    const rawToken = reg.rawToken!;

    const syncedTenantId = randomUUID();
    const op1Id = randomUUID();
    const createOp = {
      protocolVersion: TENANT_SYNC_PROTOCOL_VERSION,
      opId: op1Id,
      deviceId,
      localSequence: 1,
      type: "tenant.create" as const,
      entityId: syncedTenantId,
      baseVersion: 0 as const,
      dependsOn: [],
      occurredAt: "2026-11-13T12:00:00.000Z",
      payload: {
        fullName: "Synced Tenant",
      },
    };

    const res1 = await applyTenantSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken: rawToken,
      rawOperation: createOp,
    });
    expect(res1.status).toBe("applied");
    expect(res1.resultingVersion).toBe(1);

    // Exact replay with same opId & payload returns duplicate without re-applying.
    const res1Dup = await applyTenantSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken: rawToken,
      rawOperation: createOp,
    });
    expect(res1Dup.status).toBe("duplicate");
    expect(res1Dup.resultingVersion).toBe(1);

    // Reusing opId with changed payload throws ConflictError.
    await expect(
      applyTenantSyncOperation({
        ownerUserId: state.ownerId,
        deviceToken: rawToken,
        rawOperation: {
          ...createOp,
          payload: { fullName: "Tampered Payload" },
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Stale baseVersion produces a recorded "conflict" outcome (version 1 != expected 2).
    const opConflictId = randomUUID();
    const conflictRes = await applyTenantSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken: rawToken,
      rawOperation: {
        protocolVersion: TENANT_SYNC_PROTOCOL_VERSION,
        opId: opConflictId,
        deviceId,
        localSequence: 2,
        type: "tenant.update",
        entityId: syncedTenantId,
        baseVersion: 2,
        dependsOn: [op1Id],
        occurredAt: "2026-11-13T12:01:00.000Z",
        payload: { fullName: "Stale Edit" },
      },
    });
    expect(conflictRes.status).toBe("conflict");

    // Dependent operation referencing failed predecessor becomes "blocked".
    const blockedRes = await applyTenantSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken: rawToken,
      rawOperation: {
        protocolVersion: TENANT_SYNC_PROTOCOL_VERSION,
        opId: randomUUID(),
        deviceId,
        localSequence: 3,
        type: "tenant.archive",
        entityId: syncedTenantId,
        baseVersion: 3,
        dependsOn: [opConflictId],
        occurredAt: "2026-11-13T12:02:00.000Z",
        payload: {},
      },
    });
    expect(blockedRes.status).toBe("blocked");

    // Foreign or revoked device fails cleanly.
    await db.device.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    });
    await expect(
      applyTenantSyncOperation({
        ownerUserId: state.ownerId,
        deviceToken: rawToken,
        rawOperation: {
          ...createOp,
          opId: randomUUID(),
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
