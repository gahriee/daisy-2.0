import "server-only";
import { getServerBillingPolicies } from "@/config/business-config";
import { randomUUID } from "node:crypto";
import {
  isOverdueManila,
  manilaDateTimeToUtc,
  toManilaDate,
} from "@/lib/dates";
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
import {
  allocateSyncSequence,
  appendChangeFeed,
  writeAuditEntry,
  type AuditActorType,
} from "@/server/sync/publish";
import type {
  DepositPolicyValue,
  ProrationPolicyValue,
} from "@/features/settings/schemas";
import {
  applyAvailableCreditToInvoiceInTx,
  getTenantUnallocatedCreditsMap,
} from "@/features/payments/projections";
import {
  computeLineItemTotalCentavos,
  computePeriodInvoiceDraft,
  formatOfficialInvoiceNumber,
  getCurrentManilaBillingPeriod,
  getMonthBoundsManila,
} from "./calculations";
import {
  AddInvoiceAdjustmentSchema,
  CreateManualInvoiceSchema,
  GeneratePeriodInvoicesSchema,
  IssueInvoiceSchema,
  VoidInvoiceSchema,
  type AddInvoiceAdjustmentInput,
  type BillingOverviewDto,
  type BillingTenantOptionDto,
  type CreateManualInvoiceInput,
  type GeneratePeriodInvoicesInput,
  type GeneratePeriodInvoicesSummary,
  type InvoiceAdjustmentDto,
  type InvoiceAdjustmentTypeValue,
  type InvoiceDto,
  type InvoiceItemDto,
  type InvoiceItemTypeValue,
  type InvoiceStatusValue,
  type IssueInvoiceInput,
  type VoidInvoiceInput,
} from "./schemas";

const ZERO = BigInt(0);

function decimalToString(value: { toString(): string }): string {
  return formatMoneyDecimal(parseMoneyDecimal(value.toString()));
}

const invoiceItemSelect = {
  id: true,
  itemType: true,
  description: true,
  quantity: true,
  unitAmount: true,
  lineTotal: true,
  sortOrder: true,
} as const;

const invoiceAdjustmentSelect = {
  id: true,
  type: true,
  amount: true,
  reason: true,
  createdByActorType: true,
  createdAt: true,
} as const;

export const invoiceSelect = {
  id: true,
  tenantId: true,
  transientGuestId: true,
  transientReservationId: true,
  assignmentId: true,
  version: true,
  invoiceNumber: true,
  billingPeriod: true,
  periodStartDate: true,
  periodEndDate: true,
  dueDate: true,
  status: true,
  subtotalAmount: true,
  adjustmentAmount: true,
  totalAmount: true,
  paidAmount: true,
  snapshotTenantName: true,
  snapshotRoomNumber: true,
  snapshotBedNumber: true,
  snapshotMonthlyRate: true,
  snapshotProrationPolicy: true,
  snapshotDepositPolicy: true,
  notes: true,
  voidReason: true,
  issuedAt: true,
  voidedAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: { sortOrder: "asc" as const },
    select: invoiceItemSelect,
  },
  adjustments: {
    orderBy: { createdAt: "asc" as const },
    select: invoiceAdjustmentSelect,
  },
} as const;

type SelectedInvoiceRow = {
  id: string;
  tenantId: string | null;
  transientGuestId: string | null;
  transientReservationId: string | null;
  assignmentId: string | null;
  version: number;
  invoiceNumber: string | null;
  billingPeriod: string | null;
  periodStartDate: Date;
  periodEndDate: Date;
  dueDate: Date;
  status: InvoiceStatusValue;
  subtotalAmount: { toString(): string };
  adjustmentAmount: { toString(): string };
  totalAmount: { toString(): string };
  paidAmount: { toString(): string };
  snapshotTenantName: string | null;
  snapshotRoomNumber: string | null;
  snapshotBedNumber: string | null;
  snapshotMonthlyRate: { toString(): string } | null;
  snapshotProrationPolicy: ProrationPolicyValue | null;
  snapshotDepositPolicy: DepositPolicyValue | null;
  notes: string | null;
  voidReason: string | null;
  issuedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    itemType: InvoiceItemTypeValue;
    description: string;
    quantity: { toString(): string };
    unitAmount: { toString(): string };
    lineTotal: { toString(): string };
    sortOrder: number;
  }>;
  adjustments: Array<{
    id: string;
    type: InvoiceAdjustmentTypeValue;
    amount: { toString(): string };
    reason: string;
    createdByActorType: string;
    createdAt: Date;
  }>;
};

