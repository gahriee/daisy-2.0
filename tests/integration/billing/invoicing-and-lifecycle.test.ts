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
  PreconditionError,
  ValidationError,
} from "../../../src/lib/errors";
import { listAuditLogs } from "../../../src/features/audit/service";
import {
  addInvoiceAdjustment,
  createManualInvoice,
  generatePeriodInvoices,
  getBillingCreateContext,
  getBillingOverview,
  getInvoiceDetail,
  issueDraftInvoice,
  voidInvoice,
} from "../../../src/features/billing/service";
import { createBed, createRoom } from "../../../src/features/rooms/service";
import { updateBusinessSettingsModule } from "../../../src/features/settings/service";
import {
  assignTenantToBed,
  createTenant,
  getTenantDetail,
  listTenantsOverview,
} from "../../../src/features/tenants/service";
import { listOwnerNotifications } from "../../../src/server/notifications/service";
import { GET as getBillingRoute } from "../../../src/app/api/billing/route";
import { POST as runScheduledBillingRoute } from "../../../src/app/api/jobs/billing/generate/route";

const prefix = `billing-test-${randomUUID()}`;
let seq = 0;

async function configureOwnerSettings(ownerId: string) {
  vi.stubEnv("BILLING_DAY_OF_MONTH", "5");
  vi.stubEnv("BILLING_GRACE_PERIOD_DAYS", "5");
  vi.stubEnv("BILLING_PRORATION_POLICY", "DAILY_EXACT");
  vi.stubEnv("BILLING_DEPOSIT_POLICY", "HOLD_SEPARATE");
  vi.stubEnv("BILLING_OVERPAYMENT_POLICY", "REJECT_OVERPAYMENT");
  vi.stubEnv("INVOICE_PREFIX", "INV");
  vi.stubEnv("RECEIPT_PREFIX", "OR");
  await updateBusinessSettingsModule(ownerId, {
    module: "property",
    expectedVersion: 0,
    businessName: "Daisy Test Boarding House",
    businessPhone: null,
    businessAddress: null,
    tin: null,
    checkInTimeManila: "14:00",
    checkOutTimeManila: "12:00",
    smsOverdueEnabled: false,
    smsOverdueSendTimeManila: "09:00",
  });
}

