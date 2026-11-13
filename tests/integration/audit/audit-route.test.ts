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

import { GET as getAuditRoute } from "../../../src/app/api/audit/route";

const prefix = `audit-route-test-${randomUUID()}`;
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
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });

    expect(
      await db.auditLog.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.owner.count({
        where: { id: { startsWith: prefix } },
      }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("GET /api/audit dynamic filtering integration", () => {
  it("fails closed when unauthenticated and rejects invalid dates", async () => {
    state.authenticated = false;
    const unauthRes = await getAuditRoute(
      new Request("http://localhost:3000/api/audit"),
    );
    expect(unauthRes.status).toBe(401);

    state.authenticated = true;
    const badDateRes = await getAuditRoute(
      new Request("http://localhost:3000/api/audit?fromDate=2026-02-29"),
    );
    expect(badDateRes.status).toBe(400);
  });

  it("filters across area and multi-field query with private headers without writing audit entries", async () => {
    const db = state.db!;
    await db.owner.create({ data: { id: state.ownerId } });

    const targetEntityId = randomUUID();
    await db.auditLog.createMany({
      data: [
        {
          ownerUserId: state.ownerId,
          area: "settings",
          action: "settings.updated",
          actorType: "owner",
          actorId: state.ownerId,
          entityType: "business_settings",
          entityId: targetEntityId,
          sequence: BigInt(1),
        },
        {
          ownerUserId: state.ownerId,
          area: "rooms",
          action: "room.created",
          actorType: "owner",
          actorId: state.ownerId,
          entityType: "room",
          entityId: randomUUID(),
          sequence: BigInt(2),
        },
      ],
    });

    const queryRes = await getAuditRoute(
      new Request(
        `http://localhost:3000/api/audit?area=settings&query=${targetEntityId.slice(0, 8)}`,
      ),
    );
    expect(queryRes.status).toBe(200);
    expect(queryRes.headers.get("cache-control")).toBe("private, no-store");
    expect(queryRes.headers.get("referrer-policy")).toBe("no-referrer");

    const json = (await queryRes.json()) as {
      entries: Array<{ action: string; entityId: string }>;
    };
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0]?.action).toBe("settings.updated");
    expect(json.entries[0]?.entityId).toBe(targetEntityId);

    // Ensure reading /api/audit produced no extra audit rows.
    const totalCount = await db.auditLog.count({
      where: { ownerUserId: state.ownerId },
    });
    expect(totalCount).toBe(2);
  });
});