export function toInvoiceDto(
  row: SelectedInvoiceRow,
  nowUtc: Date = new Date(),
): InvoiceDto {
  const dueDateManila = toManilaDate(row.dueDate);
  const totalCentavos = parseMoneyDecimal(row.totalAmount.toString());
  const paidCentavos = parseMoneyDecimal(row.paidAmount.toString());
  const isOpen = row.status === "ISSUED" || row.status === "PARTIALLY_PAID";
  const balanceCentavos = isOpen
    ? subtractMoney(totalCentavos, paidCentavos)
    : ZERO;
  const isOverdue = isOpen && isOverdueManila(dueDateManila, nowUtc);

  const items: InvoiceItemDto[] = row.items.map((item) => ({
    id: item.id,
    itemType: item.itemType,
    description: item.description,
    quantity: decimalToString(item.quantity),
    unitAmount: decimalToString(item.unitAmount),
    lineTotal: decimalToString(item.lineTotal),
    sortOrder: item.sortOrder,
  }));

  const adjustments: InvoiceAdjustmentDto[] = row.adjustments.map((adj) => ({
    id: adj.id,
    type: adj.type,
    amount: decimalToString(adj.amount),
    reason: adj.reason,
    createdByActorType: adj.createdByActorType,
    createdAt: adj.createdAt.toISOString(),
  }));

  return {
    id: row.id,
    tenantId: row.tenantId,
    transientGuestId: row.transientGuestId,
    transientReservationId: row.transientReservationId,
    assignmentId: row.assignmentId,
    version: row.version,
    invoiceNumber: row.invoiceNumber,
    billingPeriod: row.billingPeriod,
    periodStartManila: toManilaDate(row.periodStartDate),
    periodEndManila: toManilaDate(row.periodEndDate),
    dueDateManila,
    status: row.status,
    isOverdue,
    subtotalAmount: decimalToString(row.subtotalAmount),
    adjustmentAmount: decimalToString(row.adjustmentAmount),
    totalAmount: formatMoneyDecimal(totalCentavos),
    paidAmount: formatMoneyDecimal(paidCentavos),
    balanceAmount: formatMoneyDecimal(
      balanceCentavos > ZERO ? balanceCentavos : ZERO,
    ),
    snapshotTenantName: row.snapshotTenantName,
    snapshotRoomNumber: row.snapshotRoomNumber,
    snapshotBedNumber: row.snapshotBedNumber,
    snapshotMonthlyRate: row.snapshotMonthlyRate
      ? decimalToString(row.snapshotMonthlyRate)
      : null,
    snapshotProrationPolicy: row.snapshotProrationPolicy,
    snapshotDepositPolicy: row.snapshotDepositPolicy,
    notes: row.notes,
    voidReason: row.voidReason,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items,
    adjustments,
  };
}

type ResolvedBillingPolicies = {
  billingDayOfMonth: number;
  gracePeriodDays: number;
  prorationPolicy: ProrationPolicyValue;
  depositPolicy: DepositPolicyValue;
  invoicePrefix: string;
};

function requireBillingPoliciesInTx(): ResolvedBillingPolicies {
  const policies = getServerBillingPolicies();
  return {
    billingDayOfMonth: policies.billingDayOfMonth,
    gracePeriodDays: policies.gracePeriodDays,
    prorationPolicy: policies.prorationPolicy,
    depositPolicy: policies.depositPolicy,
    invoicePrefix: policies.invoicePrefix,
  };
}

function requireInvoicePrefixInTx(): string {
  return getServerBillingPolicies().invoicePrefix;
}

export async function lockSyncHeadForBatch(
  tx: DatabaseExecutor,
  ownerUserId: string,
): Promise<void> {
  await ensureOwnerRecord(tx, ownerUserId);
  await tx.$executeRaw`
    INSERT INTO "SyncHead" ("ownerUserId", "lastSequence", "updatedAt")
    VALUES (${ownerUserId}, 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("ownerUserId") DO NOTHING
  `;
  await tx.$queryRaw<Array<{ lastSequence: bigint }>>`
    SELECT "lastSequence"
    FROM "SyncHead"
    WHERE "ownerUserId" = ${ownerUserId}
    FOR UPDATE
  `;
}

async function allocateInvoiceNumberInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  invoicePrefix: string,
  yearManila: number,
): Promise<string> {
  await ensureOwnerRecord(tx, ownerUserId);
  const rows = await tx.$queryRaw<Array<{ lastNumber: bigint }>>`
    INSERT INTO "DocumentSequence" ("ownerUserId", "docType", "lastNumber", "updatedAt")
    VALUES (${ownerUserId}, 'INVOICE', 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("ownerUserId", "docType")
    DO UPDATE SET "lastNumber" = "DocumentSequence"."lastNumber" + 1, "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastNumber"
  `;
  const seq = rows[0]?.lastNumber;
  if (!seq) {
    throw new Error("Invoice number allocation failed.");
  }
  return formatOfficialInvoiceNumber(invoicePrefix, yearManila, seq);
}

export async function publishInvoiceSnapshotInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  invoice: InvoiceDto,
): Promise<bigint> {
  const sequence = await allocateSyncSequence(tx, ownerUserId);
  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "invoice",
    entityId: invoice.id,
    version: invoice.version,
    operation: "upsert",
    payload: invoice,
  });
  return sequence;
}

export async function getTenantDerivedBalancesMap(
  txOrDb: DatabaseExecutor,
  ownerUserId: string,
  tenantIds?: string[],
): Promise<Map<string, string>> {
  const [rows, creditsMap] = await Promise.all([
    txOrDb.invoice.findMany({
      where: {
        ownerUserId,
        status: { in: ["ISSUED", "PARTIALLY_PAID"] },
        ...(tenantIds && tenantIds.length > 0
          ? { tenantId: { in: tenantIds } }
          : { tenantId: { not: null } }),
      },
      select: {
        tenantId: true,
        totalAmount: true,
        paidAmount: true,
      },
    }),
    getTenantUnallocatedCreditsMap(txOrDb, ownerUserId, tenantIds),
  ]);

  const totals = new Map<string, bigint>();
  for (const row of rows) {
    if (!row.tenantId) continue;
    const balance = subtractMoney(
      parseMoneyDecimal(row.totalAmount.toString()),
      parseMoneyDecimal(row.paidAmount.toString()),
    );
    if (balance <= ZERO) continue;
    totals.set(
      row.tenantId,
      addMoney(totals.get(row.tenantId) ?? ZERO, balance),
    );
  }

  for (const [tenantId, creditStr] of creditsMap) {
    const credit = parseMoneyDecimal(creditStr);
    if (credit <= ZERO) continue;
    totals.set(tenantId, subtractMoney(totals.get(tenantId) ?? ZERO, credit));
  }

  const result = new Map<string, string>();
  for (const [tenantId, sum] of totals) {
    result.set(tenantId, formatMoneyDecimal(sum));
  }
  return result;
}

export async function listTenantInvoices(
  ownerUserId: string,
  tenantId: string,
): Promise<InvoiceDto[]> {
  const db = getDatabase();
  const nowUtc = new Date();
  const rows = await db.invoice.findMany({
    where: { ownerUserId, tenantId },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    select: invoiceSelect,
  });
  return rows.map((row) => toInvoiceDto(row, nowUtc));
}

