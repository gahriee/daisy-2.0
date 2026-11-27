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
  ForbiddenError,
  ValidationError,
} from "../../../src/lib/errors";
import {
  getBusinessSettings,
  updateBusinessSettingsModule,
} from "../../../src/features/settings/service";
import { listAuditLogs } from "../../../src/features/audit/service";
import { lockActiveDeviceForShare } from "../../../src/server/auth/device";
import { consumeAuthLimit } from "../../../src/server/security/auth-security";
import { GET as getDevicesRoute } from "../../../src/app/api/devices/route";
import { POST as registerDeviceRoute } from "../../../src/app/api/devices/register/route";
import { POST as revokeDeviceRoute } from "../../../src/app/api/devices/[deviceId]/revoke/route";
import { GET as getNotificationsRoute } from "../../../src/app/api/notifications/route";
import { POST as readNotificationsRoute } from "../../../src/app/api/notifications/read/route";
import { POST as unreadNotificationsRoute } from "../../../src/app/api/notifications/unread/route";
import { POST as deleteNotificationsRoute } from "../../../src/app/api/notifications/delete/route";

const prefix = `settings-test-${randomUUID()}`;
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
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const db = state.db;
  if (!db) return;
  try {
    await db.notificationDismissal.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
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
    await db.device.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.businessSettings.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });
    await db.securityEvent.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.securityRateLimit.deleteMany({
      where: { key: { startsWith: `auth:${prefix}` } },
    });

    expect(
      await db.owner.count({ where: { id: { startsWith: prefix } } }),
    ).toBe(0);
    expect(
      await db.securityEvent.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.securityRateLimit.count({
        where: { key: { startsWith: `auth:${prefix}` } },
      }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("settings, devices, notifications and auth limits integration", () => {
  it("resolves env-backed policies and limits, enforces version preconditions, and records identifier-only audit", async () => {
    vi.stubEnv("BILLING_DAY_OF_MONTH", "5");
    vi.stubEnv("BILLING_GRACE_PERIOD_DAYS", "4");
    vi.stubEnv("BILLING_PRORATION_POLICY", "DAILY_30");
    vi.stubEnv("BILLING_DEPOSIT_POLICY", "APPLY_ON_MOVE_OUT");
    vi.stubEnv("BILLING_OVERPAYMENT_POLICY", "REJECT_OVERPAYMENT");
    vi.stubEnv("INVOICE_PREFIX", "inv-");
    vi.stubEnv("RECEIPT_PREFIX", "rcp-");
    vi.stubEnv("OFFLINE_UNLOCK_MAX_DAYS", "14");
    vi.stubEnv("PROOF_MAX_MB", "8");
    vi.stubEnv("PROOF_MAX_FILES_PER_RECORD", "6");
    vi.stubEnv("SEMAPHORE_API_KEY", "");

    const initial = await getBusinessSettings(state.ownerId);
    expect(initial.version).toBe(0);
    expect(initial.policiesComplete).toBe(true);
    expect(initial.stayScheduleComplete).toBe(true);
    expect(initial.billingDayOfMonth).toBe(5);
    expect(initial.invoicePrefix).toBe("INV-");
    expect(initial.receiptPrefix).toBe("RCP-");
    expect(initial.offlineUnlockMaxDays).toBe(14);
    expect(initial.proofMaxBytes).toBe(8 * 1024 * 1024);
    expect(initial.proofMaxFilesPerRecord).toBe(6);
    expect(initial.smsConfigured).toBe(false);

    // Enabling automatic overdue SMS without SEMAPHORE_API_KEY in env is rejected.
    await expect(
      updateBusinessSettingsModule(state.ownerId, {
        module: "property",
        expectedVersion: 0,
        businessName: "Daisy Boarding House",
        businessPhone: null,
        businessAddress: null,
        tin: null,
        checkInTimeManila: "14:00",
        checkOutTimeManila: "12:00",
        smsOverdueEnabled: true,
        smsOverdueSendTimeManila: "09:00",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    vi.stubEnv("SEMAPHORE_API_KEY", "sem_live_test_key");

    const v1 = await updateBusinessSettingsModule(state.ownerId, {
      module: "property",
      expectedVersion: 0,
      businessName: "  Daisy Boarding House  ",
      businessPhone: "+63 917 555 0100",
      businessAddress: "Quezon City",
      tin: null,
      checkInTimeManila: "15:00",
      checkOutTimeManila: "11:00",
      smsOverdueEnabled: true,
      smsOverdueSendTimeManila: "08:30",
    });
    expect(v1.version).toBe(1);
    expect(v1.businessName).toBe("Daisy Boarding House");
    expect(v1.checkInTimeManila).toBe("15:00");
    expect(v1.checkOutTimeManila).toBe("11:00");
    expect(v1.smsConfigured).toBe(true);
    expect(v1.smsOverdueEnabled).toBe(true);
    expect(v1.smsOverdueSendTimeManila).toBe("08:30");
    expect(v1.policiesComplete).toBe(true);

    // Stale expectedVersion must reject cleanly with ConflictError.
    await expect(
      updateBusinessSettingsModule(state.ownerId, {
        module: "property",
        expectedVersion: 0,
        businessName: "Stale overwrite",
        businessPhone: null,
        businessAddress: null,
        tin: null,
        checkInTimeManila: "14:00",
        checkOutTimeManila: "12:00",
        smsOverdueEnabled: false,
        smsOverdueSendTimeManila: "09:00",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // House rules update preserves property details and increments version.
    const v2 = await updateBusinessSettingsModule(state.ownerId, {
      module: "house_rules",
      expectedVersion: v1.version,
      transientPolicyNote: "1. Quiet hours at 10 PM.",
    });
    expect(v2.version).toBe(2);
    expect(v2.businessName).toBe("Daisy Boarding House");
    expect(v2.transientPolicyNote).toBe("1. Quiet hours at 10 PM.");

    const audit = await listAuditLogs(state.ownerId, { area: "settings" });
    expect(audit.entries).toHaveLength(2);
    expect(audit.entries[0]?.action).toBe("settings.updated");
    expect(audit.entries[0]?.entityId).toBe(v1.id);
  });

  it("registers devices with HttpOnly cookies, reuses active tokens, and revokes idempotently", async () => {
    // Unauthenticated and foreign-origin denials
    state.authenticated = false;
    const unauthRes = await getDevicesRoute(
      new Request("http://localhost:3000/api/devices"),
    );
    expect(unauthRes.status).toBe(401);

    state.authenticated = true;
    const foreignRes = await registerDeviceRoute(
      new Request("http://localhost:3000/api/devices/register", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "Evil" }),
      }),
    );
    expect(foreignRes.status).toBe(403);

    const regRes = await registerDeviceRoute(
      new Request("http://localhost:3000/api/devices/register", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "Owner phone" }),
      }),
    );
    expect(regRes.status).toBe(201);
    const regJson = (await regRes.json()) as {
      deviceId: string;
      reused: boolean;
    };
    expect(regJson.reused).toBe(false);

    const setCookie = regRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("daisy_device=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    const cookiePair = setCookie.split(";")[0] ?? "";
    const rawToken = decodeURIComponent(cookiePair.split("=")[1] ?? "");

    // Re-registering with the active cookie reuses the existing device.
    const reuseRes = await registerDeviceRoute(
      new Request("http://localhost:3000/api/devices/register", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          cookie: cookiePair,
        },
        body: JSON.stringify({ label: "Ignored new label" }),
      }),
    );
    expect(reuseRes.status).toBe(200);
    const reuseJson = (await reuseRes.json()) as {
      deviceId: string;
      reused: boolean;
    };
    expect(reuseJson.reused).toBe(true);
    expect(reuseJson.deviceId).toBe(regJson.deviceId);

    const listRes = await getDevicesRoute(
      new Request("http://localhost:3000/api/devices", {
        headers: { cookie: cookiePair },
      }),
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as {
      devices: Array<{ id: string; isCurrent: boolean; tokenHash?: string }>;
    };
    expect(listJson.devices).toHaveLength(1);
    expect(listJson.devices[0]?.isCurrent).toBe(true);
    expect(listJson.devices[0]?.tokenHash).toBeUndefined();

    // Concurrent idempotent revocation
    const [rev1, rev2] = await Promise.all([
      revokeDeviceRoute(
        new Request(
          `http://localhost:3000/api/devices/${regJson.deviceId}/revoke`,
          { method: "POST", headers: { origin: "http://localhost:3000" } },
        ),
        { params: Promise.resolve({ deviceId: regJson.deviceId }) },
      ),
      revokeDeviceRoute(
        new Request(
          `http://localhost:3000/api/devices/${regJson.deviceId}/revoke`,
          { method: "POST", headers: { origin: "http://localhost:3000" } },
        ),
        { params: Promise.resolve({ deviceId: regJson.deviceId }) },
      ),
    ]);
    expect(rev1.status).toBe(200);
    expect(rev2.status).toBe(200);

    // Revoked device is rejected under lockActiveDeviceForShare
    await expect(
      state.db!.$transaction((tx) =>
        lockActiveDeviceForShare(tx, state.ownerId, rawToken),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Unknown or foreign device returns 404
    const missingRev = await revokeDeviceRoute(
      new Request(`http://localhost:3000/api/devices/${randomUUID()}/revoke`, {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ deviceId: randomUUID() }) },
    );
    expect(missingRev.status).toBe(404);
  });

  it("throttles excessive concurrent login attempts in PostgreSQL", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        consumeAuthLimit(state.ownerId, "login"),
      ),
    );
    const allowed = results.filter((retry) => retry === 0);
    const throttled = results.filter((retry) => retry > 0);
    expect(allowed).toHaveLength(10);
    expect(throttled).toHaveLength(2);
  });

  it("projects notifications and persists read state per Owner", async () => {
    await state.db!.securityEvent.create({
      data: {
        ownerUserId: state.ownerId,
        operationId: randomUUID(),
        action: "RESET_COMPLETED",
      },
    });

    const res1 = await getNotificationsRoute();
    expect(res1.status).toBe(200);
    const json1 = (await res1.json()) as {
      notifications: Array<{ key: string; read: boolean }>;
    };
    const keys = json1.notifications.map((n) => n.key);
    expect(keys).not.toContain("settings:financial-policy-incomplete");
    expect(keys).not.toContain("settings:stay-schedule-incomplete");
    expect(keys.some((k) => k.startsWith("sec:"))).toBe(true);
    expect(json1.notifications.every((n) => !n.read)).toBe(true);

    const markRes = await readNotificationsRoute(
      new Request("http://localhost:3000/api/notifications/read", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ keys }),
      }),
    );
    expect(markRes.status).toBe(200);

    const res2 = await getNotificationsRoute();
    const json2 = (await res2.json()) as {
      notifications: Array<{ key: string; read: boolean }>;
    };
    expect(json2.notifications.every((n) => n.read)).toBe(true);

    const unreadTargetKey = keys[0]!;
    const unreadRes = await unreadNotificationsRoute(
      new Request("http://localhost:3000/api/notifications/unread", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ keys: [unreadTargetKey] }),
      }),
    );
    expect(unreadRes.status).toBe(200);

    const res3 = await getNotificationsRoute();
    const json3 = (await res3.json()) as {
      notifications: Array<{ key: string; read: boolean }>;
    };
    expect(
      json3.notifications.find((n) => n.key === unreadTargetKey)?.read,
    ).toBe(false);

    const deleteRes = await deleteNotificationsRoute(
      new Request("http://localhost:3000/api/notifications/delete", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ keys: [unreadTargetKey] }),
      }),
    );
    expect(deleteRes.status).toBe(200);

    const res4 = await getNotificationsRoute();
    const json4 = (await res4.json()) as {
      notifications: Array<{ key: string; read: boolean }>;
    };
    expect(json4.notifications.some((n) => n.key === unreadTargetKey)).toBe(
      false,
    );
  });
});
