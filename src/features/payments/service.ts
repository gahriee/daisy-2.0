import "server-only";
import {
  getServerBillingPolicies,
  getServerOperationalLimits,
} from "@/config/business-config";
import { randomUUID } from "node:crypto";
import { manilaDateTimeToUtc, toManilaDate } from "@/lib/dates";
import {
  ConflictError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/lib/errors";
import {
  addMoney,
  formatMoneyDecimal,
  parseMoneyDecimal,
  subtractMoney,
} from "@/lib/money";
import { getDatabase } from "@/server/db/client";
import {
  ensureOwnerRecord,
  type DatabaseExecutor,
} from "@/server/db/owner-record";
import { isPgConstraintError } from "@/server/db/pg-errors";
import { writeAuditEntry, type AuditActorType } from "@/server/sync/publish";
import {
  invoiceSelect,
  lockSyncHeadForBatch,
  publishInvoiceSnapshotInTx,
  toInvoiceDto,
} from "@/features/billing/service";
import type { OverpaymentPolicyValue } from "@/features/settings/schemas";
import {
  computePaymentDistribution,
  formatOfficialReceiptNumber,
  reconcileInvoicePaymentState,
} from "./calculations";
import {
  applyAvailableCreditToInvoiceInTx,
  decimalToString,
  getTenantUnallocatedCreditsMap,
  getTransientUnallocatedCreditsMap,
  paymentSelect,
  publishPaymentSnapshotInTx,
  toPaymentDto,
} from "./projections";
import {
  verifyProofIntentsOutsideTx,
  type VerifiedProofUpload,
} from "./proofs";
import {
  ApplyTenantCreditSchema,
  RecordPaymentSchema,
  ReversePaymentSchema,
  type ApplyTenantCreditInput,
  type PaymentDto,
  type PaymentOpenInvoiceOptionDto,
  type PaymentTenantOptionDto,
  type PaymentTransientOptionDto,
  type PaymentsOverviewDto,
  type RecordPaymentInput,
  type ReversePaymentInput,
} from "./schemas";

const ZERO = BigInt(0);
const DEFAULT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_PROOF_MAX_FILES = 5;

export function getMissingPaymentPolicyLabels(settings: {
  overpaymentPolicy: OverpaymentPolicyValue | null;
  receiptPrefix: string | null;
}): string[] {
  const missing: string[] = [];
  if (settings.overpaymentPolicy === null) {
    missing.push("Overpayment policy");
  }
  if (!settings.receiptPrefix) {
    missing.push("Receipt prefix");
  }
  return missing;
}

function requirePaymentPoliciesInTx(): {
  overpaymentPolicy: OverpaymentPolicyValue;
  receiptPrefix: string;
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
} {
  const policies = getServerBillingPolicies();
  const limits = getServerOperationalLimits();
  return {
    overpaymentPolicy: policies.overpaymentPolicy,
    receiptPrefix: policies.receiptPrefix,
    proofMaxBytes: limits.proofMaxBytes,
    proofMaxFilesPerRecord: limits.proofMaxFilesPerRecord,
  };
}

async function allocateReceiptNumberInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  receiptPrefix: string,
  yearManila: number,
): Promise<string> {
  await ensureOwnerRecord(tx, ownerUserId);
  const rows = await tx.$queryRaw<Array<{ lastNumber: bigint }>>`
    INSERT INTO "DocumentSequence" ("ownerUserId", "docType", "lastNumber", "updatedAt")
    VALUES (${ownerUserId}, 'RECEIPT', 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("ownerUserId", "docType")
    DO UPDATE SET "lastNumber" = "DocumentSequence"."lastNumber" + 1, "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastNumber"
  `;
  const seq = rows[0]?.lastNumber;
  if (!seq) {
    throw new Error("Receipt number allocation failed.");
  }
  return formatOfficialReceiptNumber(receiptPrefix, yearManila, seq);
}

/**
 * Core transactional payment recorder shared by online forms/API and offline sync
 * replay (`payment.record`). Any external proof S3 HeadObject checks MUST finish
 * before opening the database transaction.
 */