async function listBillingTenantOptionsInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
): Promise<BillingTenantOptionDto[]> {
  const tenantRows = await tx.tenant.findMany({
    where: { ownerUserId, archivedAt: null },
    orderBy: [{ fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      assignments: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          monthlyRate: true,
          room: { select: { title: true } },
          bed: { select: { number: true } },
        },
      },
    },
  });

  return tenantRows.map((tenant) => {
    const active = tenant.assignments[0];
    return {
      id: tenant.id,
      fullName: tenant.fullName,
      roomNumber: active?.room.title ?? null,
      bedNumber: active?.bed.number ?? null,
      monthlyRate: active ? decimalToString(active.monthlyRate) : null,
    };
  });
}

export async function getBillingCreateContext(ownerUserId: string): Promise<{
  hasInvoicePrefix: boolean;
  currentBillingPeriod: string;
  tenants: BillingTenantOptionDto[];
}> {
  const db = getDatabase();
  const currentBillingPeriod = getCurrentManilaBillingPeriod(new Date());
  const policies = getServerBillingPolicies();

  const tenants = await db.$transaction((tx) =>
    listBillingTenantOptionsInTx(tx, ownerUserId),
  );

  return {
    hasInvoicePrefix: Boolean(policies.invoicePrefix),
    currentBillingPeriod,
    tenants,
  };
}

export async function getInvoiceDetail(
  ownerUserId: string,
  invoiceId: string,
): Promise<{
  invoice: InvoiceDto;
  hasInvoicePrefix: boolean;
} | null> {
  const db = getDatabase();
  const nowUtc = new Date();
  const policies = getServerBillingPolicies();

  const row = await db.invoice.findFirst({
    where: { id: invoiceId, ownerUserId },
    select: invoiceSelect,
  });

  if (!row) {
    return null;
  }

  return {
    invoice: toInvoiceDto(row, nowUtc),
    hasInvoicePrefix: Boolean(policies.invoicePrefix),
  };
}

export async function getBillingOverview(
  ownerUserId: string,
): Promise<BillingOverviewDto> {
  const db = getDatabase();
  const nowUtc = new Date();
  const currentBillingPeriod = getCurrentManilaBillingPeriod(nowUtc);
  const policies = getServerBillingPolicies();

  const [invoiceRows, tenants] = await db.$transaction(async (tx) => {
    return Promise.all([
      tx.invoice.findMany({
        where: { ownerUserId },
        orderBy: [{ createdAt: "desc" }],
        take: 250,
        select: invoiceSelect,
      }),
      listBillingTenantOptionsInTx(tx, ownerUserId),
    ]);
  });

  const invoices = invoiceRows.map((row) => toInvoiceDto(row, nowUtc));

  let draftCount = 0;
  let issuedOpenCount = 0;
  let overdueCount = 0;
  let openReceivablesCentavos = ZERO;
  let billedCurrentPeriodCentavos = ZERO;

  for (const inv of invoices) {
    if (inv.status === "DRAFT") {
      draftCount += 1;
    }
    if (inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID") {
      issuedOpenCount += 1;
      openReceivablesCentavos = addMoney(
        openReceivablesCentavos,
        parseMoneyDecimal(inv.balanceAmount),
      );
    }
    if (inv.isOverdue) {
      overdueCount += 1;
    }
    if (
      inv.billingPeriod === currentBillingPeriod &&
      inv.status !== "VOID" &&
      inv.status !== "DRAFT"
    ) {
      billedCurrentPeriodCentavos = addMoney(
        billedCurrentPeriodCentavos,
        parseMoneyDecimal(inv.totalAmount),
      );
    }
  }

  return {
    policiesComplete: true,
    missingPolicyFields: [],
    currentBillingPeriod,
    billingDayOfMonth: policies.billingDayOfMonth,
    gracePeriodDays: policies.gracePeriodDays,
    prorationPolicy: policies.prorationPolicy,
    depositPolicy: policies.depositPolicy,
    invoicePrefix: policies.invoicePrefix,
    invoices,
    tenants,
    summary: {
      draftCount,
      issuedOpenCount,
      overdueCount,
      openReceivablesAmount: formatMoneyDecimal(openReceivablesCentavos),
      billedCurrentPeriodAmount: formatMoneyDecimal(
        billedCurrentPeriodCentavos,
      ),
    },
  };
}

/**
 * Idempotently generates monthly period invoices for all non-cancelled assignments
 * overlapping the requested `YYYY-MM` Asia/Manila billing period.
 */
