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
  signPrivateDownload: async (key: string) =>
    `https://storage.example.test/download/${encodeURIComponent(key)}?sig=ok`,
}));

import {
  ConflictError,
  ForbiddenError,
  PreconditionError,
  ValidationError,
} from "../../../src/lib/errors";
import { listAuditLogs } from "../../../src/features/audit/service";
import {
  createManualInvoice,
  issueDraftInvoice,
  voidInvoice,
} from "../../../src/features/billing/service";
import {
  registerOwnerDevice,
  revokeOwnerDevice,
} from "../../../src/server/auth/device";
import { updateBusinessSettingsModule } from "../../../src/features/settings/service";
import {
  createTenant,
  getTenantDetail,
} from "../../../src/features/tenants/service";
import {
  applyTenantCredit,
  getPaymentCreateContext,
  getPaymentDetail,
  getPaymentsOverview,
  recordPayment,
  reversePayment,
} from "../../../src/features/payments/service";
import { applyPaymentSyncOperation } from "../../../src/features/payments/sync-handler";
import { GET as getPaymentsRoute } from "../../../src/app/api/payments/route";
import { POST as createProofIntentRoute } from "../../../src/app/api/payments/proofs/intent/route";
import { PUT as uploadProofIntentRoute } from "../../../src/app/api/payments/proofs/intents/[intentId]/route";
import { GET as downloadProofRoute } from "../../../src/app/api/payments/proofs/[proofId]/download/route";

const prefix = `pay-test-${randomUUID()}`;
let seq = 0;

async function configureOwnerSettings(
  ownerId: string,
  overpaymentPolicy:
    "REJECT_OVERPAYMENT" | "CREDIT_NEXT_INVOICE" = "REJECT_OVERPAYMENT",
) {
  vi.stubEnv("BILLING_DAY_OF_MONTH", "5");
  vi.stubEnv("BILLING_GRACE_PERIOD_DAYS", "5");
  vi.stubEnv("BILLING_PRORATION_POLICY", "DAILY_EXACT");
  vi.stubEnv("BILLING_DEPOSIT_POLICY", "HOLD_SEPARATE");
  vi.stubEnv("BILLING_OVERPAYMENT_POLICY", overpaymentPolicy);
  vi.stubEnv("INVOICE_PREFIX", "INV");
  vi.stubEnv("RECEIPT_PREFIX", "OR");
  vi.stubEnv("PROOF_MAX_MB", "5");
  vi.stubEnv("PROOF_MAX_FILES_PER_RECORD", "5");
  await updateBusinessSettingsModule(ownerId, {
    module: "property",
    expectedVersion: 0,
    businessName: "Daisy Payments Test Property",
    businessPhone: null,
    businessAddress: null,
    tin: null,
    checkInTimeManila: "14:00",
    checkOutTimeManila: "12:00",
    smsOverdueEnabled: false,
    smsOverdueSendTimeManila: "09:00",
  });
}