export async function recordPaymentInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: RecordPaymentInput,
  verifiedProofs: Map<string, VerifiedProofUpload>,
  options?: {
    actorType?: AuditActorType;
    actorId?: string;
    operationId?: string;
  },
): Promise<PaymentDto> {
  const parsed = RecordPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check payment details and try again.",
    );
  }
  const input = parsed.data;
  const actorType = options?.actorType ?? "owner";
  const actorId = options?.actorId ?? ownerUserId;
  const nowUtc = new Date();

  await lockSyncHeadForBatch(tx, ownerUserId);
  const policies = requirePaymentPoliciesInTx();

  if (input.proofIntentIds.length > policies.proofMaxFilesPerRecord) {
    throw new ValidationError(
      `Attach at most ${policies.proofMaxFilesPerRecord} proof files per payment.`,
    );
  }

  for (const intentId of input.proofIntentIds) {
    if (!verifiedProofs.has(intentId)) {
      throw new ValidationError(
        "One or more proof files have not been verified in storage.",
      );
    }
  }

  const payerTenant = input.tenantId
    ? await tx.tenant.findFirst({
        where: { id: input.tenantId, ownerUserId },
        select: { id: true, fullName: true },
      })
    : null;
  const payerTransient =
    !payerTenant && input.transientGuestId
      ? await tx.transientGuest.findFirst({
          where: { id: input.transientGuestId, ownerUserId },
          select: { id: true, fullName: true },
        })
      : null;

  if (input.tenantId && !payerTenant) {
    throw new NotFoundError("Selected boarder was not found.");
  }
  if (input.transientGuestId && !payerTransient) {
    throw new NotFoundError("Selected transient guest was not found.");
  }
  const payerFullName =
    payerTenant?.fullName ?? payerTransient?.fullName ?? "Guest";

  const targetIds = input.allocations.map((item) => item.invoiceId);
  const invoiceRows =
    targetIds.length > 0
      ? await tx.invoice.findMany({
          where: { ownerUserId, id: { in: targetIds } },
          select: {
            id: true,
            tenantId: true,
            transientGuestId: true,
            invoiceNumber: true,
            status: true,
            version: true,
            totalAmount: true,
            paidAmount: true,
          },
        })
      : [];

  if (invoiceRows.length !== targetIds.length) {
    throw new ConflictError("One or more target invoices could not be found.");
  }

  const invoiceMap = new Map(invoiceRows.map((row) => [row.id, row]));
  const distributionTargets: Array<{
    invoiceId: string;
    amountCentavos: bigint;
    openBalanceCentavos: bigint;
  }> = [];

  for (const alloc of input.allocations) {
    const invoice = invoiceMap.get(alloc.invoiceId);
    if (!invoice) {
      throw new ConflictError("Target invoice could not be found.");
    }
    if (
      (payerTenant && invoice.tenantId !== payerTenant.id) ||
      (payerTransient && invoice.transientGuestId !== payerTransient.id)
    ) {
      throw new ValidationError(
        "Payment allocations must belong to the selected boarder or guest.",
      );
    }
    if (invoice.status !== "ISSUED" && invoice.status !== "PARTIALLY_PAID") {
      throw new ConflictError(
        `Invoice ${invoice.invoiceNumber ?? invoice.id} is ${invoice.status.toLowerCase()} and cannot accept payments.`,
      );
    }

    const totalCentavos = parseMoneyDecimal(invoice.totalAmount.toString());
    const paidCentavos = parseMoneyDecimal(invoice.paidAmount.toString());
    const openBalanceCentavos = subtractMoney(totalCentavos, paidCentavos);

    distributionTargets.push({
      invoiceId: invoice.id,
      amountCentavos: parseMoneyDecimal(alloc.amount),
      openBalanceCentavos,
    });
  }

  const paymentAmountCentavos = parseMoneyDecimal(input.amount);
  const distribution = computePaymentDistribution({
    paymentAmountCentavos,
    allocations: distributionTargets,
    overpaymentPolicy: policies.overpaymentPolicy,
  });

  if (!distribution.ok) {
    if (distribution.kind === "allocations_exceed_payment") {
      throw new ValidationError(distribution.message);
    }
    throw new ConflictError(distribution.message);
  }

  const paidAt = input.paidAt
    ? new Date(input.paidAt)
    : input.paidDateManila
      ? manilaDateTimeToUtc(input.paidDateManila, "12:00")
      : nowUtc;
  const paidYear = Number(toManilaDate(paidAt).slice(0, 4));
  const receiptNumber = await allocateReceiptNumberInTx(
    tx,
    ownerUserId,
    policies.receiptPrefix,
    paidYear,
  );

  const paymentId = input.id ?? randomUUID();

  try {
    await tx.payment.create({
      data: {
        id: paymentId,
        ownerUserId,
        tenantId: payerTenant?.id ?? null,
        transientGuestId: payerTransient?.id ?? null,
        version: 1,
        receiptNumber,
        status: "POSTED",
        method: input.method,
        amount: input.amount,
        unallocatedAmount: formatMoneyDecimal(distribution.unallocatedCentavos),
        paidAt,
        referenceNo: input.referenceNo,
        notes: input.notes,
        createdByActorType: actorType,
        createdByActorId: actorId,
        snapshotTenantName: payerFullName,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isPgConstraintError(error, "23505")) {
      throw new ConflictError(
        "A payment with this identifier or receipt number already exists.",
      );
    }
    throw error;
  }

  for (const alloc of input.allocations) {
    const invoice = invoiceMap.get(alloc.invoiceId);
    if (!invoice) continue;
    const totalCentavos = parseMoneyDecimal(invoice.totalAmount.toString());
    const currentPaidCentavos = parseMoneyDecimal(
      invoice.paidAmount.toString(),
    );
    const allocCentavos = parseMoneyDecimal(alloc.amount);

    const nextState = reconcileInvoicePaymentState({
      totalAmountCentavos: totalCentavos,
      currentPaidCentavos,
      deltaCentavos: allocCentavos,
      currentStatus: invoice.status,
    });

    const updated = await tx.invoice.updateMany({
      where: {
        id: invoice.id,
        ownerUserId,
        version: invoice.version,
        status: invoice.status,
      },
      data: {
        paidAmount: formatMoneyDecimal(nextState.nextPaidCentavos),
        status: nextState.nextStatus,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new ConflictError(
        "An allocated invoice changed since you loaded it. Reload and retry.",
      );
    }

    await tx.paymentAllocation.create({
      data: {
        id: randomUUID(),
        ownerUserId,
        paymentId,
        invoiceId: invoice.id,
        amount: alloc.amount,
      },
    });

    const refreshedInvoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: invoiceSelect,
    });
    await publishInvoiceSnapshotInTx(
      tx,
      ownerUserId,
      toInvoiceDto(refreshedInvoice, nowUtc),
    );
  }

  for (const intentId of input.proofIntentIds) {
    const verified = verifiedProofs.get(intentId);
    if (!verified) continue;

    const lockedIntent = await tx.paymentProofIntent.updateMany({
      where: {
        id: verified.intentId,
        ownerUserId,
        status: "PENDING_UPLOAD",
      },
      data: {
        status: "ATTACHED",
        verifiedByteSize: verified.byteSize,
        attachedPaymentId: paymentId,
      },
    });
    if (lockedIntent.count === 0) {
      throw new ConflictError(
        "Proof upload reference was already attached to another payment.",
      );
    }

    await tx.paymentProof.create({
      data: {
        id: randomUUID(),
        ownerUserId,
        paymentId,
        intentId: verified.intentId,
        objectKey: verified.objectKey,
        fileName: verified.fileName,
        mimeType: verified.mimeType,
        byteSize: verified.byteSize,
        sha256: verified.sha256,
      },
    });
  }

  const createdRow = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: paymentSelect,
  });

  const dto = toPaymentDto(createdRow);
  const sequence = await publishPaymentSnapshotInTx(tx, ownerUserId, dto);
  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "payments",
    action: "payment.recorded",
    actorType,
    actorId,
    entityType: "payment",
    entityId: dto.id,
    operationId: options?.operationId,
    metadata: {
      tenantId: dto.tenantId,
      transientGuestId: dto.transientGuestId,
      receiptNumber: dto.receiptNumber,
      method: dto.method,
      amount: dto.amount,
      unallocatedAmount: dto.unallocatedAmount,
      allocationCount: dto.allocations.length,
      proofCount: dto.proofs.length,
      version: dto.version,
    },
  });

  return dto;
}