export async function generatePeriodInvoices(
  ownerUserId: string,
  rawInput: GeneratePeriodInvoicesInput,
  actor?: {
    actorType?: AuditActorType;
    actorId?: string;
  },
): Promise<GeneratePeriodInvoicesSummary> {
  const parsed = GeneratePeriodInvoicesSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Check the billing period and try again.",
    );
  }

  const { billingPeriod, issueImmediately } = parsed.data;
  const bounds = getMonthBoundsManila(billingPeriod);
  const monthStartUtc = manilaDateTimeToUtc(bounds.monthStartManila, "00:00");
  const monthEndUtc = manilaDateTimeToUtc(
    bounds.monthEndExclusiveManila,
    "00:00",
  );
  const actorType = actor?.actorType ?? "owner";
  const actorId = actor?.actorId ?? ownerUserId;
  const db = getDatabase();

  try {
    return await db.$transaction(
      async (tx) => {
        await lockSyncHeadForBatch(tx, ownerUserId);
        const policies = requireBillingPoliciesInTx();

        const [existingForPeriod, assignments] = await Promise.all([
          tx.invoice.findMany({
            where: {
              ownerUserId,
              billingPeriod,
              status: { not: "VOID" },
            },
            select: { tenantId: true },
          }),
          tx.tenantAssignment.findMany({
            where: {
              ownerUserId,
              status: { in: ["ACTIVE", "COMPLETED"] },
              startDate: { lt: monthEndUtc },
              endDate: { gt: monthStartUtc },
              tenant: { archivedAt: null },
            },
            orderBy: [{ createdAt: "asc" }],
            select: {
              id: true,
              tenantId: true,
              startDate: true,
              endDate: true,
              actualMoveOutDate: true,
              monthlyRate: true,
              securityDeposit: true,
              tenant: { select: { fullName: true } },
              room: { select: { title: true } },
              bed: { select: { number: true } },
            },
          }),
        ]);

        const existingTenantIds = new Set(
          existingForPeriod
            .map((row) => row.tenantId)
            .filter((id): id is string => Boolean(id)),
        );
        const assignmentIds = assignments.map((a) => a.id);

        const [billedDepositItems, appliedDepositAdjustments] =
          assignmentIds.length > 0
            ? await Promise.all([
                tx.invoiceItem.findMany({
                  where: {
                    ownerUserId,
                    itemType: "DEPOSIT",
                    invoice: {
                      assignmentId: { in: assignmentIds },
                      status: { not: "VOID" },
                    },
                  },
                  select: { invoice: { select: { assignmentId: true } } },
                }),
                tx.invoiceAdjustment.findMany({
                  where: {
                    ownerUserId,
                    type: "CREDIT",
                    reason: { startsWith: "Security deposit applied" },
                    invoice: {
                      assignmentId: { in: assignmentIds },
                      status: { not: "VOID" },
                    },
                  },
                  select: { invoice: { select: { assignmentId: true } } },
                }),
              ])
            : [[], []];

        const depositBilledAssignmentIds = new Set(
          billedDepositItems
            .map((row) => row.invoice.assignmentId)
            .filter((id): id is string => id !== null),
        );
        const depositAppliedAssignmentIds = new Set(
          appliedDepositAdjustments
            .map((row) => row.invoice.assignmentId)
            .filter((id): id is string => id !== null),
        );

        let createdCount = 0;
        let issuedCount = 0;
        let skippedExistingCount = 0;
        let skippedZeroAmountCount = 0;
        const nowUtc = new Date();

        for (const assignment of assignments) {
          if (existingTenantIds.has(assignment.tenantId)) {
            skippedExistingCount += 1;
            continue;
          }

          const draft = computePeriodInvoiceDraft({
            billingPeriod,
            billingDayOfMonth: policies.billingDayOfMonth,
            gracePeriodDays: policies.gracePeriodDays,
            prorationPolicy: policies.prorationPolicy,
            depositPolicy: policies.depositPolicy,
            assignment: {
              startDateManila: toManilaDate(assignment.startDate),
              endDateManila: toManilaDate(assignment.endDate),
              actualMoveOutDateManila: assignment.actualMoveOutDate
                ? toManilaDate(assignment.actualMoveOutDate)
                : null,
              monthlyRate: decimalToString(assignment.monthlyRate),
              securityDeposit: decimalToString(assignment.securityDeposit),
            },
            depositAlreadyBilled: depositBilledAssignmentIds.has(assignment.id),
            depositAlreadyApplied: depositAppliedAssignmentIds.has(
              assignment.id,
            ),
          });

          if (!draft) {
            skippedZeroAmountCount += 1;
            continue;
          }

          const invoiceId = randomUUID();
          const invoiceNumber = issueImmediately
            ? await allocateInvoiceNumberInTx(
                tx,
                ownerUserId,
                policies.invoicePrefix,
                bounds.year,
              )
            : null;
          const status: InvoiceStatusValue = issueImmediately
            ? "ISSUED"
            : "DRAFT";

          const created = await tx.invoice.create({
            data: {
              id: invoiceId,
              ownerUserId,
              tenantId: assignment.tenantId,
              assignmentId: assignment.id,
              version: 1,
              invoiceNumber,
              billingPeriod,
              periodStartDate: manilaDateTimeToUtc(
                draft.periodStartManila,
                "00:00",
              ),
              periodEndDate: manilaDateTimeToUtc(
                draft.periodEndManila,
                "00:00",
              ),
              dueDate: manilaDateTimeToUtc(draft.dueDateManila, "00:00"),
              status,
              subtotalAmount: draft.subtotalAmount,
              adjustmentAmount: draft.adjustmentAmount,
              totalAmount: draft.totalAmount,
              paidAmount: "0.00",
              snapshotTenantName: assignment.tenant.fullName,
              snapshotRoomNumber: assignment.room.title,
              snapshotBedNumber: assignment.bed.number,
              snapshotMonthlyRate: decimalToString(assignment.monthlyRate),
              snapshotProrationPolicy: policies.prorationPolicy,
              snapshotDepositPolicy: policies.depositPolicy,
              issuedAt: issueImmediately ? nowUtc : null,
              items: {
                create: draft.items.map((item, idx) => ({
                  ownerUserId,
                  itemType: item.itemType,
                  description: item.description,
                  quantity: item.quantity,
                  unitAmount: item.unitAmount,
                  lineTotal: item.lineTotal,
                  sortOrder: idx,
                })),
              },
              ...(draft.depositCreditAdjustment
                ? {
                    adjustments: {
                      create: {
                        ownerUserId,
                        type: "CREDIT",
                        amount: draft.depositCreditAdjustment.amount,
                        reason: draft.depositCreditAdjustment.reason,
                        createdByActorType: actorType,
                        createdByActorId: actorId,
                      },
                    },
                  }
                : {}),
            },
            select: invoiceSelect,
          });

          const dto = toInvoiceDto(created, nowUtc);
          const sequence = await publishInvoiceSnapshotInTx(
            tx,
            ownerUserId,
            dto,
          );
          await writeAuditEntry(tx, {
            ownerUserId,
            sequence,
            area: "billing",
            action: issueImmediately ? "invoice.issued" : "invoice.generated",
            actorType,
            actorId,
            entityType: "invoice",
            entityId: created.id,
            metadata: {
              billingPeriod,
              status,
              invoiceNumber,
              totalAmount: dto.totalAmount,
              itemCount: dto.items.length,
              assignmentId: assignment.id,
            },
          });

          if (issueImmediately) {
            const creditApplied = await applyAvailableCreditToInvoiceInTx(
              tx,
              ownerUserId,
              {
                invoiceId: created.id,
                tenantId: assignment.tenantId,
                totalAmountCentavos: parseMoneyDecimal(dto.totalAmount),
                currentPaidCentavos: ZERO,
                status: "ISSUED",
                version: created.version,
              },
              { actorType, actorId },
            );
            if (creditApplied.appliedCentavos > ZERO) {
              const updatedAfterCredit = await tx.invoice.findUniqueOrThrow({
                where: { id: created.id },
                select: invoiceSelect,
              });
              await publishInvoiceSnapshotInTx(
                tx,
                ownerUserId,
                toInvoiceDto(updatedAfterCredit, nowUtc),
              );
            }
          }

          existingTenantIds.add(assignment.tenantId);
          createdCount += 1;
          if (issueImmediately) issuedCount += 1;
        }

        return {
          billingPeriod,
          createdCount,
          issuedCount,
          skippedExistingCount,
          skippedZeroAmountCount,
        };
      },
      { maxWait: 10_000, timeout: 25_000 },
    );
  } catch (error) {
    if (
      isPgConstraintError(
        error,
        "23505",
        "Invoice_ownerUserId_tenantId_billingPeriod_active_key",
      )
    ) {
      throw new ConflictError(
        "Invoices for this billing period were created concurrently. Refresh and try again.",
      );
    }
    throw error;
  }
}

