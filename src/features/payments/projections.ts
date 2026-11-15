import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { toManilaDate } from "@/lib/dates";
import { ConflictError } from "@/lib/errors";
import {
  addMoney,
  formatMoneyDecimal,
  parseMoneyDecimal,
  subtractMoney,
} from "@/lib/money";
import type { DatabaseExecutor } from "@/server/db/owner-record";
import {
  allocateSyncSequence,
  appendChangeFeed,
  writeAuditEntry,
  type AuditActorType,
} from "@/server/sync/publish";
import { reconcileInvoicePaymentState } from "./calculations";
import type {
  PaymentAllocationDto,
  PaymentDto,
  PaymentMethodValue,
  PaymentProofDto,
  PaymentStatusValue,
} from "./schemas";

const ZERO = BigInt(0);

export function decimalToString(val: { toString(): string }): string {
  return formatMoneyDecimal(parseMoneyDecimal(val.toString()));
}

export const paymentSelect = {
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
  referenceNo: true,
  notes: true,
  reversalReason: true,
  reversedPaymentId: true,
  reversedAt: true,
  createdByActorType: true,
  snapshotTenantName: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { fullName: true } },
  transientGuest: { select: { fullName: true } },
  reversalEntry: { select: { id: true } },
  allocations: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      invoiceId: true,
      amount: true,
      invoice: {
        select: {
          invoiceNumber: true,
          billingPeriod: true,
        },
      },
    },
  },
  proofs: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      intentId: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      sha256: true,
      createdAt: true,
    },
  },
} as const;

export type SelectedPaymentRow = {
  id: string;
  tenantId: string | null;
  transientGuestId: string | null;
  version: number;
  receiptNumber: string | null;
  status: PaymentStatusValue;
  method: PaymentMethodValue;
  amount: { toString(): string };
  unallocatedAmount: { toString(): string };
  paidAt: Date;
  referenceNo: string | null;
  notes: string | null;
  reversalReason: string | null;
  reversedPaymentId: string | null;
  reversedAt: Date | null;
  createdByActorType: string;
  snapshotTenantName: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenant: { fullName: string } | null;
  transientGuest: { fullName: string } | null;
  reversalEntry: { id: string } | null;
  allocations: Array<{
    id: string;
    invoiceId: string;
    amount: { toString(): string };
    invoice: {
      invoiceNumber: string | null;
      billingPeriod: string | null;
    };
  }>;
  proofs: Array<{
    id: string;
    intentId: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    createdAt: Date;
  }>;
};

export function toPaymentDto(row: SelectedPaymentRow): PaymentDto {
  let allocatedCentavos = ZERO;
  const allocations: PaymentAllocationDto[] = row.allocations.map((alloc) => {
    const centavos = parseMoneyDecimal(alloc.amount.toString());
    allocatedCentavos = addMoney(allocatedCentavos, centavos);
    return {
      id: alloc.id,
      invoiceId: alloc.invoiceId,
      invoiceNumber: alloc.invoice.invoiceNumber,
      billingPeriod: alloc.invoice.billingPeriod,
      amount: formatMoneyDecimal(centavos),
    };
  });

  const proofs: PaymentProofDto[] = row.proofs.map((proof) => ({
    id: proof.id,
    intentId: proof.intentId,
    fileName: proof.fileName,
    mimeType: proof.mimeType,
    byteSize: proof.byteSize,
    sha256: proof.sha256,
    createdAt: proof.createdAt.toISOString(),
    downloadPath: `/api/payments/proofs/${proof.id}/download`,
  }));

  return {
    id: row.id,
    payerKind: row.transientGuestId ? "TRANSIENT" : "TENANT",
    tenantId: row.tenantId,
    transientGuestId: row.transientGuestId,
    tenantName:
      row.snapshotTenantName ??
      row.tenant?.fullName ??
      row.transientGuest?.fullName ??
      "Guest",
    version: row.version,
    receiptNumber: row.receiptNumber,
    status: row.status,
    method: row.method,
    amount: decimalToString(row.amount),
    allocatedAmount: formatMoneyDecimal(allocatedCentavos),
    unallocatedAmount: decimalToString(row.unallocatedAmount),
    paidAt: row.paidAt.toISOString(),
    paidDateManila: toManilaDate(row.paidAt),
    referenceNo: row.referenceNo,
    notes: row.notes,
    reversalReason: row.reversalReason,
    reversedPaymentId: row.reversedPaymentId,
    reversalEntryId: row.reversalEntry?.id ?? null,
    reversedAt: row.reversedAt ? row.reversedAt.toISOString() : null,
    createdByActorType: row.createdByActorType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    allocations,
    proofs,
  };
}