/**
 * Online Owner entry point to record a payment with optional verified S3 proofs.
 */
export async function recordPayment(
  ownerUserId: string,
  rawInput: RecordPaymentInput,
): Promise<PaymentDto> {
  const parsed = RecordPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check payment details and try again.",
    );
  }

  const verifiedProofs = await verifyProofIntentsOutsideTx(
    ownerUserId,
    parsed.data.proofIntentIds,
    parsed.data.id ? { paymentId: parsed.data.id } : undefined,
  );

  const db = getDatabase();
  return db.$transaction(
    (tx) =>
      recordPaymentInTx(tx, ownerUserId, parsed.data, verifiedProofs, {
        actorType: "owner",
        actorId: ownerUserId,
      }),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Online-only immutable reversal of a POSTED payment: marks original REVERSED,
 * creates a linked negative REVERSAL entry, restores allocated invoice balances
 * and statuses, and emits ChangeFeed + identifier-only AuditLog entries.
 */
export async function reversePayment(
  ownerUserId: string,
  rawInput: ReversePaymentInput,
): Promise<{ reversedPayment: PaymentDto; reversalEntry: PaymentDto }> {
  const parsed = ReversePaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Enter a reason to reverse this payment.",
    );
  }
  const { paymentId, expectedVersion, reason } = parsed.data;
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForBatch(tx, ownerUserId);
      const nowUtc = new Date();

      const original = await tx.payment.findFirst({
        where: { id: paymentId, ownerUserId },
        select: {
          id: true,
          tenantId: true,
          transientGuestId: true,
          version: true,
          receiptNumber: true,
          status: true,
          method: true,
          amount: true,
          unallocatedAmount: true,
          paidAt: true,
          snapshotTenantName: true,
          allocations: {
            orderBy: { createdAt: "asc" },
            select: { id: true, invoiceId: true, amount: true },
          },
        },
      });

      if (!original) {
        throw new NotFoundError("The requested payment was not found.");
      }
      if (original.status === "REVERSAL") {
        throw new PreconditionError("A reversal entry cannot be reversed.");
      }
      if (original.status === "REVERSED") {
        throw new ConflictError("This payment has already been reversed.");
      }
      if (original.version !== expectedVersion) {
        throw new ConflictError(
          "This payment changed since you loaded it. Reload before reversing.",
        );
      }

      const updatedOrig = await tx.payment.updateMany({
        where: {
          id: original.id,
          ownerUserId,
          version: expectedVersion,
          status: "POSTED",
        },
        data: {
          status: "REVERSED",
          reversedAt: nowUtc,
          version: { increment: 1 },
        },
      });
      if (updatedOrig.count === 0) {
        throw new ConflictError(
          "This payment changed since you loaded it. Reload before reversing.",
        );
      }

      const negAmountStr = formatMoneyDecimal(
        -parseMoneyDecimal(original.amount.toString()),
      );
      const negUnallocatedStr = formatMoneyDecimal(
        -parseMoneyDecimal(original.unallocatedAmount.toString()),
      );
      const reversalId = randomUUID();

      try {
        await tx.payment.create({
          data: {
            id: reversalId,
            ownerUserId,
            tenantId: original.tenantId,
            transientGuestId: original.transientGuestId,
            version: 1,
            receiptNumber: null,
            status: "REVERSAL",
            method: original.method,
            amount: negAmountStr,
            unallocatedAmount: negUnallocatedStr,
            paidAt: nowUtc,
            reversedPaymentId: original.id,
            reversalReason: reason,
            reversedAt: nowUtc,
            createdByActorType: "owner",
            createdByActorId: ownerUserId,
            snapshotTenantName: original.snapshotTenantName,
          },
          select: { id: true },
        });
      } catch (error) {
        if (isPgConstraintError(error, "23505")) {
          throw new ConflictError("This payment has already been reversed.");
        }
        throw error;
      }

      for (const origAlloc of original.allocations) {
        const allocCentavos = parseMoneyDecimal(origAlloc.amount.toString());
        await tx.paymentAllocation.create({
          data: {
            id: randomUUID(),
            ownerUserId,
            paymentId: reversalId,
            invoiceId: origAlloc.invoiceId,
            amount: formatMoneyDecimal(-allocCentavos),
          },
        });

        const inv = await tx.invoice.findFirst({
          where: { id: origAlloc.invoiceId, ownerUserId },
          select: {
            id: true,
            version: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
          },
        });
        if (!inv) {
          throw new NotFoundError("Allocated invoice record was not found.");
        }

        const nextState = reconcileInvoicePaymentState({
          totalAmountCentavos: parseMoneyDecimal(inv.totalAmount.toString()),
          currentPaidCentavos: parseMoneyDecimal(inv.paidAmount.toString()),
          deltaCentavos: -allocCentavos,
          currentStatus: inv.status,
        });

        const updatedInv = await tx.invoice.updateMany({
          where: {
            id: inv.id,
            ownerUserId,
            version: inv.version,
            status: inv.status,
          },
          data: {
            paidAmount: formatMoneyDecimal(nextState.nextPaidCentavos),
            status: nextState.nextStatus,
            version: { increment: 1 },
          },
        });
        if (updatedInv.count === 0) {
          throw new ConflictError(
            "An invoice tied to this payment changed concurrently. Retry.",
          );
        }

        const refreshedInv = await tx.invoice.findUniqueOrThrow({
          where: { id: inv.id },
          select: invoiceSelect,
        });
        await publishInvoiceSnapshotInTx(
          tx,
          ownerUserId,
          toInvoiceDto(refreshedInv, nowUtc),
        );
      }

      const [reloadedOriginal, createdReversal] = await Promise.all([
        tx.payment.findUniqueOrThrow({
          where: { id: original.id },
          select: paymentSelect,
        }),
        tx.payment.findUniqueOrThrow({
          where: { id: reversalId },
          select: paymentSelect,
        }),
      ]);

      const reversedPayment = toPaymentDto(reloadedOriginal);
      const reversalEntry = toPaymentDto(createdReversal);

      await publishPaymentSnapshotInTx(tx, ownerUserId, reversedPayment);
      const revSequence = await publishPaymentSnapshotInTx(
        tx,
        ownerUserId,
        reversalEntry,
      );
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence: revSequence,
        area: "payments",
        action: "payment.reversed",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "payment",
        entityId: reversalEntry.id,
        metadata: {
          tenantId: reversedPayment.tenantId,
          transientGuestId: reversedPayment.transientGuestId,
          originalPaymentId: reversedPayment.id,
          originalReceiptNumber: reversedPayment.receiptNumber,
          amount: reversalEntry.amount,
          allocationCount: reversalEntry.allocations.length,
          version: reversedPayment.version,
        },
      });

      return { reversedPayment, reversalEntry };
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Applies existing unallocated credit from a tenant's POSTED payments onto
 * their open invoices (FIFO dueDate asc) inside a single transaction.
 */