/**
 * Online-only creation of a manual invoice (custom items, utilities, deposit, or period).
 */
export async function createManualInvoice(
  ownerUserId: string,
  rawInput: CreateManualInvoiceInput,
): Promise<InvoiceDto> {
  const parsed = CreateManualInvoiceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check invoice details and try again.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  try {
    return await db.$transaction(
      async (tx) => {
        const tenant = await tx.tenant.findFirst({
          where: { id: input.tenantId, ownerUserId },
          select: {
            id: true,
            fullName: true,
            archivedAt: true,
            assignments: {
              where: { status: "ACTIVE" },
              take: 1,
              select: {
                id: true,
                monthlyRate: true,
                room: { select: { title: true } },
                bed: { select: { number: true } },
              },
            },
          },
        });
        if (!tenant) {
          throw new NotFoundError("The requested tenant was not found.");
        }
        if (tenant.archivedAt !== null) {
          throw new PreconditionError(
            "Restore this archived tenant before creating an invoice.",
          );
        }

        const policies = getServerBillingPolicies();

        let invoiceNumber: string | null = null;
        const nowUtc = new Date();
        if (input.issueImmediately) {
          const prefix = policies.invoicePrefix;
          const issueYear = Number(toManilaDate(nowUtc).slice(0, 4));
          invoiceNumber = await allocateInvoiceNumberInTx(
            tx,
            ownerUserId,
            prefix,
            issueYear,
          );
        }

        let subtotalCentavos = ZERO;
        const computedItems = input.items.map((item, idx) => {
          const lineTotalCentavos = computeLineItemTotalCentavos(
            item.unitAmount,
            item.quantity,
          );
          subtotalCentavos = addMoney(subtotalCentavos, lineTotalCentavos);
          return {
            ownerUserId,
            itemType: item.itemType,
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            lineTotal: formatMoneyDecimal(lineTotalCentavos),
            sortOrder: idx,
          };
        });

        const subtotalAmount = formatMoneyDecimal(subtotalCentavos);
        const activeAssignment = tenant.assignments[0] ?? null;
        const status: InvoiceStatusValue = input.issueImmediately
          ? "ISSUED"
          : "DRAFT";

        const created = await tx.invoice.create({
          data: {
            id: randomUUID(),
            ownerUserId,
            tenantId: tenant.id,
            assignmentId: activeAssignment?.id ?? null,
            version: 1,
            invoiceNumber,
            billingPeriod: input.billingPeriod,
            periodStartDate: manilaDateTimeToUtc(
              input.periodStartManila,
              "00:00",
            ),
            periodEndDate: manilaDateTimeToUtc(input.periodEndManila, "00:00"),
            dueDate: manilaDateTimeToUtc(input.dueDateManila, "00:00"),
            status,
            subtotalAmount,
            adjustmentAmount: "0.00",
            totalAmount: subtotalAmount,
            paidAmount: "0.00",
            snapshotTenantName: tenant.fullName,
            snapshotRoomNumber: activeAssignment?.room.title ?? null,
            snapshotBedNumber: activeAssignment?.bed.number ?? null,
            snapshotMonthlyRate: activeAssignment
              ? decimalToString(activeAssignment.monthlyRate)
              : null,
            snapshotProrationPolicy: policies.prorationPolicy,
            snapshotDepositPolicy: policies.depositPolicy,
            notes: input.notes,
            issuedAt: input.issueImmediately ? nowUtc : null,
            items: { create: computedItems },
          },
          select: invoiceSelect,
        });

        let dto = toInvoiceDto(created, nowUtc);
        const sequence = await publishInvoiceSnapshotInTx(tx, ownerUserId, dto);
        await writeAuditEntry(tx, {
          ownerUserId,
          sequence,
          area: "billing",
          action: input.issueImmediately
            ? "invoice.issued"
            : "invoice.generated",
          actorType: "owner",
          actorId: ownerUserId,
          entityType: "invoice",
          entityId: created.id,
          metadata: {
            billingPeriod: input.billingPeriod,
            status,
            invoiceNumber,
            totalAmount: dto.totalAmount,
            itemCount: dto.items.length,
          },
        });

        if (input.issueImmediately) {
          const creditApplied = await applyAvailableCreditToInvoiceInTx(
            tx,
            ownerUserId,
            {
              invoiceId: created.id,
              tenantId: created.tenantId,
              totalAmountCentavos: parseMoneyDecimal(dto.totalAmount),
              currentPaidCentavos: ZERO,
              status: "ISSUED",
              version: created.version,
            },
            { actorType: "owner", actorId: ownerUserId },
          );
          if (creditApplied.appliedCentavos > ZERO) {
            const reloaded = await tx.invoice.findUniqueOrThrow({
              where: { id: created.id },
              select: invoiceSelect,
            });
            dto = toInvoiceDto(reloaded, nowUtc);
            await publishInvoiceSnapshotInTx(tx, ownerUserId, dto);
          }
        }

        return dto;
      },
      { maxWait: 10_000, timeout: 25_000 },
    );
  } catch (error) {
    if (
      isPgConstraintError(
        error,
        "23505",
        "Invoice_ownerUserId_tenantId_billingPeriod_active_key",
      )
    ) {
      throw new ConflictError(
        "An active invoice for this tenant and billing period already exists. Void it first or leave the billing period blank for an ad-hoc invoice.",
      );
    }
    throw error;
  }
}