export async function publishPaymentSnapshotInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  payment: PaymentDto,
): Promise<bigint> {
  const sequence = await allocateSyncSequence(tx, ownerUserId);
  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "payment",
    entityId: payment.id,
    version: payment.version,
    operation: "upsert",
    payload: payment as unknown as Prisma.InputJsonValue,
  });
  return sequence;
}

/**
 * Returns total unallocated `POSTED` payment credit in formatted decimals keyed by tenantId.
 */
export async function getTenantUnallocatedCreditsMap(
  txOrDb: DatabaseExecutor,
  ownerUserId: string,
  tenantIds?: string[],
): Promise<Map<string, string>> {
  const rows = await txOrDb.payment.findMany({
    where: {
      ownerUserId,
      status: "POSTED",
      unallocatedAmount: { gt: 0 },
      ...(tenantIds && tenantIds.length > 0
        ? { tenantId: { in: tenantIds } }
        : { tenantId: { not: null } }),
    },
    select: {
      tenantId: true,
      unallocatedAmount: true,
    },
  });

  const totals = new Map<string, bigint>();
  for (const row of rows) {
    if (!row.tenantId) continue;
    const credit = parseMoneyDecimal(row.unallocatedAmount.toString());
    if (credit <= ZERO) continue;
    totals.set(
      row.tenantId,
      addMoney(totals.get(row.tenantId) ?? ZERO, credit),
    );
  }

  const out = new Map<string, string>();
  for (const [tenantId, sum] of totals) {
    out.set(tenantId, formatMoneyDecimal(sum));
  }
  return out;
}

export async function getTransientUnallocatedCreditsMap(
  txOrDb: DatabaseExecutor,
  ownerUserId: string,
  transientGuestIds?: string[],
): Promise<Map<string, string>> {
  const rows = await txOrDb.payment.findMany({
    where: {
      ownerUserId,
      status: "POSTED",
      unallocatedAmount: { gt: 0 },
      ...(transientGuestIds && transientGuestIds.length > 0
        ? { transientGuestId: { in: transientGuestIds } }
        : { transientGuestId: { not: null } }),
    },
    select: {
      transientGuestId: true,
      unallocatedAmount: true,
    },
  });

  const totals = new Map<string, bigint>();
  for (const row of rows) {
    if (!row.transientGuestId) continue;
    const credit = parseMoneyDecimal(row.unallocatedAmount.toString());
    if (credit <= ZERO) continue;
    totals.set(
      row.transientGuestId,
      addMoney(totals.get(row.transientGuestId) ?? ZERO, credit),
    );
  }

  const out = new Map<string, string>();
  for (const [guestId, sum] of totals) {
    out.set(guestId, formatMoneyDecimal(sum));
  }
  return out;
}

/**
 * Automatically applies any FIFO unallocated credit from a tenant's POSTED
 * payments onto one open/issued invoice inside an active SyncHead-locked tx.
 * Does NOT publish the target invoice snapshot so callers can fetch & publish once.
 */
export async function applyAvailableCreditToInvoiceInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  target: {
    invoiceId: string;
    tenantId: string | null;
    transientGuestId?: string | null;
    totalAmountCentavos: bigint;
    currentPaidCentavos: bigint;
    status: "ISSUED" | "PARTIALLY_PAID";
    version: number;
  },
  actor: { actorType: AuditActorType; actorId: string },
): Promise<{ appliedCentavos: bigint; paymentIdsTouched: string[] }> {
  let remainingInvoiceBalance = subtractMoney(
    target.totalAmountCentavos,
    target.currentPaidCentavos,
  );
  if (remainingInvoiceBalance <= ZERO) {
    return { appliedCentavos: ZERO, paymentIdsTouched: [] };
  }
  if (!target.tenantId && !target.transientGuestId) {
    return { appliedCentavos: ZERO, paymentIdsTouched: [] };
  }

  const creditPayments = await tx.payment.findMany({
    where: {
      ownerUserId,
      ...(target.tenantId
        ? { tenantId: target.tenantId }
        : { transientGuestId: target.transientGuestId! }),
      status: "POSTED",
      unallocatedAmount: { gt: 0 },
    },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      version: true,
      unallocatedAmount: true,
    },
  });

  if (creditPayments.length === 0) {
    return { appliedCentavos: ZERO, paymentIdsTouched: [] };
  }

  let totalApplied = ZERO;
  const touchedPaymentIds: string[] = [];

  for (const payment of creditPayments) {
    if (remainingInvoiceBalance <= ZERO) break;
    const avail = parseMoneyDecimal(payment.unallocatedAmount.toString());
    if (avail <= ZERO) continue;

    const take =
      avail <= remainingInvoiceBalance ? avail : remainingInvoiceBalance;
    const takeStr = formatMoneyDecimal(take);
    const nextUnallocatedStr = formatMoneyDecimal(subtractMoney(avail, take));

    const updatedPayment = await tx.payment.updateMany({
      where: {
        id: payment.id,
        ownerUserId,
        status: "POSTED",
        version: payment.version,
      },
      data: {
        unallocatedAmount: nextUnallocatedStr,
        version: { increment: 1 },
      },
    });
    if (updatedPayment.count === 0) {
      throw new ConflictError(
        "Payment credit state changed concurrently. Retry.",
      );
    }

    const existingAlloc = await tx.paymentAllocation.findUnique({
      where: {
        ownerUserId_paymentId_invoiceId: {
          ownerUserId,
          paymentId: payment.id,
          invoiceId: target.invoiceId,
        },
      },
      select: { id: true, amount: true },
    });

    if (existingAlloc) {
      const merged = addMoney(
        parseMoneyDecimal(existingAlloc.amount.toString()),
        take,
      );
      await tx.paymentAllocation.update({
        where: { id: existingAlloc.id },
        data: { amount: formatMoneyDecimal(merged) },
      });
    } else {
      await tx.paymentAllocation.create({
        data: {
          id: randomUUID(),
          ownerUserId,
          paymentId: payment.id,
          invoiceId: target.invoiceId,
          amount: takeStr,
        },
      });
    }

    const refreshedPayment = await tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: paymentSelect,
    });
    const paymentDto = toPaymentDto(refreshedPayment);
    const sequence = await publishPaymentSnapshotInTx(
      tx,
      ownerUserId,
      paymentDto,
    );
    await writeAuditEntry(tx, {
      ownerUserId,
      sequence,
      area: "payments",
      action: "payment.credit_applied",
      actorType: actor.actorType,
      actorId: actor.actorId,
      entityType: "payment",
      entityId: paymentDto.id,
      metadata: {
        tenantId: target.tenantId,
        transientGuestId: target.transientGuestId ?? null,
        invoiceId: target.invoiceId,
        appliedAmount: takeStr,
        unallocatedAmount: paymentDto.unallocatedAmount,
        version: paymentDto.version,
      },
    });

    totalApplied = addMoney(totalApplied, take);
    remainingInvoiceBalance = subtractMoney(remainingInvoiceBalance, take);
    touchedPaymentIds.push(payment.id);
  }

  if (totalApplied > ZERO) {
    const nextState = reconcileInvoicePaymentState({
      totalAmountCentavos: target.totalAmountCentavos,
      currentPaidCentavos: target.currentPaidCentavos,
      deltaCentavos: totalApplied,
      currentStatus: target.status,
    });

    const updatedInvoice = await tx.invoice.updateMany({
      where: {
        id: target.invoiceId,
        ownerUserId,
        version: target.version,
        status: target.status,
      },
      data: {
        paidAmount: formatMoneyDecimal(nextState.nextPaidCentavos),
        status: nextState.nextStatus,
        version: { increment: 1 },
      },
    });
    if (updatedInvoice.count === 0) {
      throw new ConflictError(
        "Invoice state changed while applying unallocated credit. Retry.",
      );
    }
  }

  return {
    appliedCentavos: totalApplied,
    paymentIdsTouched: touchedPaymentIds,
  };
}