export async function applyTenantCredit(
  ownerUserId: string,
  rawInput: ApplyTenantCreditInput,
): Promise<{ appliedAmount: string; updatedInvoiceCount: number }> {
  const parsed = ApplyTenantCreditSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Select a boarder before applying credit.",
    );
  }
  const { tenantId, invoiceId } = parsed.data;
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForBatch(tx, ownerUserId);
      const nowUtc = new Date();

      const invoices = await tx.invoice.findMany({
        where: {
          ownerUserId,
          tenantId,
          status: { in: ["ISSUED", "PARTIALLY_PAID"] },
          ...(invoiceId ? { id: invoiceId } : {}),
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          tenantId: true,
          status: true,
          version: true,
          totalAmount: true,
          paidAmount: true,
        },
      });

      if (invoiceId && invoices.length === 0) {
        throw new ConflictError("Selected invoice is not open for credit.");
      }

      let totalApplied = ZERO;
      let updatedInvoiceCount = 0;

      for (const inv of invoices) {
        if (inv.status !== "ISSUED" && inv.status !== "PARTIALLY_PAID")
          continue;
        const result = await applyAvailableCreditToInvoiceInTx(
          tx,
          ownerUserId,
          {
            invoiceId: inv.id,
            tenantId: inv.tenantId,
            totalAmountCentavos: parseMoneyDecimal(inv.totalAmount.toString()),
            currentPaidCentavos: parseMoneyDecimal(inv.paidAmount.toString()),
            status: inv.status,
            version: inv.version,
          },
          { actorType: "owner", actorId: ownerUserId },
        );

        if (result.appliedCentavos > ZERO) {
          totalApplied = addMoney(totalApplied, result.appliedCentavos);
          updatedInvoiceCount += 1;
          const refreshedInv = await tx.invoice.findUniqueOrThrow({
            where: { id: inv.id },
            select: invoiceSelect,
          });
          await publishInvoiceSnapshotInTx(
            tx,
            ownerUserId,
            toInvoiceDto(refreshedInv, nowUtc),
          );
        }
      }

      return {
        appliedAmount: formatMoneyDecimal(totalApplied),
        updatedInvoiceCount,
      };
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Returns full Payments overview for the `/payments` workspace & `GET /api/payments`.
 */