/**
 * Issues a DRAFT invoice, assigning a unique sequential official number under
 * the SyncHead lock and freezing context snapshots.
 */
export async function issueDraftInvoice(
  ownerUserId: string,
  rawInput: IssueInvoiceInput,
): Promise<InvoiceDto> {
  const parsed = IssueInvoiceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid invoice issue request.",
    );
  }
  const { invoiceId, expectedVersion } = parsed.data;
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: { id: invoiceId, ownerUserId },
        select: {
          id: true,
          status: true,
          version: true,
          tenantId: true,
          transientGuestId: true,
          assignmentId: true,
          snapshotTenantName: true,
          snapshotRoomNumber: true,
          snapshotBedNumber: true,
          snapshotMonthlyRate: true,
          snapshotProrationPolicy: true,
          snapshotDepositPolicy: true,
          tenant: { select: { fullName: true } },
          transientGuest: { select: { fullName: true } },
          assignment: {
            select: {
              monthlyRate: true,
              room: { select: { title: true } },
              bed: { select: { number: true } },
            },
          },
          transientReservation: {
            select: {
              dailyRate: true,
              room: { select: { title: true } },
              bed: { select: { number: true } },
            },
          },
        },
      });
      if (!existing) {
        throw new NotFoundError("The requested invoice was not found.");
      }
      if (existing.status !== "DRAFT") {
        throw new PreconditionError("Only draft invoices can be issued.");
      }

      const policies = getServerBillingPolicies();
      const prefix = policies.invoicePrefix;

      const nowUtc = new Date();
      const issueYear = Number(toManilaDate(nowUtc).slice(0, 4));
      const invoiceNumber = await allocateInvoiceNumberInTx(
        tx,
        ownerUserId,
        prefix,
        issueYear,
      );

      const updatedCount = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          ownerUserId,
          version: expectedVersion,
          status: "DRAFT",
        },
        data: {
          status: "ISSUED",
          invoiceNumber,
          issuedAt: nowUtc,
          version: { increment: 1 },
          snapshotTenantName:
            existing.snapshotTenantName ??
            existing.tenant?.fullName ??
            existing.transientGuest?.fullName ??
            null,
          snapshotRoomNumber:
            existing.snapshotRoomNumber ??
            existing.assignment?.room.title ??
            existing.transientReservation?.room.title ??
            null,
          snapshotBedNumber:
            existing.snapshotBedNumber ??
            existing.assignment?.bed.number ??
            existing.transientReservation?.bed?.number ??
            null,
          snapshotMonthlyRate:
            existing.snapshotMonthlyRate ??
            (existing.assignment
              ? decimalToString(existing.assignment.monthlyRate)
              : existing.transientReservation
                ? decimalToString(existing.transientReservation.dailyRate)
                : null),
          snapshotProrationPolicy:
            existing.snapshotProrationPolicy ?? policies.prorationPolicy,
          snapshotDepositPolicy:
            existing.snapshotDepositPolicy ?? policies.depositPolicy,
        },
      });

      if (updatedCount.count === 0) {
        throw new ConflictError(
          "This invoice changed since you loaded it. Reload and review before issuing.",
        );
      }

      const issued = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        select: invoiceSelect,
      });

      let dto = toInvoiceDto(issued, nowUtc);
      const sequence = await publishInvoiceSnapshotInTx(tx, ownerUserId, dto);
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "billing",
        action: "invoice.issued",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "invoice",
        entityId: dto.id,
        metadata: {
          invoiceNumber: dto.invoiceNumber,
          billingPeriod: dto.billingPeriod,
          totalAmount: dto.totalAmount,
          dueDateManila: dto.dueDateManila,
          version: dto.version,
        },
      });

      const creditApplied = await applyAvailableCreditToInvoiceInTx(
        tx,
        ownerUserId,
        {
          invoiceId: issued.id,
          tenantId: issued.tenantId,
          transientGuestId: issued.transientGuestId,
          totalAmountCentavos: parseMoneyDecimal(dto.totalAmount),
          currentPaidCentavos: ZERO,
          status: "ISSUED",
          version: issued.version,
        },
        { actorType: "owner", actorId: ownerUserId },
      );
      if (creditApplied.appliedCentavos > ZERO) {
        const reloaded = await tx.invoice.findUniqueOrThrow({
          where: { id: issued.id },
          select: invoiceSelect,
        });
        dto = toInvoiceDto(reloaded, nowUtc);
        await publishInvoiceSnapshotInTx(tx, ownerUserId, dto);
      }

      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Adds a linked CREDIT or CHARGE adjustment to an issued/partially-paid invoice
 * without editing posted line items in place.
 */
