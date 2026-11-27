import "server-only";
import { randomUUID } from "node:crypto";
import { formatBillingPeriodLabel } from "@/features/billing/calculations";
import {
  diffManilaDays,
  formatManilaDate,
  manilaDateTimeToUtc,
  toManilaDate,
} from "@/lib/dates";
import {
  NotFoundError,
  PreconditionError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";
import {
  formatMoneyDecimal,
  formatPhpCurrency,
  parseMoneyDecimal,
} from "@/lib/money";
import { getServerSmsConfig } from "@/config/business-config";
import { getDatabase } from "@/server/db/client";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import {
  sendSemaphoreSms,
  type SemaphoreSendParams,
  type SemaphoreSendResult,
} from "@/server/sms/semaphore";
import { writeAuditEntry } from "@/server/sync/publish";
import {
  normalizePhilippineMobileNumber,
  renderOverdueSmsTemplate,
  SendSingleOverdueSmsSchema,
  type OverdueSmsBatchSummary,
  type SendSingleOverdueSmsInput,
} from "./schemas";

const MANUAL_SMS_LIMIT_MAX = 20;
const MANUAL_SMS_LIMIT_WINDOW_SECONDS = 600;
const TEST_SMS_LIMIT_MAX = 5;
const TEST_SMS_LIMIT_WINDOW_SECONDS = 600;
const MAX_BATCH_INVOICES_PER_RUN = 100;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function toManilaTimeHHmm(instant: Date): string {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MS);
  const hours = shifted.getUTCHours().toString().padStart(2, "0");
  const minutes = shifted.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export type SmsSenderFn = (
  params: SemaphoreSendParams,
) => Promise<SemaphoreSendResult>;

type SmsActor = {
  actorType: "owner" | "scheduled_job";
  actorId: string;
};

async function consumeSmsRateLimit(
  ownerUserId: string,
  workload: "manual" | "test",
): Promise<void> {
  const db = getDatabase();
  const prefix = `sms:${ownerUserId}:`;
  const key = `${prefix}${workload}`;
  const maximum =
    workload === "test" ? TEST_SMS_LIMIT_MAX : MANUAL_SMS_LIMIT_MAX;
  const seconds =
    workload === "test"
      ? TEST_SMS_LIMIT_WINDOW_SECONDS
      : MANUAL_SMS_LIMIT_WINDOW_SECONDS;

  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "SecurityRateLimit"
      WHERE starts_with("key", ${prefix}) AND "resetsAt" <= CURRENT_TIMESTAMP
    `;
    return tx.$queryRaw<Array<{ count: number; retry: number }>>`
      INSERT INTO "SecurityRateLimit" ("key", "count", "resetsAt")
      VALUES (${key}, 1, CURRENT_TIMESTAMP + (${seconds} * interval '1 second'))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "SecurityRateLimit"."count" + 1
        END,
        "resetsAt" = CASE
          WHEN "SecurityRateLimit"."resetsAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${seconds} * interval '1 second')
          ELSE "SecurityRateLimit"."resetsAt"
        END
      RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetsAt" - CURRENT_TIMESTAMP))))::int AS retry
    `;
  });

  const row = rows[0];
  if (row && row.count > maximum) {
    throw new RateLimitedError(
      row.retry,
      workload === "test"
        ? "You have sent several sample texts recently. Wait a few minutes before sending another."
        : "Too many SMS send requests in a short window. Wait a few minutes and try again.",
    );
  }
}

function classifySafeSmsErrorCode(error: unknown): string {
  if (error instanceof ValidationError) return "validation_error";
  if (error instanceof Error) {
    if (error.message.includes("API key")) return "provider_auth_error";
    if (error.message.includes("rate limit")) return "provider_rate_limited";
    if (error.message.includes("HTTP ")) return "provider_http_error";
  }
  return "provider_unavailable";
}

function buildRenderedOverdueMessage(params: {
  template: string | null;
  businessName: string;
  tenantName: string;
  roomNumber: string | null;
  invoiceNumber: string | null;
  billingPeriod: string | null;
  dueDateManila: string;
  balanceDecimal: string;
  daysOverdue: number;
}): string {
  return renderOverdueSmsTemplate(params.template, {
    tenantName: params.tenantName,
    roomNumber: params.roomNumber ?? "your room",
    invoiceNumber: params.invoiceNumber ?? "Rent bill",
    billingPeriod: params.billingPeriod
      ? formatBillingPeriodLabel(params.billingPeriod)
      : "monthly",
    dueDate: formatManilaDate(params.dueDateManila),
    balance: formatPhpCurrency(params.balanceDecimal),
    daysOverdue: params.daysOverdue,
    businessName: params.businessName.trim() || "Boarding House Management",
  });
}

async function recordOverdueSmsOutcome(params: {
  ownerUserId: string;
  invoiceId: string;
  tenantId: string;
  notifiedDateManila: string;
  status: "SENT" | "FAILED";
  providerMessageId: string | null;
  errorCode: string | null;
  actor: SmsActor;
}): Promise<void> {
  const db = getDatabase();
  await db.$transaction(async (tx) => {
    await ensureOwnerRecord(tx, params.ownerUserId);
    const log = await tx.overdueSmsLog.upsert({
      where: {
        ownerUserId_invoiceId_notifiedDateManila: {
          ownerUserId: params.ownerUserId,
          invoiceId: params.invoiceId,
          notifiedDateManila: params.notifiedDateManila,
        },
      },
      create: {
        id: randomUUID(),
        ownerUserId: params.ownerUserId,
        invoiceId: params.invoiceId,
        tenantId: params.tenantId,
        notifiedDateManila: params.notifiedDateManila,
        status: params.status,
        providerMessageId: params.providerMessageId,
        errorCode: params.errorCode,
        actorType: params.actor.actorType,
        actorId: params.actor.actorId,
      },
      update: {
        status: params.status,
        providerMessageId: params.providerMessageId,
        errorCode: params.errorCode,
        actorType: params.actor.actorType,
        actorId: params.actor.actorId,
      },
      select: { id: true },
    });

    await writeAuditEntry(tx, {
      ownerUserId: params.ownerUserId,
      area: "billing",
      action:
        params.status === "SENT"
          ? "billing.overdue_sms_sent"
          : "billing.overdue_sms_failed",
      actorType: params.actor.actorType,
      actorId: params.actor.actorId,
      entityType: "invoice",
      entityId: params.invoiceId,
      metadata: {
        smsLogId: log.id,
        tenantId: params.tenantId,
        notifiedDateManila: params.notifiedDateManila,
        ...(params.providerMessageId
          ? { providerMessageId: params.providerMessageId }
          : {}),
        ...(params.errorCode ? { errorCode: params.errorCode } : {}),
      },
    });
  });
}

export type SingleOverdueSmsResult =
  | {
      sent: true;
      alreadySentToday: false;
      providerMessageId: string | null;
      notifiedDateManila: string;
    }
  | {
      sent: false;
      alreadySentToday: true;
      notifiedDateManila: string;
    };

/**
 * Sends a single Semaphore overdue SMS reminder for an overdue boarding house
 * tenant invoice. External HTTP I/O runs outside database transactions.
 */
export async function sendOverdueSmsForInvoice(
  ownerUserId: string,
  rawInput: SendSingleOverdueSmsInput,
  options?: {
    actor?: SmsActor;
    nowUtc?: Date;
    sender?: SmsSenderFn;
    skipRateLimit?: boolean;
  },
): Promise<SingleOverdueSmsResult> {
  const parsed = SendSingleOverdueSmsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid overdue SMS request.",
    );
  }
  const input = parsed.data;
  const actor: SmsActor = options?.actor ?? {
    actorType: "owner",
    actorId: ownerUserId,
  };
  const nowUtc = options?.nowUtc ?? new Date();
  const todayManila = toManilaDate(nowUtc);
  const sender = options?.sender ?? sendSemaphoreSms;

  if (!options?.skipRateLimit && actor.actorType === "owner") {
    await consumeSmsRateLimit(ownerUserId, "manual");
  }

  const smsConfig = getServerSmsConfig();
  const db = getDatabase();
  const [settings, invoice, existingLog] = await Promise.all([
    db.businessSettings.findUnique({
      where: { ownerUserId },
      select: {
        businessName: true,
      },
    }),
    db.invoice.findFirst({
      where: { id: input.invoiceId, ownerUserId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        invoiceNumber: true,
        billingPeriod: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        snapshotTenantName: true,
        snapshotRoomNumber: true,
        tenant: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
      },
    }),
    db.overdueSmsLog.findUnique({
      where: {
        ownerUserId_invoiceId_notifiedDateManila: {
          ownerUserId,
          invoiceId: input.invoiceId,
          notifiedDateManila: todayManila,
        },
      },
      select: { status: true },
    }),
  ]);

  if (!smsConfig.apiKey) {
    throw new PreconditionError(
      "Text reminders are not connected yet. Ask your setup contact to enable SMS delivery.",
    );
  }
  if (!invoice) {
    throw new NotFoundError("Invoice not found.");
  }
  if (!invoice.tenantId || !invoice.tenant) {
    throw new PreconditionError(
      "Overdue SMS reminders apply to boarding house tenant invoices only.",
    );
  }
  if (invoice.status !== "ISSUED" && invoice.status !== "PARTIALLY_PAID") {
    throw new PreconditionError(
      "Only open issued or partially paid invoices can receive overdue SMS reminders.",
    );
  }

  const balanceCentavos =
    parseMoneyDecimal(invoice.totalAmount.toString()) -
    parseMoneyDecimal(invoice.paidAmount.toString());
  if (balanceCentavos <= BigInt(0)) {
    throw new PreconditionError("This invoice has no remaining balance due.");
  }

  const dueDateManila = toManilaDate(invoice.dueDate);
  const daysOverdue = diffManilaDays(dueDateManila, todayManila);
  if (daysOverdue <= 0) {
    throw new PreconditionError("This invoice is not overdue yet.");
  }

  if (existingLog?.status === "SENT" && !input.forceResendToday) {
    return {
      sent: false,
      alreadySentToday: true,
      notifiedDateManila: todayManila,
    };
  }

  const normalizedPhone = normalizePhilippineMobileNumber(invoice.tenant.phone);
  if (!normalizedPhone) {
    throw new PreconditionError(
      invoice.tenant.phone
        ? "Tenant phone number is not a valid Philippine mobile number (09XXXXXXXXX)."
        : "Add a mobile phone number to this tenant's profile before sending an SMS.",
    );
  }

  const apiKey = smsConfig.apiKey;
  const message = buildRenderedOverdueMessage({
    template: smsConfig.overdueTemplate,
    businessName: settings?.businessName ?? "",
    tenantName:
      invoice.tenant.fullName || invoice.snapshotTenantName || "Tenant",
    roomNumber: invoice.snapshotRoomNumber,
    invoiceNumber: invoice.invoiceNumber,
    billingPeriod: invoice.billingPeriod,
    dueDateManila,
    balanceDecimal: formatMoneyDecimal(balanceCentavos),
    daysOverdue,
  });

  try {
    const result = await sender({
      apiKey,
      recipient: normalizedPhone,
      message,
      senderName: smsConfig.senderName,
    });

    await recordOverdueSmsOutcome({
      ownerUserId,
      invoiceId: invoice.id,
      tenantId: invoice.tenant.id,
      notifiedDateManila: todayManila,
      status: "SENT",
      providerMessageId: result.messageId,
      errorCode: null,
      actor,
    });

    return {
      sent: true,
      alreadySentToday: false,
      providerMessageId: result.messageId,
      notifiedDateManila: todayManila,
    };
  } catch (error) {
    await recordOverdueSmsOutcome({
      ownerUserId,
      invoiceId: invoice.id,
      tenantId: invoice.tenant.id,
      notifiedDateManila: todayManila,
      status: "FAILED",
      providerMessageId: null,
      errorCode: classifySafeSmsErrorCode(error),
      actor,
    });
    throw error;
  }
}

/**
 * Evaluates all overdue boarding house tenant invoices for the Owner and sends
 * at most one Semaphore SMS reminder per overdue invoice per Asia/Manila day.
 */
export async function sendOverdueSmsBatch(
  ownerUserId: string,
  options?: {
    actor?: SmsActor;
    nowUtc?: Date;
    requireEnabled?: boolean;
    sender?: SmsSenderFn;
    skipRateLimit?: boolean;
  },
): Promise<OverdueSmsBatchSummary> {
  const actor: SmsActor = options?.actor ?? {
    actorType: "owner",
    actorId: ownerUserId,
  };
  const nowUtc = options?.nowUtc ?? new Date();
  const todayManila = toManilaDate(nowUtc);
  const todayStartUtc = manilaDateTimeToUtc(todayManila, "00:00");
  const sender = options?.sender ?? sendSemaphoreSms;

  const summary: OverdueSmsBatchSummary = {
    notifiedDateManila: todayManila,
    evaluatedCount: 0,
    sentCount: 0,
    alreadySentTodayCount: 0,
    skippedNoPhoneCount: 0,
    skippedInvalidPhoneCount: 0,
    failedCount: 0,
  };

  if (!options?.skipRateLimit && actor.actorType === "owner") {
    await consumeSmsRateLimit(ownerUserId, "manual");
  }

  const smsConfig = getServerSmsConfig();
  const db = getDatabase();
  const settings = await db.businessSettings.findUnique({
    where: { ownerUserId },
    select: {
      businessName: true,
      smsOverdueEnabled: true,
      smsOverdueSendTimeManila: true,
    },
  });

  if (options?.requireEnabled) {
    if (!settings?.smsOverdueEnabled || !smsConfig.apiKey) {
      return summary;
    }
    const currentManilaHHmm = toManilaTimeHHmm(nowUtc);
    const configuredSendTime = settings.smsOverdueSendTimeManila || "09:00";
    if (currentManilaHHmm < configuredSendTime) {
      return summary;
    }
  } else if (!smsConfig.apiKey) {
    throw new PreconditionError(
      "Text reminders are not connected yet. Ask your setup contact to enable SMS delivery.",
    );
  }

  const frequencyDays = Math.max(1, smsConfig.overdueFrequencyDays || 1);
  const apiKey = smsConfig.apiKey;

  const overdueInvoices = await db.invoice.findMany({
    where: {
      ownerUserId,
      tenantId: { not: null },
      status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      dueDate: { lt: todayStartUtc },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: MAX_BATCH_INVOICES_PER_RUN,
    select: {
      id: true,
      tenantId: true,
      invoiceNumber: true,
      billingPeriod: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      snapshotTenantName: true,
      snapshotRoomNumber: true,
      tenant: {
        select: {
          id: true,
          fullName: true,
          phone: true,
        },
      },
      overdueSmsLogs: {
        where: {
          ownerUserId,
          status: "SENT",
        },
        orderBy: { notifiedDateManila: "desc" },
        select: { notifiedDateManila: true, status: true },
        take: 1,
      },
    },
  });

  for (const invoice of overdueInvoices) {
    if (!invoice.tenantId || !invoice.tenant) continue;
    const balanceCentavos =
      parseMoneyDecimal(invoice.totalAmount.toString()) -
      parseMoneyDecimal(invoice.paidAmount.toString());
    if (balanceCentavos <= BigInt(0)) continue;

    const dueDateManila = toManilaDate(invoice.dueDate);
    const daysOverdue = diffManilaDays(dueDateManila, todayManila);
    if (daysOverdue <= 0) continue;

    summary.evaluatedCount += 1;

    const lastSentDate = invoice.overdueSmsLogs[0]?.notifiedDateManila ?? null;
    if (lastSentDate) {
      const daysSinceLastSent = diffManilaDays(lastSentDate, todayManila);
      const minIntervalDays = options?.requireEnabled ? frequencyDays : 1;
      if (daysSinceLastSent < minIntervalDays) {
        summary.alreadySentTodayCount += 1;
        continue;
      }
    }

    if (!invoice.tenant.phone?.trim()) {
      summary.skippedNoPhoneCount += 1;
      continue;
    }

    const normalizedPhone = normalizePhilippineMobileNumber(
      invoice.tenant.phone,
    );
    if (!normalizedPhone) {
      summary.skippedInvalidPhoneCount += 1;
      continue;
    }

    const message = buildRenderedOverdueMessage({
      template: smsConfig.overdueTemplate,
      businessName: settings?.businessName ?? "",
      tenantName:
        invoice.tenant.fullName || invoice.snapshotTenantName || "Tenant",
      roomNumber: invoice.snapshotRoomNumber,
      invoiceNumber: invoice.invoiceNumber,
      billingPeriod: invoice.billingPeriod,
      dueDateManila,
      balanceDecimal: formatMoneyDecimal(balanceCentavos),
      daysOverdue,
    });

    try {
      const result = await sender({
        apiKey,
        recipient: normalizedPhone,
        message,
        senderName: smsConfig.senderName,
      });

      await recordOverdueSmsOutcome({
        ownerUserId,
        invoiceId: invoice.id,
        tenantId: invoice.tenant.id,
        notifiedDateManila: todayManila,
        status: "SENT",
        providerMessageId: result.messageId,
        errorCode: null,
        actor,
      });
      summary.sentCount += 1;
    } catch (error) {
      await recordOverdueSmsOutcome({
        ownerUserId,
        invoiceId: invoice.id,
        tenantId: invoice.tenant.id,
        notifiedDateManila: todayManila,
        status: "FAILED",
        providerMessageId: null,
        errorCode: classifySafeSmsErrorCode(error),
        actor,
      });
      summary.failedCount += 1;
    }
  }

  return summary;
}