async function seedIssuedInvoice(
  ownerId: string,
  tenantId: string,
  amount: string,
  dueDateManila = "2026-11-20",
) {
  return createManualInvoice(ownerId, {
    tenantId,
    billingPeriod: null,
    periodStartManila: "2026-11-01",
    periodEndManila: "2026-12-01",
    dueDateManila,
    issueImmediately: true,
    notes: null,
    items: [
      {
        itemType: "RENT",
        description: "Monthly boarding fee",
        quantity: "1",
        unitAmount: amount,
      },
    ],
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
  state.storageObjects.clear();
  vi.stubEnv("OWNER_USER_ID", state.ownerId);
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
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
    await db.paymentProof.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.paymentProofIntent.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.paymentAllocation.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.payment.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
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
    await db.tenant.deleteMany({
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
    await db.securityRateLimit.deleteMany({
      where: { key: { startsWith: `proof-upload:${prefix}` } },
    });

    expect(
      await db.payment.count({
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

describe("payments, proofs, credit carry-forward, reversals & sync integration", () => {
  it("enforces env-backed overpayment policy, settles multiple invoices atomically, and assigns unique sequential receipt numbers", async () => {
    const tenant = await createTenant(state.ownerId, {
      fullName: "Juan Dela Cruz",
    });

    await configureOwnerSettings(state.ownerId, "REJECT_OVERPAYMENT");

    const inv1 = await seedIssuedInvoice(
      state.ownerId,
      tenant.id,
      "4000.00",
      "2026-11-10",
    );
    const inv2 = await seedIssuedInvoice(
      state.ownerId,
      tenant.id,
      "2500.00",
      "2026-11-25",
    );

    // REJECT_OVERPAYMENT rejects excess above allocated open balances.
    await expect(
      recordPayment(state.ownerId, {
        tenantId: tenant.id,
        amount: "5000.00",
        method: "CASH",
        allocations: [{ invoiceId: inv1.id, amount: "4000.00" }],
        proofIntentIds: [],
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Concurrent collections mint consecutive receipt numbers cleanly under SyncHead.
    const [p1, p2] = await Promise.all([
      recordPayment(state.ownerId, {
        tenantId: tenant.id,
        amount: "5000.00",
        method: "GCASH",
        paidDateManila: "2026-11-13",
        referenceNo: "GCASH-TX-889",
        allocations: [
          { invoiceId: inv1.id, amount: "4000.00" },
          { invoiceId: inv2.id, amount: "1000.00" },
        ],
        proofIntentIds: [],
      }),
      recordPayment(state.ownerId, {
        tenantId: tenant.id,
        amount: "1500.00",
        method: "CASH",
        paidDateManila: "2026-11-13",
        allocations: [{ invoiceId: inv2.id, amount: "1500.00" }],
        proofIntentIds: [],
      }),
    ]);

    expect([p1.receiptNumber, p2.receiptNumber].sort()).toEqual([
      "OR-2026-000001",
      "OR-2026-000002",
    ]);

    const detail = await getTenantDetail(state.ownerId, tenant.id);
    expect(detail?.derivedBalance).toBe("0.00");
    expect(detail?.invoices.every((inv) => inv.status === "PAID")).toBe(true);
    expect(detail?.payments.length).toBe(2);

    const audit = await listAuditLogs(state.ownerId, { area: "payments" });
    expect(audit.entries.map((a) => a.action)).toEqual([
      "payment.recorded",
      "payment.recorded",
    ]);
    // Audit metadata stays identifier/status/amount only.
    expect(JSON.stringify(audit.entries)).not.toContain("GCASH-TX-889");
    expect(JSON.stringify(audit.entries)).not.toContain("Juan Dela Cruz");
  }, 45_000);

  it("carries unallocated credit under CREDIT_NEXT_INVOICE, auto-applies on invoice issue, and reverses cleanly restoring balances", async () => {
    const db = state.db!;
    await configureOwnerSettings(state.ownerId, "CREDIT_NEXT_INVOICE");

    const tenant = await createTenant(state.ownerId, {
      fullName: "Clara Santos",
    });
    const inv1 = await seedIssuedInvoice(state.ownerId, tenant.id, "4000.00");

    const overpay = await recordPayment(state.ownerId, {
      tenantId: tenant.id,
      amount: "5200.00",
      method: "BANK_TRANSFER",
      paidDateManila: "2026-11-13",
      allocations: [{ invoiceId: inv1.id, amount: "4000.00" }],
      proofIntentIds: [],
    });
    expect(overpay.unallocatedAmount).toBe("1200.00");

    let detail = await getTenantDetail(state.ownerId, tenant.id);
    expect(detail?.derivedBalance).toBe("-1200.00");
    expect(detail?.unallocatedCredit).toBe("1200.00");

    // Draft invoice -> issuing automatically applies PHP 1,200 credit.
    const draftInv2 = await createManualInvoice(state.ownerId, {
      tenantId: tenant.id,
      billingPeriod: null,
      periodStartManila: "2026-12-01",
      periodEndManila: "2027-01-01",
      dueDateManila: "2026-12-10",
      issueImmediately: false,
      notes: null,
      items: [
        {
          itemType: "RENT",
          description: "Dec rent",
          quantity: "1",
          unitAmount: "4000.00",
        },
      ],
    });
    const issuedInv2 = await issueDraftInvoice(state.ownerId, {
      invoiceId: draftInv2.id,
      expectedVersion: draftInv2.version,
    });
    expect(issuedInv2.status).toBe("PARTIALLY_PAID");
    expect(issuedInv2.paidAmount).toBe("1200.00");
    expect(issuedInv2.balanceAmount).toBe("2800.00");

    detail = await getTenantDetail(state.ownerId, tenant.id);
    expect(detail?.derivedBalance).toBe("2800.00");
    expect(detail?.unallocatedCredit).toBe("0.00");

    // Reversing the payment restores BOTH inv1 and inv2!
    const refreshedOverpay = detail?.payments.find((p) => p.id === overpay.id);
    expect(refreshedOverpay?.version).toBe(2);

    const reversal = await reversePayment(state.ownerId, {
      paymentId: overpay.id,
      expectedVersion: refreshedOverpay!.version,
      reason: "Bank transfer recalled",
    });

    expect(reversal.reversedPayment.status).toBe("REVERSED");
    expect(reversal.reversalEntry.status).toBe("REVERSAL");
    expect(reversal.reversalEntry.amount).toBe("-5200.00");
    expect(reversal.reversalEntry.allocations.length).toBe(2);

    detail = await getTenantDetail(state.ownerId, tenant.id);
    expect(detail?.derivedBalance).toBe("8000.00");
    expect(detail?.invoices.every((inv) => inv.status === "ISSUED")).toBe(true);
    expect(detail?.invoices.every((inv) => inv.paidAmount === "0.00")).toBe(
      true,
    );

    // Double-reversal & reversing a REVERSAL entry are blocked.
    await expect(
      reversePayment(state.ownerId, {
        paymentId: overpay.id,
        expectedVersion: reversal.reversedPayment.version,
        reason: "Duplicate reverse",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      reversePayment(state.ownerId, {
        paymentId: reversal.reversalEntry.id,
        expectedVersion: 1,
        reason: "Reverse reversal",
      }),
    ).rejects.toBeInstanceOf(PreconditionError);

    // DB CHECK / partial unique index reject raw double-reversal insertion.
    await expect(
      db.$executeRaw`
        INSERT INTO "Payment" (
          "id", "ownerUserId", "tenantId", "status", "method", "amount",
          "unallocatedAmount", "paidAt", "reversedPaymentId",
          "createdByActorType", "createdByActorId", "updatedAt"
        )
        VALUES (
          ${randomUUID()}::uuid, ${state.ownerId}, ${tenant.id}::uuid,
          'REVERSAL', 'CASH', -100.00, 0.00, CURRENT_TIMESTAMP,
          ${overpay.id}::uuid, 'owner', ${state.ownerId}, CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toThrow();

    // Now that inv1 is back to ISSUED with paidAmount = 0, voiding is allowed again.
    const latestInv1 = detail!.invoices.find((i) => i.id === inv1.id)!;
    const voidedInv1 = await voidInvoice(state.ownerId, {
      invoiceId: inv1.id,
      expectedVersion: latestInv1.version,
      reason: "Void after payment reversal",
    });
    expect(voidedInv1.status).toBe("VOID");

    // Manual applyTenantCredit when unallocated credit arrives AFTER an invoice is already open.
    const advPayment = await recordPayment(state.ownerId, {
      tenantId: tenant.id,
      amount: "1000.00",
      method: "CASH",
      allocations: [],
      proofIntentIds: [],
    });
    expect(advPayment.unallocatedAmount).toBe("1000.00");
    const creditRes = await applyTenantCredit(state.ownerId, {
      tenantId: tenant.id,
      invoiceId: issuedInv2.id,
    });
    expect(creditRes).toEqual({
      appliedAmount: "1000.00",
      updatedInvoiceCount: 1,
    });
  }, 45_000);

  it("enforces same-origin/auth/SHA-256 on proof upload intents and signed downloads", async () => {
    await configureOwnerSettings(state.ownerId, "CREDIT_NEXT_INVOICE");
    const tenant = await createTenant(state.ownerId, {
      fullName: "Proof Test",
    });

    // Unauthenticated API calls fail closed (401).
    state.authenticated = false;
    const unauthGet = await getPaymentsRoute();
    expect(unauthGet.status).toBe(401);
    state.authenticated = true;

    // Foreign origin rejected (403).
    const foreignIntentRes = await createProofIntentRoute(
      new Request("http://localhost:3000/api/payments/proofs/intent", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(foreignIntentRes.status).toBe(403);

    const payloadBytes = new Uint8Array(Buffer.from("fake-jpeg-receipt-bytes"));
    const sha256 = createHash("sha256").update(payloadBytes).digest("hex");
    const opId = randomUUID();

    // First intent creation succeeds and caches reuse by (opId, clientFileId).
    const intentReq = new Request(
      "http://localhost:3000/api/payments/proofs/intent",
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          fileName: "receipt.jpg",
          mimeType: "image/jpeg",
          byteSize: payloadBytes.byteLength,
          sha256,
          opId,
          clientFileId: "file-0",
        }),
      },
    );
    const intentRes = await createProofIntentRoute(intentReq);
    expect(intentRes.status).toBe(201);
    expect(intentRes.headers.get("cache-control")).toBe("private, no-store");
    const intentJson = (await intentRes.json()) as {
      intentId: string;
      reused: boolean;
    };
    expect(intentJson.reused).toBe(false);

    // Retry with identical (opId, clientFileId) reuses existing intentId.
    const retryRes = await createProofIntentRoute(
      new Request("http://localhost:3000/api/payments/proofs/intent", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          fileName: "receipt.jpg",
          mimeType: "image/jpeg",
          byteSize: payloadBytes.byteLength,
          sha256,
          opId,
          clientFileId: "file-0",
        }),
      }),
    );
    expect(retryRes.status).toBe(200);
    expect(
      (await retryRes.json()) as { intentId: string; reused: boolean },
    ).toMatchObject({ intentId: intentJson.intentId, reused: true });

    // Recording payment BEFORE bytes exist in S3 must fail validation.
    await expect(
      recordPayment(state.ownerId, {
        tenantId: tenant.id,
        amount: "500.00",
        method: "CASH",
        allocations: [],
        proofIntentIds: [intentJson.intentId],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Upload corrupted bytes -> SHA-256 mismatch rejected.
    const badUploadRes = await uploadProofIntentRoute(
      new Request(
        `http://localhost:3000/api/payments/proofs/intents/${intentJson.intentId}`,
        {
          method: "PUT",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "image/jpeg",
          },
          body: new Uint8Array(Buffer.from("wrongxx-jpeg-receipt-byte")).slice(
            0,
            payloadBytes.byteLength,
          ),
        },
      ),
      { params: Promise.resolve({ intentId: intentJson.intentId }) },
    );
    expect(badUploadRes.status).toBe(400);

    // Upload exact bytes succeeds.
    const okUploadRes = await uploadProofIntentRoute(
      new Request(
        `http://localhost:3000/api/payments/proofs/intents/${intentJson.intentId}`,
        {
          method: "PUT",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "image/jpeg",
          },
          body: payloadBytes,
        },
      ),
      { params: Promise.resolve({ intentId: intentJson.intentId }) },
    );
    expect(okUploadRes.status).toBe(200);

    // Attach to payment and verify authorized download.
    const payment = await recordPayment(state.ownerId, {
      tenantId: tenant.id,
      amount: "500.00",
      method: "GCASH",
      allocations: [],
      proofIntentIds: [intentJson.intentId],
    });
    expect(payment.proofs.length).toBe(1);
    const proofId = payment.proofs[0]!.id;

    const dlRes = await downloadProofRoute(
      new Request(
        `http://localhost:3000/api/payments/proofs/${proofId}/download?format=json`,
      ),
      { params: Promise.resolve({ proofId }) },
    );
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get("cache-control")).toBe("private, no-store");
    const dlJson = (await dlRes.json()) as {
      downloadUrl: string;
      expiresInSeconds: number;
    };
    expect(dlJson.downloadUrl).toContain("sig=ok");
    expect(dlJson.expiresInSeconds).toBe(60);

    // Cross-owner caller receives 404 NotFound.
    state.ownerId = `${prefix}-other-owner`;
    const foreignDl = await downloadProofRoute(
      new Request(
        `http://localhost:3000/api/payments/proofs/${proofId}/download`,
      ),
      { params: Promise.resolve({ proofId }) },
    );
    expect(foreignDl.status).toBe(404);

    // Reset ownerId back for clean overview test.
    state.ownerId = `${prefix}-${seq - 1}`;
    const overview = await getPaymentsOverview(state.ownerId);
    expect(overview.totals.proofCount).toBe(1);
  });

  it("handles payment.record offline sync idempotently, moves voided-invoice conflicts to Needs attention, and blocks revoked devices", async () => {
    await configureOwnerSettings(state.ownerId, "REJECT_OVERPAYMENT");
    const device = await registerOwnerDevice({
      ownerUserId: state.ownerId,
      label: "Tablet Frontdesk",
    });
    expect(device.rawToken).toBeTruthy();
    const deviceToken = device.rawToken!;

    const tenant = await createTenant(state.ownerId, {
      fullName: "Sync Boarder",
    });
    const inv1 = await seedIssuedInvoice(state.ownerId, tenant.id, "3500.00");
    const invVoid = await seedIssuedInvoice(
      state.ownerId,
      tenant.id,
      "1500.00",
    );
    await voidInvoice(state.ownerId, {
      invoiceId: invVoid.id,
      expectedVersion: invVoid.version,
      reason: "Voided before device synced",
    });

    const opId1 = randomUUID();
    const payId1 = randomUUID();
    const opPayload1 = {
      protocolVersion: 1,
      opId: opId1,
      deviceId: device.deviceId,
      localSequence: 1,
      type: "payment.record",
      entityId: payId1,
      baseVersion: 0,
      dependsOn: [],
      occurredAt: "2026-11-13T09:30:00.000Z",
      payload: {
        tenantId: tenant.id,
        amount: "3500.00",
        method: "CASH",
        allocations: [{ invoiceId: inv1.id, amount: "3500.00" }],
        proofIntentIds: [],
      },
    };

    const first = await applyPaymentSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken,
      rawOperation: opPayload1,
    });
    expect(first.status).toBe("applied");
    expect(first.payment?.receiptNumber).toBe("OR-2026-000001");

    // Identical retry returns duplicate without consuming another receipt number.
    const dup = await applyPaymentSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken,
      rawOperation: opPayload1,
    });
    expect(dup.status).toBe("duplicate");
    expect(dup.payment?.receiptNumber).toBe("OR-2026-000001");

    // Reusing opId with altered amount fails with ConflictError.
    await expect(
      applyPaymentSyncOperation({
        ownerUserId: state.ownerId,
        deviceToken,
        rawOperation: {
          ...opPayload1,
          payload: {
            ...opPayload1.payload,
            amount: "3400.00",
            allocations: [{ invoiceId: inv1.id, amount: "3400.00" }],
          },
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Offline payment targeting an invoice voided on the server becomes "conflict" (Needs attention).
    const conflictOutcome = await applyPaymentSyncOperation({
      ownerUserId: state.ownerId,
      deviceToken,
      rawOperation: {
        protocolVersion: 1,
        opId: randomUUID(),
        deviceId: device.deviceId,
        localSequence: 2,
        type: "payment.record",
        entityId: randomUUID(),
        baseVersion: 0,
        dependsOn: [],
        occurredAt: "2026-11-13T09:35:00.000Z",
        payload: {
          tenantId: tenant.id,
          amount: "1500.00",
          method: "CASH",
          allocations: [{ invoiceId: invVoid.id, amount: "1500.00" }],
          proofIntentIds: [],
        },
      },
    });
    expect(conflictOutcome.status).toBe("conflict");
    expect(conflictOutcome.reason).toContain("void");

    // Revoking device rejects subsequent sync pushes.
    await revokeOwnerDevice({
      ownerUserId: state.ownerId,
      deviceId: device.deviceId,
    });
    await expect(
      applyPaymentSyncOperation({
        ownerUserId: state.ownerId,
        deviceToken,
        rawOperation: {
          ...opPayload1,
          opId: randomUUID(),
          entityId: randomUUID(),
          localSequence: 3,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("loads payment create-context and owner-scoped payment detail cleanly", async () => {
    await configureOwnerSettings(state.ownerId);
    const tenant = await createTenant(state.ownerId, {
      fullName: "Juan Detail Test",
      phone: "09171234567",
      email: null,
      address: null,
      emergencyContact: null,
      notes: null,
    });
    const invoice = await seedIssuedInvoice(
      state.ownerId,
      tenant.id,
      "2000.00",
    );

    const createContext = await getPaymentCreateContext(state.ownerId);
    expect(createContext.policiesComplete).toBe(true);
    expect(createContext.tenants.some((t) => t.id === tenant.id)).toBe(true);
    expect(
      createContext.openInvoices.some((inv) => inv.id === invoice.id),
    ).toBe(true);

    const payment = await recordPayment(state.ownerId, {
      tenantId: tenant.id,
      amount: "2000.00",
      method: "CASH",
      allocations: [{ invoiceId: invoice.id, amount: "2000.00" }],
      proofIntentIds: [],
    });

    const detail = await getPaymentDetail(state.ownerId, payment.id);
    expect(detail?.id).toBe(payment.id);
    expect(detail?.receiptNumber).toBe(payment.receiptNumber);

    expect(
      await getPaymentDetail(`${state.ownerId}-other`, payment.id),
    ).toBeNull();
    expect(await getPaymentDetail(state.ownerId, randomUUID())).toBeNull();
  });
});