export async function addInvoiceAdjustment(
  ownerUserId: string,
  rawInput: AddInvoiceAdjustmentInput,
): Promise<InvoiceDto> {
  const parsed = AddInvoiceAdjustmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Check adjustment details and try again.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: { id: input.invoiceId, ownerUserId },
        select: {
          id: true,
          status: true,
          version: true,
          subtotalAmount: true,
          adjustmentAmount: true,
          paidAmount: true,
        },
      });
      if (!existing) {
        throw new NotFoundError("The requested invoice was not found.");
      }
      if (
        existing.status !== "ISSUED" &&
        existing.status !== "PARTIALLY_PAID"
      ) {
        throw new PreconditionError(
          "Only issued or partially paid invoices can receive adjustments.",
        );
      }

      const subtotalCentavos = parseMoneyDecimal(
        existing.subtotalAmount.toString(),
      );
      const currentAdjustmentCentavos = parseMoneyDecimal(
        existing.adjustmentAmount.toString(),
      );
      const paidCentavos = parseMoneyDecimal(existing.paidAmount.toString());
      const deltaCentavos = parseMoneyDecimal(input.amount);
      const signedDelta =
        input.type === "CREDIT" ? -deltaCentavos : deltaCentavos;

      const nextAdjustmentCentavos = addMoney(
        currentAdjustmentCentavos,
        signedDelta,
      );
      const nextTotalCentavos = addMoney(
        subtotalCentavos,
        nextAdjustmentCentavos,
      );

      if (nextTotalCentavos < ZERO) {
        throw new ValidationError(
          "Credit adjustment cannot reduce the invoice total below zero.",
        );
      }
      if (nextTotalCentavos < paidCentavos) {
        throw new ValidationError(
          "Credit adjustment cannot reduce the invoice total below the amount already paid.",
        );
      }

      const nextStatus: InvoiceStatusValue =
        paidCentavos > ZERO && paidCentavos === nextTotalCentavos
          ? "PAID"
          : paidCentavos > ZERO
            ? "PARTIALLY_PAID"
            : "ISSUED";

      const updatedCount = await tx.invoice.updateMany({
        where: {
          id: input.invoiceId,
          ownerUserId,
          version: input.expectedVersion,
          status: existing.status,
        },
        data: {
          adjustmentAmount: formatMoneyDecimal(nextAdjustmentCentavos),
          totalAmount: formatMoneyDecimal(nextTotalCentavos),
          status: nextStatus,
          version: { increment: 1 },
        },
      });

      if (updatedCount.count === 0) {
        throw new ConflictError(
          "This invoice changed since you loaded it. Reload and review before adjusting.",
        );
      }

      const adjustment = await tx.invoiceAdjustment.create({
        data: {
          id: randomUUID(),
          ownerUserId,
          invoiceId: input.invoiceId,
          type: input.type,
          amount: input.amount,
          reason: input.reason,
          createdByActorType: "owner",
          createdByActorId: ownerUserId,
        },
        select: { id: true },
      });

      const refreshed = await tx.invoice.findUniqueOrThrow({
        where: { id: input.invoiceId },
        select: invoiceSelect,
      });

      const dto = toInvoiceDto(refreshed);
      const sequence = await publishInvoiceSnapshotInTx(tx, ownerUserId, dto);
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "billing",
        action: "invoice.adjusted",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "invoice",
        entityId: dto.id,
        metadata: {
          adjustmentId: adjustment.id,
          adjustmentType: input.type,
          amount: input.amount,
          totalAmount: dto.totalAmount,
          status: dto.status,
          version: dto.version,
        },
      });

      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Voids an unpaid DRAFT or ISSUED invoice while retaining full history.
 * Invoices with allocated payments must reverse payments first.
 */
export async function voidInvoice(
  ownerUserId: string,
  rawInput: VoidInvoiceInput,
): Promise<InvoiceDto> {
  const parsed = VoidInvoiceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Enter a reason to void this invoice.",
    );
  }
  const { invoiceId, expectedVersion, reason } = parsed.data;
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: { id: invoiceId, ownerUserId },
        select: {
          id: true,
          status: true,
          invoiceNumber: true,
          paidAmount: true,
        },
      });
      if (!existing) {
        throw new NotFoundError("The requested invoice was not found.");
      }
      if (existing.status === "VOID") {
        throw new ConflictError("This invoice is already voided.");
      }

      const paidCentavos = parseMoneyDecimal(existing.paidAmount.toString());
      if (
        paidCentavos > ZERO ||
        existing.status === "PARTIALLY_PAID" ||
        existing.status === "PAID"
      ) {
        throw new PreconditionError(
          "Reverse recorded payments before voiding this invoice.",
        );
      }

      const nowUtc = new Date();
      let assignedNumber = existing.invoiceNumber;
      if (!assignedNumber) {
        assignedNumber = `VOID-DRAFT-${invoiceId}`;
      }

      const updatedCount = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          ownerUserId,
          version: expectedVersion,
          status: { in: ["DRAFT", "ISSUED"] },
        },
        data: {
          status: "VOID",
          invoiceNumber: assignedNumber,
          voidReason: reason,
          voidedAt: nowUtc,
          version: { increment: 1 },
        },
      });

      if (updatedCount.count === 0) {
        throw new ConflictError(
          "This invoice changed since you loaded it. Reload and review before voiding.",
        );
      }

      const voided = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        select: invoiceSelect,
      });

      const dto = toInvoiceDto(voided, nowUtc);
      const sequence = await publishInvoiceSnapshotInTx(tx, ownerUserId, dto);
      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "billing",
        action: "invoice.voided",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "invoice",
        entityId: dto.id,
        metadata: {
          invoiceNumber: dto.invoiceNumber,
          totalAmount: dto.totalAmount,
          version: dto.version,
        },
      });

      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Generates and optionally issues a transient stay invoice inside an existing
 * transaction so transient stay charges flow through the standard Billing &
 * Payments ledger (`INV-YYYY-XXXXXX`, line items, credit application, change feed).
 */
