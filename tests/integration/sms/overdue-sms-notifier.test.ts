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
  getBusinessSettings,
  updateBusinessSettingsModule,
} from "../../../src/features/settings/service";
import {
  sendOverdueSmsBatch,
  sendOverdueSmsForInvoice,
} from "../../../src/features/sms/service";
import { POST as overdueSmsCronRoute } from "../../../src/app/api/jobs/billing/overdue-sms/route";

const prefix = `sms-test-${randomUUID()}`;
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
  vi.stubEnv("OWNER_USER_ID", state.ownerId);
  vi.stubEnv("SYNC_CURSOR_SECRET", "integration-test-secret-key-material");
  vi.stubEnv("CRON_SECRET", "integration-test-cron-secret");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const db = state.db;
  if (!db) return;
  try {
    await db.overdueSmsLog.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.invoiceItem.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.invoice.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.tenant.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.transientGuest.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.auditLog.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.businessSettings.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });
    await db.securityRateLimit.deleteMany({
      where: { key: { startsWith: `sms:${prefix}` } },
    });

    const remainingOwners = await db.owner.count({
      where: { id: { startsWith: prefix } },
    });
    expect(remainingOwners).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("boarding house overdue SMS notifier (Semaphore) integration", () => {
  it("reads Semaphore credentials from env, never exposes secrets in settings DTO, and sends deduplicated overdue SMS with PII-free audits", async () => {
    const db = state.db!;
    const ownerId = state.ownerId;

    vi.stubEnv("SEMAPHORE_API_KEY", "sem_live_secret_key_9988");
    vi.stubEnv("SEMAPHORE_SENDER_NAME", "DAISYBH");
    vi.stubEnv("SEMAPHORE_OVERDUE_FREQUENCY_DAYS", "1");
    vi.stubEnv(
      "SEMAPHORE_OVERDUE_TEMPLATE",
      "Hello {{tenantName}}, bill {{invoiceNumber}} (Room {{roomNumber}}) balance {{balance}} is {{daysOverdue}}d overdue.",
    );

    // 1. Enable overdue SMS via simplified Property settings module
    const saved = await updateBusinessSettingsModule(ownerId, {
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
    });

    expect(saved.smsOverdueEnabled).toBe(true);
    expect(saved.smsConfigured).toBe(true);
    expect(JSON.stringify(saved)).not.toContain("sem_live_secret_key_9988");

    const fetched = await getBusinessSettings(ownerId);
    expect(fetched.smsConfigured).toBe(true);

    // 2. Seed an overdue boarding house tenant invoice, a no-phone tenant, and a transient invoice
    const tenantWithPhone = await db.tenant.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerId,
        fullName: "Juan Dela Cruz",
        phone: "+63 917-555-1234",
      },
    });
    const tenantNoPhone = await db.tenant.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerId,
        fullName: "No Phone Boarder",
        phone: null,
      },
    });
    const transientGuest = await db.transientGuest.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerId,
        fullName: "Short Stay Guest",
        phone: "09181112222",
      },
    });

    const overdueInvoice = await db.invoice.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerId,
        tenantId: tenantWithPhone.id,
        invoiceNumber: "INV-2026-000101",
        billingPeriod: "2026-11",
        periodStartDate: new Date("2026-10-31T16:00:00.000Z"),
        periodEndDate: new Date("2026-11-30T16:00:00.000Z"),
        dueDate: new Date("2026-11-05T16:00:00.000Z"), // 2026-11-06 Manila
        status: "ISSUED",
        subtotalAmount: "4500.00",
        adjustmentAmount: "0.00",
        totalAmount: "4500.00",
        paidAmount: "500.00",
        snapshotTenantName: tenantWithPhone.fullName,
        snapshotRoomNumber: "204",
      },
    });

    await db.invoice.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerId,
        tenantId: tenantNoPhone.id,
        invoiceNumber: "INV-2026-000102",
        billingPeriod: "2026-11",
        periodStartDate: new Date("2026-10-31T16:00:00.000Z"),
        periodEndDate: new Date("2026-11-30T16:00:00.000Z"),
        dueDate: new Date("2026-11-05T16:00:00.000Z"),
        status: "ISSUED",
        subtotalAmount: "3000.00",
        adjustmentAmount: "0.00",
        totalAmount: "3000.00",
        paidAmount: "0.00",
        snapshotTenantName: tenantNoPhone.fullName,
        snapshotRoomNumber: "205",
      },
    });

    const transientInvoice = await db.invoice.create({
      data: {
        id: randomUUID(),
        ownerUserId: ownerId,
        transientGuestId: transientGuest.id,
        invoiceNumber: "INV-2026-000103",
        billingPeriod: null,
        periodStartDate: new Date("2026-11-01T16:00:00.000Z"),
        periodEndDate: new Date("2026-11-02T16:00:00.000Z"),
        dueDate: new Date("2026-11-05T16:00:00.000Z"),
        status: "ISSUED",
        subtotalAmount: "1200.00",
        adjustmentAmount: "0.00",
        totalAmount: "1200.00",
        paidAmount: "0.00",
        snapshotTenantName: transientGuest.fullName,
        snapshotRoomNumber: "T1",
      },
    });

    const sentCalls: Array<{
      apiKey: string;
      recipient: string;
      message: string;
      senderName?: string | null;
    }> = [];
    const mockSender = vi.fn(async (params) => {
      sentCalls.push(params);
      return {
        messageId: "777001",
        status: "Pending",
        network: "Globe",
      };
    });

    const nowUtc = new Date("2026-11-10T01:00:00.000Z"); // 2026-11-10 09:00 Manila (4 days overdue)

    // 3. Batch send notifies only boarding house overdue tenant with valid PH phone
    const batch1 = await sendOverdueSmsBatch(ownerId, {
      nowUtc,
      requireEnabled: true,
      sender: mockSender,
      actor: {
        actorType: "scheduled_job",
        actorId: "cron:billing-overdue-sms",
      },
      skipRateLimit: true,
    });

    expect(batch1).toEqual({
      notifiedDateManila: "2026-11-10",
      evaluatedCount: 2,
      sentCount: 1,
      alreadySentTodayCount: 0,
      skippedNoPhoneCount: 1,
      skippedInvalidPhoneCount: 0,
      failedCount: 0,
    });
    expect(sentCalls).toHaveLength(1);
    expect(sentCalls[0]?.apiKey).toBe("sem_live_secret_key_9988");
    expect(sentCalls[0]?.recipient).toBe("09175551234");
    expect(sentCalls[0]?.senderName).toBe("DAISYBH");
    expect(sentCalls[0]?.message).toContain("Juan Dela Cruz");
    expect(sentCalls[0]?.message).toContain("INV-2026-000101");
    expect(sentCalls[0]?.message).toContain("Room 204");
    expect(sentCalls[0]?.message).toContain("4,000.00");
    expect(sentCalls[0]?.message).toContain("4d overdue");

    // 4. Re-running on the same Manila day deduplicates cleanly
    const batch2 = await sendOverdueSmsBatch(ownerId, {
      nowUtc,
      requireEnabled: true,
      sender: mockSender,
      actor: {
        actorType: "scheduled_job",
        actorId: "cron:billing-overdue-sms",
      },
      skipRateLimit: true,
    });
    expect(batch2.sentCount).toBe(0);
    expect(batch2.alreadySentTodayCount).toBe(1);
    expect(mockSender).toHaveBeenCalledTimes(1);

    // 5. Single-invoice manual send respects same-day dedupe and rejects transient invoices
    const singleAgain = await sendOverdueSmsForInvoice(
      ownerId,
      { invoiceId: overdueInvoice.id, forceResendToday: false },
      { nowUtc, sender: mockSender },
    );
    expect(singleAgain.alreadySentToday).toBe(true);

    await expect(
      sendOverdueSmsForInvoice(
        ownerId,
        { invoiceId: transientInvoice.id, forceResendToday: false },
        { nowUtc, sender: mockSender },
      ),
    ).rejects.toThrow("boarding house tenant invoices only");

    // 6. Audit log is identifier-only (zero phone, zero message body, zero API key)
    const audits = await db.auditLog.findMany({
      where: { ownerUserId: ownerId, action: "billing.overdue_sms_sent" },
    });
    expect(audits).toHaveLength(1);
    const auditSerialized = JSON.stringify(audits[0]);
    expect(auditSerialized).toContain(overdueInvoice.id);
    expect(auditSerialized).not.toContain("09175551234");
    expect(auditSerialized).not.toContain("Juan Dela Cruz");
    expect(auditSerialized).not.toContain("sem_live_secret_key_9988");

    // 7. Cron route rejects unauthorized calls and succeeds with valid CRON_SECRET
    const unauthRes = await overdueSmsCronRoute(
      new Request("http://localhost:3000/api/jobs/billing/overdue-sms", {
        method: "POST",
      }),
    );
    expect(unauthRes.status).toBe(401);

    // Disable automatic SMS so cron route executes cleanly without hitting live network
    await updateBusinessSettingsModule(ownerId, {
      module: "property",
      expectedVersion: saved.version,
      businessName: "Daisy Boarding House",
      businessPhone: null,
      businessAddress: null,
      tin: null,
      checkInTimeManila: "14:00",
      checkOutTimeManila: "12:00",
      smsOverdueEnabled: false,
      smsOverdueSendTimeManila: "09:00",
    });
    const authRes = await overdueSmsCronRoute(
      new Request("http://localhost:3000/api/jobs/billing/overdue-sms", {
        method: "POST",
        headers: { authorization: "Bearer integration-test-cron-secret" },
      }),
    );
    expect(authRes.status).toBe(200);
    const authJson = (await authRes.json()) as {
      ok: boolean;
      summary: { sentCount: number };
    };
    expect(authJson.ok).toBe(true);
    expect(authJson.summary.sentCount).toBe(0);
  });
});