async function loadPaymentFormOptions(ownerUserId: string): Promise<{
  settings: {
    overpaymentPolicy: OverpaymentPolicyValue;
    receiptPrefix: string;
    proofMaxBytes: number;
    proofMaxFilesPerRecord: number;
  };
  tenants: PaymentTenantOptionDto[];
  transientGuests: PaymentTransientOptionDto[];
  openInvoices: PaymentOpenInvoiceOptionDto[];
}> {
  const db = getDatabase();
  const nowUtc = new Date();
  const policies = getServerBillingPolicies();
  const limits = getServerOperationalLimits();

  const [
    tenantRows,
    transientGuestRows,
    openInvoiceRows,
    creditsMap,
    transientCreditsMap,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { ownerUserId },
      orderBy: [{ archivedAt: "asc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        archivedAt: true,
      },
    }),
    db.transientGuest.findMany({
      where: { ownerUserId },
      orderBy: [{ archivedAt: "asc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        archivedAt: true,
      },
    }),
    db.invoice.findMany({
      where: {
        ownerUserId,
        status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        tenantId: true,
        transientGuestId: true,
        transientReservationId: true,
        invoiceNumber: true,
        billingPeriod: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        snapshotTenantName: true,
        tenant: { select: { fullName: true } },
        transientGuest: { select: { fullName: true } },
        items: {
          orderBy: { sortOrder: "asc" },
          select: {
            description: true,
            lineTotal: true,
          },
        },
      },
    }),
    getTenantUnallocatedCreditsMap(db, ownerUserId),
    getTransientUnallocatedCreditsMap(db, ownerUserId),
  ]);

  const openBalanceByTenant = new Map<string, bigint>();
  const openCountByTenant = new Map<string, number>();
  const openBalanceByTransient = new Map<string, bigint>();
  const openCountByTransient = new Map<string, number>();

  const openInvoices: PaymentOpenInvoiceOptionDto[] = openInvoiceRows.map(
    (inv) => {
      const totalCentavos = parseMoneyDecimal(inv.totalAmount.toString());
      const paidCentavos = parseMoneyDecimal(inv.paidAmount.toString());
      const balanceCentavos = subtractMoney(totalCentavos, paidCentavos);
      if (balanceCentavos > ZERO) {
        if (inv.tenantId) {
          openBalanceByTenant.set(
            inv.tenantId,
            addMoney(
              openBalanceByTenant.get(inv.tenantId) ?? ZERO,
              balanceCentavos,
            ),
          );
          openCountByTenant.set(
            inv.tenantId,
            (openCountByTenant.get(inv.tenantId) ?? 0) + 1,
          );
        } else if (inv.transientGuestId) {
          openBalanceByTransient.set(
            inv.transientGuestId,
            addMoney(
              openBalanceByTransient.get(inv.transientGuestId) ?? ZERO,
              balanceCentavos,
            ),
          );
          openCountByTransient.set(
            inv.transientGuestId,
            (openCountByTransient.get(inv.transientGuestId) ?? 0) + 1,
          );
        }
      }

      const dueDateManila = toManilaDate(inv.dueDate);
      const todayManila = toManilaDate(nowUtc);

      return {
        id: inv.id,
        payerKind: inv.transientGuestId ? "TRANSIENT" : "TENANT",
        tenantId: inv.tenantId,
        transientGuestId: inv.transientGuestId,
        transientReservationId: inv.transientReservationId,
        tenantName:
          inv.snapshotTenantName ??
          inv.tenant?.fullName ??
          inv.transientGuest?.fullName ??
          "Guest",
        invoiceNumber: inv.invoiceNumber,
        billingPeriod: inv.billingPeriod,
        dueDateManila,
        status: inv.status === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "ISSUED",
        totalAmount: formatMoneyDecimal(totalCentavos),
        paidAmount: formatMoneyDecimal(paidCentavos),
        balanceAmount: formatMoneyDecimal(
          balanceCentavos > ZERO ? balanceCentavos : ZERO,
        ),
        isOverdue: dueDateManila < todayManila,
        items: inv.items.map((item) => ({
          description: item.description,
          lineTotal: decimalToString(item.lineTotal),
        })),
      };
    },
  );

  const tenants: PaymentTenantOptionDto[] = tenantRows.map((tenant) => ({
    id: tenant.id,
    fullName: tenant.fullName,
    archivedAt: tenant.archivedAt ? tenant.archivedAt.toISOString() : null,
    unallocatedCredit: creditsMap.get(tenant.id) ?? "0.00",
    openBalance: formatMoneyDecimal(openBalanceByTenant.get(tenant.id) ?? ZERO),
    openInvoiceCount: openCountByTenant.get(tenant.id) ?? 0,
  }));

  const transientGuests: PaymentTransientOptionDto[] = transientGuestRows.map(
    (guest) => ({
      id: guest.id,
      fullName: guest.fullName,
      archivedAt: guest.archivedAt ? guest.archivedAt.toISOString() : null,
      unallocatedCredit: transientCreditsMap.get(guest.id) ?? "0.00",
      openBalance: formatMoneyDecimal(
        openBalanceByTransient.get(guest.id) ?? ZERO,
      ),
      openInvoiceCount: openCountByTransient.get(guest.id) ?? 0,
    }),
  );

  return {
    settings: {
      overpaymentPolicy: policies.overpaymentPolicy,
      receiptPrefix: policies.receiptPrefix,
      proofMaxBytes: limits.proofMaxBytes,
      proofMaxFilesPerRecord: limits.proofMaxFilesPerRecord,
    },
    tenants,
    transientGuests,
    openInvoices,
  };
}