export async function createTransientStayInvoiceInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  input: {
    transientReservationId: string;
    dueDateManila?: string;
    issueImmediately?: boolean;
    notes?: string | null;
  },
  actor: { actorType: AuditActorType; actorId: string } = {
    actorType: "owner",
    actorId: ownerUserId,
  },
): Promise<InvoiceDto> {
  const reservation = await tx.transientReservation.findFirst({
    where: { id: input.transientReservationId, ownerUserId },
    select: {
      id: true,
      guestId: true,
      scope: true,
      status: true,
      checkInDateManila: true,
      checkOutDateManila: true,
      startDate: true,
      endDate: true,
      nights: true,
      dailyRate: true,
      totalAmount: true,
      guest: { select: { fullName: true } },
      room: { select: { title: true } },
      bed: { select: { number: true } },
    },
  });
  if (!reservation) {
    throw new NotFoundError(
      "The requested transient reservation was not found.",
    );
  }
  if (reservation.status === "CANCELLED" || reservation.status === "NO_SHOW") {
    throw new PreconditionError("Cancelled or no-show stays cannot be billed.");
  }

  const existingActive = await tx.invoice.findFirst({
    where: {
      ownerUserId,
      transientReservationId: reservation.id,
      status: { not: "VOID" },
    },
    select: { id: true },
  });
  if (existingActive) {
    throw new ConflictError(
      "An active invoice already exists for this transient stay. Void it before regenerating.",
    );
  }

  const issueImmediately = input.issueImmediately ?? true;
  const dueDateManila = input.dueDateManila ?? reservation.checkInDateManila;
  const nowUtc = new Date();

  let invoiceNumber: string | null = null;
  if (issueImmediately) {
    const prefix = requireInvoicePrefixInTx();
    const issueYear = Number(toManilaDate(nowUtc).slice(0, 4));
    invoiceNumber = await allocateInvoiceNumberInTx(
      tx,
      ownerUserId,
      prefix,
      issueYear,
    );
  }

  const dailyRateStr = decimalToString(reservation.dailyRate);
  const totalAmountStr = decimalToString(reservation.totalAmount);
  const quantityStr = `${reservation.nights}.00`;
  const scopeLabel =
    reservation.scope === "WHOLE_ROOM"
      ? `Room ${reservation.room.title} (Whole room)`
      : `Room ${reservation.room.title} (Bed ${reservation.bed?.number ?? "—"})`;
  const description = `Transient stay: ${scopeLabel}, ${reservation.nights} ${
    reservation.nights === 1 ? "night" : "nights"
  } (${reservation.checkInDateManila} to ${reservation.checkOutDateManila})`;

  const status: InvoiceStatusValue = issueImmediately ? "ISSUED" : "DRAFT";

  try {
    const created = await tx.invoice.create({
      data: {
        id: randomUUID(),
        ownerUserId,
        tenantId: null,
        transientGuestId: reservation.guestId,
        transientReservationId: reservation.id,
        assignmentId: null,
        version: 1,
        invoiceNumber,
        billingPeriod: null,
        periodStartDate: reservation.startDate,
        periodEndDate: reservation.endDate,
        dueDate: manilaDateTimeToUtc(dueDateManila, "00:00"),
        status,
        subtotalAmount: totalAmountStr,
        adjustmentAmount: "0.00",
        totalAmount: totalAmountStr,
        paidAmount: "0.00",
        snapshotTenantName: reservation.guest.fullName,
        snapshotRoomNumber: reservation.room.title,
        snapshotBedNumber:
          reservation.scope === "WHOLE_ROOM"
            ? "Whole room"
            : (reservation.bed?.number ?? null),
        snapshotMonthlyRate: dailyRateStr,
        notes: input.notes ?? null,
        issuedAt: issueImmediately ? nowUtc : null,
        items: {
          create: [
            {
              ownerUserId,
              itemType: "RENT",
              description,
              quantity: quantityStr,
              unitAmount: dailyRateStr,
              lineTotal: totalAmountStr,
              sortOrder: 0,
            },
          ],
        },
      },
      select: invoiceSelect,
    });

    let dto = toInvoiceDto(created, nowUtc);
    const sequence = await publishInvoiceSnapshotInTx(tx, ownerUserId, dto);
    await writeAuditEntry(tx, {
      ownerUserId,
      sequence,
      area: "billing",
      action: issueImmediately ? "invoice.issued" : "invoice.generated",
      actorType: actor.actorType,
      actorId: actor.actorId,
      entityType: "invoice",
      entityId: dto.id,
      metadata: {
        transientReservationId: reservation.id,
        transientGuestId: reservation.guestId,
        status,
        invoiceNumber,
        totalAmount: dto.totalAmount,
        itemCount: dto.items.length,
      },
    });

    if (issueImmediately) {
      const creditApplied = await applyAvailableCreditToInvoiceInTx(
        tx,
        ownerUserId,
        {
          invoiceId: created.id,
          tenantId: null,
          transientGuestId: created.transientGuestId,
          totalAmountCentavos: parseMoneyDecimal(dto.totalAmount),
          currentPaidCentavos: ZERO,
          status: "ISSUED",
          version: created.version,
        },
        actor,
      );
      if (creditApplied.appliedCentavos > ZERO) {
        const reloaded = await tx.invoice.findUniqueOrThrow({
          where: { id: created.id },
          select: invoiceSelect,
        });
        dto = toInvoiceDto(reloaded, nowUtc);
        await publishInvoiceSnapshotInTx(tx, ownerUserId, dto);
      }
    }

    return dto;
  } catch (error) {
    if (
      isPgConstraintError(
        error,
        "23505",
        "Invoice_ownerUserId_transientReservationId_active_key",
      )
    ) {
      throw new ConflictError(
        "An active invoice already exists for this transient stay.",
      );
    }
    throw error;
  }
}