async function seedTenantWithBedAssignment(
  ownerId: string,
  options?: { startDateManila?: string; endDateManila?: string },
) {
  const room = await createRoom(ownerId, {
    number: `R-${randomUUID().slice(0, 4)}`,
    floor: "1F",
    capacity: 2,
    baseMonthlyRate: "6000.00",
    transientDailyRate: null,
    notes: null,
  });
  const bed = await createBed(ownerId, {
    roomId: room.id,
    number: "B1",
    label: "Lower",
    monthlyRate: "6000.00",
    dailyRate: null,
  });
  const tenant = await createTenant(ownerId, {
    fullName: "Maria Clara Test",
    phone: "09170000001",
    email: null,
    address: null,
    emergencyContact: null,
    notes: null,
  });
  const assignment = await assignTenantToBed(ownerId, {
    tenantId: tenant.id,
    bedId: bed.id,
    startDateManila: options?.startDateManila ?? "2026-11-16",
    endDateManila: options?.endDateManila ?? "2027-02-01",
    monthlyRate: "6000.00",
    securityDeposit: "3000.00",
    notes: null,
  });
  return { tenant, assignment };
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

afterAll(async () => {
  vi.unstubAllEnvs();
  const db = state.db;
  if (!db) return;
  try {
    await db.invoiceAdjustment.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.invoiceItem.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.invoice.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.documentSequence.deleteMany({
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
    await db.businessSettings.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.owner.deleteMany({
      where: { id: { startsWith: prefix } },
    });

    const leftoverInvoices = await db.invoice.count({
      where: { ownerUserId: { startsWith: prefix } },
    });
    expect(leftoverInvoices).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

describe("billing and invoicing integration", () => {
  it("resolves env-backed billing policies cleanly even before BusinessSettings row exists", async () => {
    vi.stubEnv("BILLING_DAY_OF_MONTH", "1");
    vi.stubEnv("BILLING_GRACE_PERIOD_DAYS", "5");
    vi.stubEnv("BILLING_PRORATION_POLICY", "DAILY_EXACT");
    vi.stubEnv("BILLING_DEPOSIT_POLICY", "HOLD_SEPARATE");
    vi.stubEnv("INVOICE_PREFIX", "INV-");

    const result = await generatePeriodInvoices(state.ownerId, {
      billingPeriod: "2026-11",
      issueImmediately: false,
    });
    expect(result.createdCount).toBe(0);
    expect(result.skippedExistingCount).toBe(0);
  });

  it("generates prorated period invoices idempotently and serializes official numbering", async () => {
    const db = state.db!;
    await configureOwnerSettings(state.ownerId);
    const { tenant } = await seedTenantWithBedAssignment(state.ownerId);

    const first = await generatePeriodInvoices(state.ownerId, {
      billingPeriod: "2026-11",
      issueImmediately: false,
    });
    expect(first).toEqual({
      billingPeriod: "2026-11",
      createdCount: 1,
      issuedCount: 0,
      skippedExistingCount: 0,
      skippedZeroAmountCount: 0,
    });

    // Idempotent second run skips existing non-voided period invoice.
    const second = await generatePeriodInvoices(state.ownerId, {
      billingPeriod: "2026-11",
      issueImmediately: true,
    });
    expect(second.createdCount).toBe(0);
    expect(second.skippedExistingCount).toBe(1);

    const overview = await getBillingOverview(state.ownerId);
    expect(overview.invoices).toHaveLength(1);
    const draft = overview.invoices[0]!;
    expect(draft.status).toBe("DRAFT");
    expect(draft.invoiceNumber).toBeNull();
    expect(draft.totalAmount).toBe("6000.00"); // 3000 prorated rent + 3000 security deposit
    expect(draft.dueDateManila).toBe("2026-11-10");

    // Stale version fails on issue.
    await expect(
      issueDraftInvoice(state.ownerId, {
        invoiceId: draft.id,
        expectedVersion: 99,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const issued = await issueDraftInvoice(state.ownerId, {
      invoiceId: draft.id,
      expectedVersion: draft.version,
    });
    expect(issued.status).toBe("ISSUED");
    expect(issued.invoiceNumber).toBe("INV-2026-000001");
    expect(issued.version).toBe(2);

    // Tenant derived balance now reflects open issued invoice.
    const tenantsOverview = await listTenantsOverview(state.ownerId);
    expect(tenantsOverview.tenants[0]?.derivedBalance).toBe("6000.00");
    const detail = await getTenantDetail(state.ownerId, tenant.id);
    expect(detail?.derivedBalance).toBe("6000.00");
    expect(detail?.invoices).toHaveLength(1);

    // Identifier-only AuditLog + ChangeFeed entries committed.
    const audit = await listAuditLogs(state.ownerId, { area: "billing" });
    expect(audit.entries.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(audit.entries)).not.toContain("Maria Clara Test");

    const feeds = await db.changeFeed.findMany({
      where: { ownerUserId: state.ownerId, entityType: "invoice" },
      orderBy: { sequence: "asc" },
    });
    expect(feeds).toHaveLength(2);
    expect(Number(feeds[1]!.sequence)).toBeGreaterThan(
      Number(feeds[0]!.sequence),
    );
  });

  it("supports linked adjustments, voiding with history, and period regeneration after void", async () => {
    await configureOwnerSettings(state.ownerId);
    await seedTenantWithBedAssignment(state.ownerId, {
      startDateManila: "2026-11-01",
      endDateManila: "2027-02-01",
    });

    await generatePeriodInvoices(state.ownerId, {
      billingPeriod: "2026-11",
      issueImmediately: true,
    });
    const overview = await getBillingOverview(state.ownerId);
    const issued = overview.invoices[0]!;
    expect(issued.invoiceNumber).toBe("INV-2026-000001");
    expect(issued.totalAmount).toBe("9000.00");

    // Credit exceeding total is rejected.
    await expect(
      addInvoiceAdjustment(state.ownerId, {
        invoiceId: issued.id,
        expectedVersion: issued.version,
        type: "CREDIT",
        amount: "9500.00",
        reason: "Invalid oversized credit",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const adjusted = await addInvoiceAdjustment(state.ownerId, {
      invoiceId: issued.id,
      expectedVersion: issued.version,
      type: "CREDIT",
      amount: "500.00",
      reason: "Move-in promotion",
    });
    expect(adjusted.adjustmentAmount).toBe("-500.00");
    expect(adjusted.totalAmount).toBe("8500.00");
    expect(adjusted.adjustments).toHaveLength(1);

    // Void retains history and permits re-generation for the same period.
    const voided = await voidInvoice(state.ownerId, {
      invoiceId: adjusted.id,
      expectedVersion: adjusted.version,
      reason: "Recalculating rent tier",
    });
    expect(voided.status).toBe("VOID");
    expect(voided.balanceAmount).toBe("0.00");

    const regen = await generatePeriodInvoices(state.ownerId, {
      billingPeriod: "2026-11",
      issueImmediately: true,
    });
    expect(regen.createdCount).toBe(1);
    const afterRegen = await getBillingOverview(state.ownerId);
    expect(afterRegen.invoices).toHaveLength(2);
    expect(afterRegen.invoices[0]?.invoiceNumber).toBe("INV-2026-000002");
  });

  it("blocks voiding when payments exist and projects overdue alerts without tenant PII", async () => {
    const db = state.db!;
    await configureOwnerSettings(state.ownerId);
    const { tenant } = await seedTenantWithBedAssignment(state.ownerId);

    const overdueManual = await createManualInvoice(state.ownerId, {
      tenantId: tenant.id,
      billingPeriod: null,
      periodStartManila: "2026-01-01",
      periodEndManila: "2026-02-01",
      dueDateManila: "2026-01-10",
      issueImmediately: true,
      notes: "Past due balance",
      items: [
        {
          itemType: "RENT",
          description: "January rent",
          quantity: "1.00",
          unitAmount: "2000.00",
        },
      ],
    });
    expect(overdueManual.isOverdue).toBe(true);

    const notifications = await listOwnerNotifications(state.ownerId);
    const overdueAlert = notifications.find((n) =>
      n.key.startsWith(`invoice:overdue:${overdueManual.id}`),
    );
    expect(overdueAlert).toBeDefined();
    expect(overdueAlert?.destination).toBe(
      `/billing?invoiceId=${overdueManual.id}`,
    );
    expect(overdueAlert?.message).not.toContain("Maria Clara Test");

    // Simulate a recorded partial payment on the row and confirm voiding is blocked.
    await db.invoice.update({
      where: { id: overdueManual.id },
      data: { paidAmount: "500.00", status: "PARTIALLY_PAID" },
    });

    await expect(
      voidInvoice(state.ownerId, {
        invoiceId: overdueManual.id,
        expectedVersion: overdueManual.version,
        reason: "Attempt void with payment",
      }),
    ).rejects.toBeInstanceOf(PreconditionError);
  });

  it("protects /api/billing and /api/jobs/billing/generate authorization", async () => {
    await configureOwnerSettings(state.ownerId);
    await seedTenantWithBedAssignment(state.ownerId);

    state.authenticated = false;
    const unauthRes = await getBillingRoute();
    expect(unauthRes.status).toBe(401);

    state.authenticated = true;
    const okRes = await getBillingRoute();
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("cache-control")).toBe("private, no-store");

    vi.stubEnv("CRON_SECRET", "test-cron-secret-value");
    const badCronRes = await runScheduledBillingRoute(
      new Request("http://localhost:3000/api/jobs/billing/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer wrong-secret",
        },
        body: JSON.stringify({ billingPeriod: "2026-11" }),
      }),
    );
    expect(badCronRes.status).toBe(401);

    const okCronRes = await runScheduledBillingRoute(
      new Request("http://localhost:3000/api/jobs/billing/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-cron-secret-value",
        },
        body: JSON.stringify({
          billingPeriod: "2026-11",
          issueImmediately: true,
        }),
      }),
    );
    expect(okCronRes.status).toBe(200);
    const cronPayload = (await okCronRes.json()) as {
      ok: boolean;
      summary: { createdCount: number; issuedCount: number };
    };
    expect(cronPayload.ok).toBe(true);
    expect(cronPayload.summary.createdCount).toBe(1);
    expect(cronPayload.summary.issuedCount).toBe(1);
  });

  it("loads create-context and owner-scoped invoice detail cleanly", async () => {
    await configureOwnerSettings(state.ownerId);
    const { tenant } = await seedTenantWithBedAssignment(state.ownerId);

    const context = await getBillingCreateContext(state.ownerId);
    expect(context.hasInvoicePrefix).toBe(true);
    expect(context.tenants.some((t) => t.id === tenant.id)).toBe(true);

    const created = await createManualInvoice(state.ownerId, {
      tenantId: tenant.id,
      billingPeriod: null,
      periodStartManila: "2026-11-01",
      periodEndManila: "2026-12-01",
      dueDateManila: "2026-11-25",
      issueImmediately: false,
      notes: "Utility bill",
      items: [
        {
          itemType: "UTILITY",
          description: "Water share",
          quantity: "1",
          unitAmount: "350.00",
        },
      ],
    });

    const detail = await getInvoiceDetail(state.ownerId, created.id);
    expect(detail?.invoice.id).toBe(created.id);
    expect(detail?.hasInvoicePrefix).toBe(true);

    expect(
      await getInvoiceDetail(`${state.ownerId}-other`, created.id),
    ).toBeNull();
    expect(await getInvoiceDetail(state.ownerId, randomUUID())).toBeNull();
  });
});
