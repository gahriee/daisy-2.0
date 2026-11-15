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
import { createHash, randomUUID } from "node:crypto";
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
  ValidationError,
} from "../../../src/lib/errors";
import {
  createBed,
  createRoom,
  createRoomType,
} from "../../../src/features/rooms/service";
import {
  archiveTenantContract,
  createTenantContract,
  createTenantContractIntent,
  getTenantContractDetail,
  uploadTenantContractThroughProxy,
} from "../../../src/features/tenants/contracts";
import {
  assignTenantToBed,
  createTenant,
  getTenantDetail,
} from "../../../src/features/tenants/service";
import { POST as createContractIntentRoute } from "../../../src/app/api/tenants/contracts/intent/route";
import { PUT as uploadContractIntentRoute } from "../../../src/app/api/tenants/contracts/intents/[intentId]/route";
import { GET as getContractPageRoute } from "../../../src/app/api/tenants/contracts/pages/[pageId]/route";

const prefix = `tc-test-${randomUUID()}`;
let seq = 0;

function makeSampleJpeg(fillByte: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    fillByte,
    fillByte + 1,
    0xff,
    0xd9,
  ]);
}

function makeSamplePdf(): Uint8Array {
  return new Uint8Array(Buffer.from("%PDF-1.4\n%Daisy test PDF\n%%EOF\n"));
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
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const db = state.db;
  if (!db) return;
  try {
    await db.securityRateLimit.deleteMany({
      where: { key: { startsWith: `tenant-contract-upload:${prefix}` } },
    });
    await db.tenantContractPage.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.tenantContract.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.tenantContractIntent.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
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
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });

    expect(
      await db.tenantContractPage.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.tenantContract.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.tenantContractIntent.count({
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

describe("signed tenant contract storage, scanner pages, and Owner isolation integration", () => {
  it("validates upload intents and signatures, saves multi-page JPEG + PDF contracts, isolates page access, emits audit/feed, and archives safely", async () => {
    const db = state.db!;

    const boardingType = await createRoomType(state.ownerId, {
      building: "BOARDING",
      name: "Standard Single",
      monthlyRate: "4500",
    });
    const room = await createRoom(state.ownerId, {
      building: "BOARDING",
      number: "105",
      roomTypeId: boardingType.id,
      capacity: 1,
    });
    const bed = await createBed(state.ownerId, {
      roomId: room.id,
      number: "A",
      monthlyRate: "4500",
    });
    const tenant = await createTenant(state.ownerId, {
      fullName: "Elena Reyes",
      phone: "+63 917 555 1234",
    });
    const assignment = await assignTenantToBed(
      state.ownerId,
      {
        tenantId: tenant.id,
        bedId: bed.id,
        startDateManila: "2026-11-14",
        endDateManila: "2027-05-14",
        monthlyRate: "4500",
        securityDeposit: "4500",
      },
      new Date("2026-11-14T04:00:00.000Z"),
    );

    // Unauthenticated & cross-origin requests are blocked cleanly.
    state.authenticated = false;
    const unauthIntentRes = await createContractIntentRoute(
      new Request("http://localhost:3000/api/tenants/contracts/intent", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(unauthIntentRes.status).toBe(401);
    state.authenticated = true;

    const foreignOriginRes = await createContractIntentRoute(
      new Request("http://localhost:3000/api/tenants/contracts/intent", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(foreignOriginRes.status).toBe(403);

    // Reject forged content claiming to be PDF.
    const fakePdfBytes = new Uint8Array(Buffer.from("not-a-pdf-payload"));
    const fakeIntent = await createTenantContractIntent({
      ownerUserId: state.ownerId,
      rawInput: {
        tenantId: tenant.id,
        fileName: "forged.pdf",
        mimeType: "application/pdf",
        byteSize: fakePdfBytes.byteLength,
        sha256: createHash("sha256").update(fakePdfBytes).digest("hex"),
      },
    });
    await expect(
      uploadTenantContractThroughProxy({
        ownerUserId: state.ownerId,
        intentId: fakeIntent.intentId,
        contentType: "application/pdf",
        bytes: fakePdfBytes,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Upload scanned JPEG page via Route Handlers + PDF page via service helpers.
    const jpegBytes = makeSampleJpeg(12);
    const jpegSha = createHash("sha256").update(jpegBytes).digest("hex");
    const jpegIntentRes = await createContractIntentRoute(
      new Request("http://localhost:3000/api/tenants/contracts/intent", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantId: tenant.id,
          fileName: "contract-page-1.jpg",
          mimeType: "image/jpeg",
          byteSize: jpegBytes.byteLength,
          sha256: jpegSha,
        }),
      }),
    );
    expect(jpegIntentRes.status).toBe(201);
    const jpegIntent = (await jpegIntentRes.json()) as {
      intentId: string;
      uploadUrl: string;
    };

    const jpegPutRes = await uploadContractIntentRoute(
      new Request(`http://localhost:3000${jpegIntent.uploadUrl}`, {
        method: "PUT",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "image/jpeg",
        },
        body: jpegBytes as unknown as BodyInit,
      }),
      { params: Promise.resolve({ intentId: jpegIntent.intentId }) },
    );
    expect(jpegPutRes.status).toBe(200);

    const pdfBytes = makeSamplePdf();
    const pdfSha = createHash("sha256").update(pdfBytes).digest("hex");
    const pdfIntent = await createTenantContractIntent({
      ownerUserId: state.ownerId,
      rawInput: {
        tenantId: tenant.id,
        fileName: "rules-addendum.pdf",
        mimeType: "application/pdf",
        byteSize: pdfBytes.byteLength,
        sha256: pdfSha,
      },
    });
    await uploadTenantContractThroughProxy({
      ownerUserId: state.ownerId,
      intentId: pdfIntent.intentId,
      contentType: "application/pdf",
      bytes: pdfBytes,
    });

    // Foreign-owner tenant intent must reject with NotFoundError.
    await expect(
      createTenantContractIntent({
        ownerUserId: `${prefix}-foreign`,
        rawInput: {
          tenantId: tenant.id,
          fileName: "leak.pdf",
          mimeType: "application/pdf",
          byteSize: pdfBytes.byteLength,
          sha256: pdfSha,
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Save multi-page contract linked to assignment.
    const saved = await createTenantContract(state.ownerId, {
      tenantId: tenant.id,
      assignmentId: assignment.id,
      title: "Room 105 Signed Contract",
      signedDateManila: "2026-11-14",
      notes: "Signed by Elena Reyes with witness signature",
      pages: [
        {
          intentId: jpegIntent.intentId,
          filterMode: "MAGIC_WHITE",
          label: "Main Agreement",
        },
        {
          intentId: pdfIntent.intentId,
          filterMode: "ORIGINAL",
          label: "House Rules Addendum",
        },
      ],
    });

    expect(saved.title).toBe("Room 105 Signed Contract");
    expect(saved.assignmentRoomNumber).toBe("105");
    expect(saved.pageCount).toBe(2);
    expect(saved.pages.map((p) => p.filterMode)).toEqual([
      "MAGIC_WHITE",
      "ORIGINAL",
    ]);

    // Reusing already attached intent fails cleanly with ConflictError.
    await expect(
      createTenantContract(state.ownerId, {
        tenantId: tenant.id,
        title: "Duplicate reuse",
        pages: [{ intentId: jpegIntent.intentId, filterMode: "ORIGINAL" }],
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Detail queries reflect contract inside both getTenantDetail & getTenantContractDetail.
    const tenantDetail = await getTenantDetail(state.ownerId, tenant.id);
    expect(tenantDetail?.contracts.map((c) => c.id)).toEqual([saved.id]);

    const contractDetail = await getTenantContractDetail(
      state.ownerId,
      tenant.id,
      saved.id,
    );
    expect(contractDetail?.pages).toHaveLength(2);

    // Owner GET serves private bytes with private, no-store & nosniff; foreign owner receives 404.
    const page1 = saved.pages[0]!;
    const pageRes = await getContractPageRoute(
      new Request(`http://localhost:3000${page1.url}`),
      { params: Promise.resolve({ pageId: page1.id }) },
    );
    expect(pageRes.status).toBe(200);
    expect(pageRes.headers.get("content-type")).toBe("image/jpeg");
    expect(pageRes.headers.get("cache-control")).toBe("private, no-store");
    expect(pageRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await pageRes.arrayBuffer())).toEqual(jpegBytes);

    const savedOwnerId = state.ownerId;
    state.ownerId = `${prefix}-foreign`;
    const foreignPageRes = await getContractPageRoute(
      new Request(`http://localhost:3000${page1.url}`),
      { params: Promise.resolve({ pageId: page1.id }) },
    );
    expect(foreignPageRes.status).toBe(404);
    state.ownerId = savedOwnerId;

    // Optimistic lock + soft archival tombstone.
    const archived = await archiveTenantContract(state.ownerId, {
      tenantId: tenant.id,
      contractId: saved.id,
      expectedVersion: saved.version,
    });
    expect(archived.version).toBe(2);
    expect(archived.archivedAt).not.toBeNull();

    await expect(
      archiveTenantContract(state.ownerId, {
        tenantId: tenant.id,
        contractId: saved.id,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // AuditLog is identifier-only (no contract title or notes text) and ChangeFeed tracks upsert + tombstone.
    const auditLogs = await db.auditLog.findMany({
      where: {
        ownerUserId: state.ownerId,
        entityType: "tenant_contract",
      },
      orderBy: { sequence: "asc" },
    });
    expect(auditLogs.map((a) => a.action)).toEqual([
      "tenant_contract.created",
      "tenant_contract.archived",
    ]);
    const serializedAudit = JSON.stringify(auditLogs, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(serializedAudit).not.toContain("Room 105 Signed Contract");
    expect(serializedAudit).not.toContain("witness signature");

    const feedEntries = await db.changeFeed.findMany({
      where: {
        ownerUserId: state.ownerId,
        entityType: "tenant_contract",
      },
      orderBy: { sequence: "asc" },
    });
    expect(feedEntries.map((f) => f.operation)).toEqual([
      "upsert",
      "tombstone",
    ]);
  }, 45_000);
});