export async function getPaymentCreateContext(ownerUserId: string): Promise<{
  policiesComplete: boolean;
  missingPolicyLabels: string[];
  overpaymentPolicy: OverpaymentPolicyValue | null;
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
  tenants: PaymentTenantOptionDto[];
  transientGuests: PaymentTransientOptionDto[];
  openInvoices: PaymentOpenInvoiceOptionDto[];
}> {
  const { settings, tenants, transientGuests, openInvoices } =
    await loadPaymentFormOptions(ownerUserId);

  const missingPolicyLabels = getMissingPaymentPolicyLabels({
    overpaymentPolicy: settings?.overpaymentPolicy ?? null,
    receiptPrefix: settings?.receiptPrefix ?? null,
  });

  return {
    policiesComplete: missingPolicyLabels.length === 0,
    missingPolicyLabels,
    overpaymentPolicy: settings?.overpaymentPolicy ?? null,
    proofMaxBytes: settings?.proofMaxBytes ?? DEFAULT_PROOF_MAX_BYTES,
    proofMaxFilesPerRecord:
      settings?.proofMaxFilesPerRecord ?? DEFAULT_PROOF_MAX_FILES,
    tenants: tenants.filter(
      (t) => t.archivedAt === null || t.openInvoiceCount > 0,
    ),
    transientGuests: transientGuests.filter(
      (g) => g.archivedAt === null || g.openInvoiceCount > 0,
    ),
    openInvoices,
  };
}

