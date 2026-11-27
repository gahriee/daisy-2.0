import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CreateProofUploadIntentSchema,
  RecordPaymentSchema,
  ReversePaymentSchema,
} from "../../../../src/features/payments/schemas";
import { PaymentSyncOperationSchema } from "../../../../src/features/payments/sync-contracts";

const validHash = "a".repeat(64);

describe("payments validation schemas", () => {
  it("normalizes money amounts and accepts valid payment payloads", () => {
    const parsed = RecordPaymentSchema.safeParse({
      tenantId: randomUUID(),
      amount: "4500.5",
      method: "GCASH",
      paidDateManila: "2026-11-13",
      referenceNo: "  GCASH-001  ",
      notes: "   ",
      allocations: [{ invoiceId: randomUUID(), amount: "4500.50" }],
      proofIntentIds: [randomUUID()],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.amount).toBe("4500.50");
    expect(parsed.data.referenceNo).toBe("GCASH-001");
    expect(parsed.data.notes).toBeNull();
  });

  it("rejects duplicate invoice allocations, zero amounts, and empty reversal reasons", () => {
    const invId = randomUUID();
    const dupAlloc = RecordPaymentSchema.safeParse({
      tenantId: randomUUID(),
      amount: "1000",
      method: "CASH",
      allocations: [
        { invoiceId: invId, amount: "500" },
        { invoiceId: invId, amount: "500" },
      ],
    });
    expect(dupAlloc.success).toBe(false);

    const zeroPay = RecordPaymentSchema.safeParse({
      tenantId: randomUUID(),
      amount: "0.00",
      method: "CASH",
    });
    expect(zeroPay.success).toBe(false);

    const emptyAlloc = RecordPaymentSchema.safeParse({
      tenantId: randomUUID(),
      amount: "1000",
      method: "CASH",
      allocations: [],
    });
    expect(emptyAlloc.success).toBe(true);

    const emptyRev = ReversePaymentSchema.safeParse({
      paymentId: randomUUID(),
      expectedVersion: 1,
      reason: "   ",
    });
    expect(emptyRev.success).toBe(false);
  });

  it("enforces proof intent MIME types, SHA-256 digest, and opId/clientFileId pairing", () => {
    const missingClientId = CreateProofUploadIntentSchema.safeParse({
      fileName: "receipt.jpg",
      mimeType: "image/jpeg",
      byteSize: 1024,
      sha256: validHash,
      opId: randomUUID(),
    });
    expect(missingClientId.success).toBe(false);

    const badMime = CreateProofUploadIntentSchema.safeParse({
      fileName: "script.exe",
      mimeType: "application/x-msdownload",
      byteSize: 1024,
      sha256: validHash,
    });
    expect(badMime.success).toBe(false);

    const valid = CreateProofUploadIntentSchema.safeParse({
      fileName: "gcash.png",
      mimeType: "image/png",
      byteSize: 2048,
      sha256: validHash.toUpperCase(),
      opId: randomUUID(),
      clientFileId: "att-1",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.sha256).toBe(validHash);
    }
  });

  it("validates payment.record sync envelopes", () => {
    const op = PaymentSyncOperationSchema.safeParse({
      protocolVersion: 1,
      opId: randomUUID(),
      deviceId: randomUUID(),
      localSequence: 1,
      type: "payment.record",
      entityId: randomUUID(),
      baseVersion: 0,
      dependsOn: [],
      occurredAt: "2026-11-13T10:00:00.000Z",
      payload: {
        tenantId: randomUUID(),
        amount: "3000",
        method: "CASH",
        allocations: [{ invoiceId: randomUUID(), amount: "3000" }],
        proofIntentIds: [],
      },
    });
    expect(op.success).toBe(true);
  });
});
