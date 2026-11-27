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

import { ConflictError, NotFoundError } from "../../../src/lib/errors";
import { isPgConstraintError } from "../../../src/server/db/pg-errors";
import { listAuditLogs } from "../../../src/features/audit/service";
import { createRoom } from "../../../src/features/rooms/service";
import { createTenant } from "../../../src/features/tenants/service";
import {
  archiveNotice,
  createNotice,
  getNoticesOverview,
  restoreNotice,
  updateNotice,
} from "../../../src/features/notices/service";
import { GET as getNoticesRoute } from "../../../src/app/api/notices/route";

const prefix = `notices-test-${randomUUID()}`;
let seq = 0;

function manilaOffsetDate(daysDelta: number): string {
  const todayManila = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = todayManila.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + daysDelta));
  return dt.toISOString().slice(0, 10);
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
});

afterEach(() => {
  vi.unstubAllEnvs();
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
    await db.notice.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.tenant.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.room.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });

    expect(
      await db.notice.count({
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

describe("notices CRUD, audience targeting, ChangeFeed snapshots & constraints integration", () => {
  it("enforces authentication and manages EVERYONE, ROOM, and TENANT notices with Manila window status", async () => {
    state.authenticated = false;
    const unauthRes = await getNoticesRoute();
    expect(unauthRes.status).toBe(401);

    state.authenticated = true;
    const room = await createRoom(state.ownerId, {
      title: "305",
      baseMonthlyRate: "3500.00",
      capacity: 4,
    });
    const tenant = await createTenant(state.ownerId, {
      fullName: "Elena Cruz",
      phone: "+63 918 555 0144",
      email: "elena@example.test",
      address: null,
      emergencyContact: null,
      notes: null,
    });

    const today = manilaOffsetDate(0);
    const nextWeek = manilaOffsetDate(7);
    const futureStart = manilaOffsetDate(10);
    const futureEnd = manilaOffsetDate(14);
    const pastStart = manilaOffsetDate(-10);
    const pastEnd = manilaOffsetDate(-2);

    const propertyNotice = await createNotice(state.ownerId, {
      audience: "EVERYONE",
      roomId: null,
      tenantId: null,
      title: "Water pump servicing",
      body: "Overhead tank flush from 1 PM to 3 PM.",
      startDateManila: today,
      endDateManila: nextWeek,
    });
    expect(propertyNotice.lifecycleStatus).toBe("ACTIVE");

    const roomNotice = await createNotice(state.ownerId, {
      audience: "ROOM",
      roomId: room.id,
      tenantId: null,
      title: "Room 305 AC filter clean",
      body: "Technician arriving Friday morning.",
      startDateManila: futureStart,
      endDateManila: futureEnd,
    });
    expect(roomNotice.lifecycleStatus).toBe("SCHEDULED");
    expect(roomNotice.roomNumber).toBe("305");

    const tenantNotice = await createNotice(state.ownerId, {
      audience: "TENANT",
      roomId: null,
      tenantId: tenant.id,
      title: "Package at reception",
      body: "Please pick up your parcel.",
      startDateManila: pastStart,
      endDateManila: pastEnd,
    });
    expect(tenantNotice.lifecycleStatus).toBe("EXPIRED");
    expect(tenantNotice.tenantName).toBe("Elena Cruz");

    // Optimistic locking prevents stale edits.
    await expect(
      updateNotice(state.ownerId, {
        noticeId: propertyNotice.id,
        expectedVersion: 99,
        audience: "EVERYONE",
        roomId: null,
        tenantId: null,
        title: "Stale title",
        body: "Stale body",
        startDateManila: today,
        endDateManila: nextWeek,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const updated = await updateNotice(state.ownerId, {
      noticeId: propertyNotice.id,
      expectedVersion: propertyNotice.version,
      audience: "EVERYONE",
      roomId: null,
      tenantId: null,
      title: "Water pump servicing (confirmed)",
      body: "Overhead tank flush confirmed for 2 PM to 3 PM.",
      startDateManila: today,
      endDateManila: nextWeek,
    });
    expect(updated.version).toBe(2);

    // Soft-archiving emits ChangeFeed tombstone; restoring emits upsert.
    const archived = await archiveNotice(state.ownerId, {
      noticeId: roomNotice.id,
      expectedVersion: roomNotice.version,
    });
    expect(archived.lifecycleStatus).toBe("ARCHIVED");

    const restored = await restoreNotice(state.ownerId, {
      noticeId: archived.id,
      expectedVersion: archived.version,
    });
    expect(restored.lifecycleStatus).toBe("SCHEDULED");

    const overviewRes = await getNoticesRoute();
    expect(overviewRes.status).toBe(200);
    const overview = await getNoticesOverview(state.ownerId);
    expect(overview.totals).toEqual({
      activeCount: 1,
      scheduledCount: 1,
      expiredCount: 1,
      archivedCount: 0,
    });

    // Rejects unknown room target cleanly.
    await expect(
      createNotice(state.ownerId, {
        audience: "ROOM",
        roomId: randomUUID(),
        tenantId: null,
        title: "Missing room",
        body: "Should fail",
        startDateManila: today,
        endDateManila: nextWeek,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Verify SQL Notice_audience_target_check rejects corrupted audience/target combinations.
    const db = state.db!;
    let sqlErr: unknown = null;
    try {
      await db.$executeRaw`
        INSERT INTO "Notice" ("id", "ownerUserId", "audience", "roomId", "tenantId", "title", "body", "startDateManila", "endDateManila", "startDate", "endDate", "updatedAt")
        VALUES (${randomUUID()}::uuid, ${state.ownerId}, 'EVERYONE'::"NoticeAudience", ${room.id}::uuid, NULL, 'Bad', 'Body', ${today}, ${nextWeek}, NOW(), NOW() + interval '1 day', NOW())
      `;
    } catch (err) {
      sqlErr = err;
    }
    expect(sqlErr).not.toBeNull();
    expect(isPgConstraintError(sqlErr, "23514")).toBe(true);

    // Identifier-only audit entries exclude body text and tenant names.
    const audit = await listAuditLogs(state.ownerId, { area: "notices" });
    expect(audit.entries).toHaveLength(6);
    const serializedAudit = JSON.stringify(audit.entries);
    expect(serializedAudit).not.toContain("Elena Cruz");
    expect(serializedAudit).not.toContain("Overhead tank");
  });
});