export async function getPaymentDetail(
  ownerUserId: string,
  paymentId: string,
): Promise<PaymentDto | null> {
  const db = getDatabase();
  const row = await db.payment.findFirst({
    where: { id: paymentId, ownerUserId },
    select: paymentSelect,
  });
  return row ? toPaymentDto(row) : null;
}

export async function getPaymentsOverview(
  ownerUserId: string,
): Promise<PaymentsOverviewDto> {
  const db = getDatabase();
  const nowUtc = new Date();
  const currentMonthToken = toManilaDate(nowUtc).slice(0, 7);

  const [formOptions, paymentRows] = await Promise.all([
    loadPaymentFormOptions(ownerUserId),
    db.payment.findMany({
      where: { ownerUserId },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 250,
      select: paymentSelect,
    }),
  ]);

  const { settings, tenants, transientGuests, openInvoices } = formOptions;

  const missingPolicyLabels = getMissingPaymentPolicyLabels({
    overpaymentPolicy: settings?.overpaymentPolicy ?? null,
    receiptPrefix: settings?.receiptPrefix ?? null,
  });

  const payments = paymentRows.map(toPaymentDto);

  let collectedMonthCount = 0;
  let collectedMonthCentavos = ZERO;
  let unallocatedCreditCentavos = ZERO;
  let reversedCount = 0;
  let proofCount = 0;

  for (const payment of payments) {
    const amountCentavos = parseMoneyDecimal(payment.amount);
    if (payment.paidDateManila.slice(0, 7) === currentMonthToken) {
      collectedMonthCentavos = addMoney(collectedMonthCentavos, amountCentavos);
      if (payment.status !== "REVERSAL") {
        collectedMonthCount += 1;
      }
    }
    if (payment.status === "POSTED") {
      unallocatedCreditCentavos = addMoney(
        unallocatedCreditCentavos,
        parseMoneyDecimal(payment.unallocatedAmount),
      );
    }
    if (payment.status === "REVERSED") {
      reversedCount += 1;
    }
    proofCount += payment.proofs.length;
  }

  return {
    policiesComplete: missingPolicyLabels.length === 0,
    receiptPrefix: settings?.receiptPrefix ?? null,
    overpaymentPolicy: settings?.overpaymentPolicy ?? null,
    proofMaxBytes: settings?.proofMaxBytes ?? DEFAULT_PROOF_MAX_BYTES,
    proofMaxFilesPerRecord:
      settings?.proofMaxFilesPerRecord ?? DEFAULT_PROOF_MAX_FILES,
    missingPolicyLabels,
    totals: {
      collectedMonthCount,
      collectedMonthAmount: formatMoneyDecimal(collectedMonthCentavos),
      unallocatedCreditAmount: formatMoneyDecimal(unallocatedCreditCentavos),
      reversedCount,
      proofCount,
    },
    payments,
    tenants,
    transientGuests,
    openInvoices,
  };
}

/**
 * Lists recent payments and unallocated credit for a specific tenant detail view.
 */
export async function listTenantPayments(
  ownerUserId: string,
  tenantId: string,
): Promise<{ payments: PaymentDto[]; unallocatedCredit: string }> {
  const db = getDatabase();
  const [rows, creditsMap] = await Promise.all([
    db.payment.findMany({
      where: { ownerUserId, tenantId },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: paymentSelect,
    }),
    getTenantUnallocatedCreditsMap(db, ownerUserId, [tenantId]),
  ]);

  return {
    payments: rows.map(toPaymentDto),
    unallocatedCredit: creditsMap.get(tenantId) ?? "0.00",
  };
}

export { decimalToString };
