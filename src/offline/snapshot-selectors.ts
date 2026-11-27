import type {
  MaintenanceAttachmentDto,
  MaintenanceCategoryValue,
  MaintenanceDetailDto,
  MaintenanceHoldDto,
  MaintenanceOverviewDto,
  MaintenancePriorityValue,
  MaintenanceRequestDto,
  MaintenanceRoomOptionDto,
  MaintenanceStatusValue,
  MaintenanceUpdateDto,
} from "@/features/maintenance/schemas";
import type {
  PaymentAllocationDto,
  PaymentDto,
  PaymentMethodValue,
  PaymentOpenInvoiceOptionDto,
  PaymentProofDto,
  PaymentsOverviewDto,
  PaymentStatusValue,
  PaymentTenantOptionDto,
  PaymentTransientOptionDto,
} from "@/features/payments/schemas";
import type { RoomBuildingValue } from "@/features/rooms/schemas";
import type {
  AssignableBedOptionDto,
  TenantAssignmentDto,
  TenantDto,
  TenantListItemDto,
  TenantNoteDto,
  TenantsOverviewDto,
} from "@/features/tenants/schemas";
import { toManilaDate } from "@/lib/dates";
import {
  addMoney,
  formatMoneyDecimal,
  parseMoneyDecimal,
  subtractMoney,
} from "@/lib/money";
import {
  listActiveOutboxRecords,
  listDecryptedProjections,
  type DecryptedEntityView,
} from "./client";
import type { DaisyOfflineDatabase, OutboxRecord, VaultMetaRecord } from "./db";

export const ZERO_CENTAVOS = BigInt(0);

export type OfflineEntitySyncBadge = {
  status: "pending" | "conflict" | "rejected" | "blocked";
  opId: string;
  reason: string | null;
  type: string;
};

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function parseSafeMoney(value: unknown): bigint {
  if (typeof value !== "string" && typeof value !== "number") {
    return ZERO_CENTAVOS;
  }
  try {
    return parseMoneyDecimal(String(value));
  } catch {
    return ZERO_CENTAVOS;
  }
}

export function isRecordDeletedOrTombstone(row: DecryptedEntityView): boolean {
  return row.data._tombstone === true || row.data._operation === "tombstone";
}

function toTenantDtoFromRecord(row: DecryptedEntityView): TenantDto | null {
  const fullName = asString(row.data.fullName)?.trim();
  if (!fullName) return null;

  return {
    id: asNonEmptyString(row.data.id, row.entityId),
    version: Math.max(
      row.isPendingLocal ? 0 : 1,
      asNumber(row.data._version ?? row.data.version, 1),
    ),
    fullName,
    phone: asString(row.data.phone),
    email: asString(row.data.email),
    address: asString(row.data.address),
    emergencyContact: asString(row.data.emergencyContact),
    notes: asString(row.data.notes),
    archivedAt: asString(row.data.archivedAt),
    createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
    updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
  };
}

function toTenantAssignmentDto(
  row: DecryptedEntityView,
): TenantAssignmentDto | null {
  const tenantId = asString(row.data.tenantId);
  const roomId = asString(row.data.roomId);
  const bedId = asString(row.data.bedId);
  const allocationId = asString(row.data.allocationId);
  if (!tenantId || !roomId || !bedId || !allocationId) return null;

  const statusRaw = asString(row.data.status);
  const status =
    statusRaw === "ACTIVE" ||
    statusRaw === "COMPLETED" ||
    statusRaw === "CANCELLED"
      ? statusRaw
      : "ACTIVE";

  return {
    id: asNonEmptyString(row.data.id, row.entityId),
    tenantId,
    roomId,
    roomNumber: asNonEmptyString(row.data.roomNumber, "—"),
    bedId,
    bedNumber: asNonEmptyString(row.data.bedNumber, "—"),
    bedLabel: asString(row.data.bedLabel),
    allocationId,
    startDate: asNonEmptyString(row.data.startDate, row.updatedAt),
    endDate: asNonEmptyString(row.data.endDate, row.updatedAt),
    startDateManila: asNonEmptyString(row.data.startDateManila),
    endDateManila: asNonEmptyString(row.data.endDateManila),
    actualMoveOutDate: asString(row.data.actualMoveOutDate),
    actualMoveOutDateManila: asString(row.data.actualMoveOutDateManila),
    monthlyRate: formatMoneyDecimal(parseSafeMoney(row.data.monthlyRate)),
    securityDeposit: formatMoneyDecimal(
      parseSafeMoney(row.data.securityDeposit),
    ),
    status,
    version: Math.max(1, asNumber(row.data._version ?? row.data.version, 1)),
    notes: asString(row.data.notes),
    createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
    updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
  };
}

function toTenantNoteDto(row: DecryptedEntityView): TenantNoteDto | null {
  if (isRecordDeletedOrTombstone(row)) return null;
  const tenantId = asString(row.data.tenantId);
  const content = asString(row.data.content);
  if (!tenantId || !content) return null;

  return {
    id: asNonEmptyString(row.data.id, row.entityId),
    tenantId,
    content,
    createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
    updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
  };
}

function isNeedsAttentionStatus(
  status: OutboxRecord["status"],
): status is "conflict" | "rejected" | "blocked" {
  return status === "conflict" || status === "rejected" || status === "blocked";
}

/**
 * Indexes active local outbox operations by `entityId`, prioritizing
 * `Needs attention` outcomes over normal `pending` / `syncing` operations.
 */
export function buildSyncBadgeMap(
  outboxRows: OutboxRecord[],
  entityTypes?: string[],
): Record<string, OfflineEntitySyncBadge> {
  const allowed = entityTypes?.length ? new Set(entityTypes) : null;
  const badges: Record<string, OfflineEntitySyncBadge> = {};

  for (const row of outboxRows) {
    if (allowed && !allowed.has(row.entityType)) continue;
    if (row.status === "applied") continue;

    const mappedStatus: OfflineEntitySyncBadge["status"] =
      isNeedsAttentionStatus(row.status) ? row.status : "pending";

    const existing = badges[row.entityId];
    if (
      existing &&
      isNeedsAttentionStatus(existing.status) &&
      !isNeedsAttentionStatus(mappedStatus)
    ) {
      continue;
    }

    badges[row.entityId] = {
      status: mappedStatus,
      opId: row.opId,
      reason: row.reason,
      type: row.type,
    };
  }

  return badges;
}

function computeDerivedBalancesByTenant(
  projections: DecryptedEntityView[],
): Map<string, string> {
  const unpaidByTenant = new Map<string, bigint>();
  const creditByTenant = new Map<string, bigint>();

  for (const row of projections) {
    if (row.entityType === "invoice" && !isRecordDeletedOrTombstone(row)) {
      const tenantId = asString(row.data.tenantId);
      const status = asString(row.data.status);
      if (!tenantId || (status !== "ISSUED" && status !== "PARTIALLY_PAID")) {
        continue;
      }
      const total = parseSafeMoney(row.data.totalAmount);
      const paid = parseSafeMoney(row.data.paidAmount);
      const open = subtractMoney(total, paid);
      if (open > ZERO_CENTAVOS) {
        unpaidByTenant.set(
          tenantId,
          addMoney(unpaidByTenant.get(tenantId) ?? ZERO_CENTAVOS, open),
        );
      }
    } else if (
      row.entityType === "payment" &&
      !isRecordDeletedOrTombstone(row)
    ) {
      const tenantId = asString(row.data.tenantId);
      const status = asString(row.data.status);
      if (!tenantId || status !== "POSTED") continue;
      const credit = parseSafeMoney(row.data.unallocatedAmount);
      if (credit > ZERO_CENTAVOS) {
        creditByTenant.set(
          tenantId,
          addMoney(creditByTenant.get(tenantId) ?? ZERO_CENTAVOS, credit),
        );
      }
    }
  }

  const result = new Map<string, string>();
  for (const [tenantId, unpaid] of unpaidByTenant.entries()) {
    const credit = creditByTenant.get(tenantId) ?? ZERO_CENTAVOS;
    const net = subtractMoney(unpaid, credit);
    result.set(
      tenantId,
      formatMoneyDecimal(net > ZERO_CENTAVOS ? net : ZERO_CENTAVOS),
    );
  }
  return result;
}

function reconstructAssignableBeds(
  projections: DecryptedEntityView[],
): AssignableBedOptionDto[] {
  const roomsById = new Map<
    string,
    {
      id: string;
      number: string;
      floor: string | null;
      baseMonthlyRate: string;
    }
  >();

  for (const row of projections) {
    if (row.entityType !== "room" || isRecordDeletedOrTombstone(row)) continue;
    if (asString(row.data.archivedAt) !== null) continue;
    if (asString(row.data.building) !== "BOARDING") continue;
    const id = asNonEmptyString(row.data.id, row.entityId);
    roomsById.set(id, {
      id,
      number: asNonEmptyString(row.data.number, "—"),
      floor: asString(row.data.floor),
      baseMonthlyRate: formatMoneyDecimal(
        parseSafeMoney(row.data.baseMonthlyRate),
      ),
    });
  }

  const options: AssignableBedOptionDto[] = [];
  for (const row of projections) {
    if (row.entityType !== "bed" || isRecordDeletedOrTombstone(row)) continue;
    if (asString(row.data.archivedAt) !== null) continue;
    const roomId = asString(row.data.roomId);
    if (!roomId) continue;
    const room = roomsById.get(roomId);
    if (!room) continue;
    const rawStatus = asString(row.data.status);
    const status =
      rawStatus === "AVAILABLE" ||
      rawStatus === "OCCUPIED" ||
      rawStatus === "MAINTENANCE" ||
      rawStatus === "ARCHIVED"
        ? rawStatus
        : "AVAILABLE";
    if (status === "ARCHIVED") continue;

    options.push({
      bedId: asNonEmptyString(row.data.id, row.entityId),
      roomId: room.id,
      roomNumber: room.number,
      roomFloor: room.floor,
      bedNumber: asNonEmptyString(row.data.number, "—"),
      bedLabel: asString(row.data.label),
      monthlyRate: row.data.monthlyRate
        ? formatMoneyDecimal(parseSafeMoney(row.data.monthlyRate))
        : room.baseMonthlyRate,
      status,
    });
  }

  return options.sort(
    (a, b) =>
      a.roomNumber.localeCompare(b.roomNumber) ||
      a.bedNumber.localeCompare(b.bedNumber),
  );
}

/**
 * Pure selector rebuilding `TenantsOverviewDto` + per-tenant offline sync badges
 * from decrypted IndexedDB projections and active outbox entries.
 */
export function buildTenantsOverviewFromRecords(input: {
  projections: DecryptedEntityView[];
  outbox: OutboxRecord[];
}): {
  overview: TenantsOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
} {
  const activeAssignmentByTenant = new Map<string, TenantAssignmentDto>();
  const notesByTenant = new Map<string, TenantNoteDto[]>();

  for (const row of input.projections) {
    if (row.entityType === "tenant_assignment") {
      const assignment = toTenantAssignmentDto(row);
      if (assignment && assignment.status === "ACTIVE") {
        activeAssignmentByTenant.set(assignment.tenantId, assignment);
      }
    } else if (row.entityType === "tenant_note") {
      const note = toTenantNoteDto(row);
      if (note) {
        const list = notesByTenant.get(note.tenantId) ?? [];
        list.push(note);
        notesByTenant.set(note.tenantId, list);
      }
    }
  }

  const balances = computeDerivedBalancesByTenant(input.projections);
  const tenants: TenantListItemDto[] = [];

  for (const row of input.projections) {
    if (row.entityType !== "tenant") continue;
    const base = toTenantDtoFromRecord(row);
    if (!base) continue;

    const notes = (notesByTenant.get(base.id) ?? []).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    tenants.push({
      ...base,
      activeAssignment: activeAssignmentByTenant.get(base.id) ?? null,
      tenantNotes: notes,
      derivedBalance: balances.get(base.id) ?? "0.00",
    });
  }

  tenants.sort(
    (a, b) =>
      Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
      a.fullName.localeCompare(b.fullName),
  );

  return {
    overview: {
      tenants,
      assignableBeds: reconstructAssignableBeds(input.projections),
    },
    syncBadges: buildSyncBadgeMap(input.outbox, ["tenant"]),
  };
}

export type VaultPoliciesSnapshot = Extract<
  VaultMetaRecord,
  { key: "policies" }
>;

export function mergeOverlayRecords<
  T extends { id: string; version: number },
>(input: {
  entityType: string;
  serverRows: T[];
  projections: DecryptedEntityView[];
  outbox: OutboxRecord[];
  toDto: (view: DecryptedEntityView) => T | null;
  mergeExisting: (serverRow: T, localDto: T) => T;
}): {
  rows: T[];
  syncBadges: Record<string, OfflineEntitySyncBadge>;
} {
  const syncBadges = buildSyncBadgeMap(input.outbox, [input.entityType]);
  const localViews = new Map<string, DecryptedEntityView>();
  for (const row of input.projections) {
    if (
      row.entityType === input.entityType &&
      (row.isPendingLocal || row.hasConflict)
    ) {
      localViews.set(row.entityId, row);
    }
  }

  if (localViews.size === 0 && Object.keys(syncBadges).length === 0) {
    return { rows: input.serverRows, syncBadges: {} };
  }

  const seenIds = new Set<string>();
  const mergedRows: T[] = input.serverRows.map((serverRow) => {
    seenIds.add(serverRow.id);
    const localView = localViews.get(serverRow.id);
    const badge = syncBadges[serverRow.id];
    if (!localView || !badge || badge.status !== "pending") {
      return serverRow;
    }
    const localDto = input.toDto(localView);
    if (!localDto) return serverRow;
    return input.mergeExisting(serverRow, localDto);
  });

  for (const [entityId, localView] of localViews.entries()) {
    if (seenIds.has(entityId)) continue;
    const badge = syncBadges[entityId];
    if (!badge || badge.status !== "pending") continue;
    const createdDto = input.toDto(localView);
    if (createdDto) {
      mergedRows.unshift(createdDto);
    }
  }

  return { rows: mergedRows, syncBadges };
}

/**
 * Overlays locally queued or Needs-attention tenant edits on top of an online
 * server-fetched `TenantsOverviewDto` so unconfirmed local drafts stay visible.
 */
export function mergeTenantsOverviewWithVaultOverlay(input: {
  baseOverview: TenantsOverviewDto;
  projections: DecryptedEntityView[];
  outbox: OutboxRecord[];
}): {
  overview: TenantsOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
} {
  const merged = mergeOverlayRecords<TenantListItemDto>({
    entityType: "tenant",
    serverRows: input.baseOverview.tenants,
    projections: input.projections,
    outbox: input.outbox,
    toDto: (view) => {
      const base = toTenantDtoFromRecord(view);
      if (!base) return null;
      return {
        ...base,
        activeAssignment: null,
        tenantNotes: [],
        derivedBalance: "0.00",
      };
    },
    mergeExisting: (serverRow, localDto) => ({
      ...serverRow,
      fullName: localDto.fullName,
      phone: localDto.phone,
      email: localDto.email,
      address: localDto.address,
      emergencyContact: localDto.emergencyContact,
      notes: localDto.notes,
      archivedAt: localDto.archivedAt,
      updatedAt: localDto.updatedAt,
      version: serverRow.version,
    }),
  });

  return {
    overview: {
      tenants: merged.rows,
      assignableBeds: input.baseOverview.assignableBeds,
    },
    syncBadges: merged.syncBadges,
  };
}

/**
 * Loads decrypted tenant directory data and active outbox status badges directly
 * from the browser's encrypted IndexedDB vault.
 */
export async function loadTenantsOverviewFromVault(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
): Promise<{
  overview: TenantsOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
  lastSyncedAt: string | null;
}> {
  const [projections, outbox, syncMeta] = await Promise.all([
    listDecryptedProjections(db, key, [
      "tenant",
      "tenant_assignment",
      "tenant_note",
      "invoice",
      "payment",
      "room",
      "bed",
    ]),
    listActiveOutboxRecords(db),
    db.vaultMeta.get("sync"),
  ]);

  const built = buildTenantsOverviewFromRecords({ projections, outbox });
  return {
    ...built,
    lastSyncedAt: syncMeta?.key === "sync" ? syncMeta.lastSyncedAt : null,
  };
}

const VALID_PAYMENT_METHODS = new Set<PaymentMethodValue>([
  "CASH",
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "CHECK",
  "OTHER",
]);
const VALID_PAYMENT_STATUSES = new Set<PaymentStatusValue>([
  "POSTED",
  "REVERSED",
  "REVERSAL",
]);

export function toPaymentDtoFromRecord(
  row: DecryptedEntityView,
): PaymentDto | null {
  if (isRecordDeletedOrTombstone(row)) return null;
  const amount = parseSafeMoney(row.data.amount);
  if (amount === ZERO_CENTAVOS && row.data.amount === undefined) return null;

  const tenantId = asString(row.data.tenantId);
  const transientGuestId = asString(row.data.transientGuestId);
  const payerKind =
    asString(row.data.payerKind) === "TRANSIENT" || Boolean(transientGuestId)
      ? "TRANSIENT"
      : "TENANT";

  const rawMethod = asString(row.data.method) as PaymentMethodValue | null;
  const method: PaymentMethodValue =
    rawMethod && VALID_PAYMENT_METHODS.has(rawMethod) ? rawMethod : "CASH";
  const rawStatus = asString(row.data.status) as PaymentStatusValue | null;
  const status: PaymentStatusValue =
    rawStatus && VALID_PAYMENT_STATUSES.has(rawStatus) ? rawStatus : "POSTED";

  const rawAllocations = Array.isArray(row.data.allocations)
    ? row.data.allocations
    : [];
  const allocations: PaymentAllocationDto[] = rawAllocations
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .map((item, idx) => ({
      id: asNonEmptyString(item.id, `${row.entityId}-alloc-${idx}`),
      invoiceId: asNonEmptyString(item.invoiceId),
      invoiceNumber: asString(item.invoiceNumber),
      billingPeriod: asString(item.billingPeriod),
      amount: formatMoneyDecimal(parseSafeMoney(item.amount)),
    }))
    .filter((a) => Boolean(a.invoiceId));

  const rawProofs = Array.isArray(row.data.proofs) ? row.data.proofs : [];
  const proofs: PaymentProofDto[] = rawProofs
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .map((item, idx) => ({
      id: asNonEmptyString(item.id, `${row.entityId}-proof-${idx}`),
      intentId: asNonEmptyString(item.intentId),
      fileName: asNonEmptyString(item.fileName, "Queued proof"),
      mimeType: asNonEmptyString(item.mimeType, "image/jpeg"),
      byteSize: asNumber(item.byteSize, 0),
      sha256: asNonEmptyString(item.sha256),
      createdAt: asNonEmptyString(item.createdAt, row.updatedAt),
      downloadPath: asNonEmptyString(item.downloadPath),
    }));

  const allocated =
    row.data.allocatedAmount !== undefined
      ? parseSafeMoney(row.data.allocatedAmount)
      : allocations.reduce(
          (sum, item) => addMoney(sum, parseSafeMoney(item.amount)),
          ZERO_CENTAVOS,
        );
  const unallocated =
    row.data.unallocatedAmount !== undefined
      ? parseSafeMoney(row.data.unallocatedAmount)
      : subtractMoney(amount, allocated) > ZERO_CENTAVOS
        ? subtractMoney(amount, allocated)
        : ZERO_CENTAVOS;

  return {
    id: asNonEmptyString(row.data.id, row.entityId),
    payerKind,
    tenantId,
    transientGuestId,
    tenantName: asNonEmptyString(row.data.tenantName, "Boarder"),
    version: Math.max(
      row.isPendingLocal ? 0 : 1,
      asNumber(row.data._version ?? row.data.version, 1),
    ),
    receiptNumber: asString(row.data.receiptNumber),
    status,
    method,
    amount: formatMoneyDecimal(amount),
    allocatedAmount: formatMoneyDecimal(allocated),
    unallocatedAmount: formatMoneyDecimal(unallocated),
    paidAt: asNonEmptyString(row.data.paidAt, row.updatedAt),
    paidDateManila: asNonEmptyString(
      row.data.paidDateManila,
      toManilaDate(new Date(row.updatedAt)),
    ),
    referenceNo: asString(row.data.referenceNo),
    notes: asString(row.data.notes),
    reversalReason: asString(row.data.reversalReason),
    reversedPaymentId: asString(row.data.reversedPaymentId),
    reversalEntryId: asString(row.data.reversalEntryId),
    reversedAt: asString(row.data.reversedAt),
    createdByActorType: asNonEmptyString(row.data.createdByActorType, "owner"),
    createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
    updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
    allocations,
    proofs,
  };
}

/**
 * Pure selector rebuilding `PaymentsOverviewDto` + per-payment offline badges
 * from decrypted IndexedDB snapshots, projections, and outbox rows.
 */
export function buildPaymentsOverviewFromRecords(input: {
  projections: DecryptedEntityView[];
  outbox: OutboxRecord[];
  policiesMeta?: VaultPoliciesSnapshot | null;
  todayManila?: string;
}): {
  overview: PaymentsOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
} {
  const todayManila = input.todayManila ?? toManilaDate(new Date());
  const currentMonthKey = todayManila.slice(0, 7);

  const tenantNames = new Map<string, string>();
  const transientNames = new Map<string, string>();
  const tenantRows: Array<{
    id: string;
    fullName: string;
    archivedAt: string | null;
  }> = [];
  const transientRows: Array<{
    id: string;
    fullName: string;
    archivedAt: string | null;
  }> = [];

  for (const row of input.projections) {
    if (isRecordDeletedOrTombstone(row)) continue;
    const id = asNonEmptyString(row.data.id, row.entityId);
    const fullName = asString(row.data.fullName)?.trim();
    if (!fullName) continue;
    const archivedAt = asString(row.data.archivedAt);
    if (row.entityType === "tenant") {
      tenantNames.set(id, fullName);
      tenantRows.push({ id, fullName, archivedAt });
    } else if (row.entityType === "transient_guest") {
      transientNames.set(id, fullName);
      transientRows.push({ id, fullName, archivedAt });
    }
  }

  const openInvoices: PaymentOpenInvoiceOptionDto[] = [];
  const openBalanceByPayer = new Map<string, bigint>();
  const openCountByPayer = new Map<string, number>();

  for (const row of input.projections) {
    if (row.entityType !== "invoice" || isRecordDeletedOrTombstone(row)) {
      continue;
    }
    const status = asString(row.data.status);
    if (status !== "ISSUED" && status !== "PARTIALLY_PAID") continue;

    const total = parseSafeMoney(row.data.totalAmount);
    const paid = parseSafeMoney(row.data.paidAmount);
    const balance = subtractMoney(total, paid);
    if (balance <= ZERO_CENTAVOS) continue;

    const tenantId = asString(row.data.tenantId);
    const transientGuestId = asString(row.data.transientGuestId);
    const payerKind = transientGuestId ? "TRANSIENT" : "TENANT";
    const payerKey = transientGuestId
      ? `transient:${transientGuestId}`
      : tenantId
        ? `tenant:${tenantId}`
        : null;
    if (payerKey) {
      openBalanceByPayer.set(
        payerKey,
        addMoney(openBalanceByPayer.get(payerKey) ?? ZERO_CENTAVOS, balance),
      );
      openCountByPayer.set(payerKey, (openCountByPayer.get(payerKey) ?? 0) + 1);
    }

    const dueDateManila = asNonEmptyString(row.data.dueDateManila, todayManila);
    const fallbackName = transientGuestId
      ? (transientNames.get(transientGuestId) ?? "Transient guest")
      : tenantId
        ? (tenantNames.get(tenantId) ?? "Boarder")
        : "Payer";

    const rawItems = Array.isArray(row.data.items) ? row.data.items : [];
    const items = rawItems
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        const description = asString(record.description);
        if (!description) return null;
        return {
          description,
          lineTotal: formatMoneyDecimal(parseSafeMoney(record.lineTotal)),
        };
      })
      .filter(
        (item): item is { description: string; lineTotal: string } =>
          item !== null,
      );

    openInvoices.push({
      id: asNonEmptyString(row.data.id, row.entityId),
      payerKind,
      tenantId,
      transientGuestId,
      transientReservationId: asString(row.data.transientReservationId),
      tenantName: asString(row.data.snapshotTenantName) ?? fallbackName,
      invoiceNumber: asString(row.data.invoiceNumber),
      billingPeriod: asString(row.data.billingPeriod),
      dueDateManila,
      status,
      totalAmount: formatMoneyDecimal(total),
      paidAmount: formatMoneyDecimal(paid),
      balanceAmount: formatMoneyDecimal(balance),
      isOverdue: dueDateManila < todayManila,
      items,
    });
  }

  openInvoices.sort((a, b) => a.dueDateManila.localeCompare(b.dueDateManila));

  const payments: PaymentDto[] = [];
  const creditByPayer = new Map<string, bigint>();
  let collectedMonthCount = 0;
  let collectedMonthCentavos = ZERO_CENTAVOS;
  let unallocatedCreditCentavos = ZERO_CENTAVOS;
  let reversedCount = 0;
  let proofCount = 0;

  for (const row of input.projections) {
    if (row.entityType !== "payment") continue;
    const dto = toPaymentDtoFromRecord(row);
    if (!dto) continue;
    payments.push(dto);

    proofCount += dto.proofs.length;
    if (dto.status === "REVERSED") {
      reversedCount += 1;
    } else if (dto.status === "POSTED") {
      const credit = parseSafeMoney(dto.unallocatedAmount);
      unallocatedCreditCentavos = addMoney(unallocatedCreditCentavos, credit);
      const payerKey = dto.transientGuestId
        ? `transient:${dto.transientGuestId}`
        : dto.tenantId
          ? `tenant:${dto.tenantId}`
          : null;
      if (payerKey && credit > ZERO_CENTAVOS) {
        creditByPayer.set(
          payerKey,
          addMoney(creditByPayer.get(payerKey) ?? ZERO_CENTAVOS, credit),
        );
      }
      if (dto.paidDateManila.startsWith(currentMonthKey)) {
        collectedMonthCount += 1;
        collectedMonthCentavos = addMoney(
          collectedMonthCentavos,
          parseSafeMoney(dto.amount),
        );
      }
    }
  }

  payments.sort(
    (a, b) =>
      b.paidDateManila.localeCompare(a.paidDateManila) ||
      b.createdAt.localeCompare(a.createdAt),
  );

  const tenants: PaymentTenantOptionDto[] = tenantRows
    .filter(
      (t) =>
        t.archivedAt === null ||
        (openCountByPayer.get(`tenant:${t.id}`) ?? 0) > 0,
    )
    .map((t) => ({
      id: t.id,
      fullName: t.fullName,
      archivedAt: t.archivedAt,
      unallocatedCredit: formatMoneyDecimal(
        creditByPayer.get(`tenant:${t.id}`) ?? ZERO_CENTAVOS,
      ),
      openBalance: formatMoneyDecimal(
        openBalanceByPayer.get(`tenant:${t.id}`) ?? ZERO_CENTAVOS,
      ),
      openInvoiceCount: openCountByPayer.get(`tenant:${t.id}`) ?? 0,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const transientGuests: PaymentTransientOptionDto[] = transientRows
    .filter(
      (g) =>
        g.archivedAt === null ||
        (openCountByPayer.get(`transient:${g.id}`) ?? 0) > 0,
    )
    .map((g) => ({
      id: g.id,
      fullName: g.fullName,
      archivedAt: g.archivedAt,
      unallocatedCredit: formatMoneyDecimal(
        creditByPayer.get(`transient:${g.id}`) ?? ZERO_CENTAVOS,
      ),
      openBalance: formatMoneyDecimal(
        openBalanceByPayer.get(`transient:${g.id}`) ?? ZERO_CENTAVOS,
      ),
      openInvoiceCount: openCountByPayer.get(`transient:${g.id}`) ?? 0,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const pol = input.policiesMeta;
  return {
    overview: {
      policiesComplete: pol ? pol.policiesComplete : true,
      receiptPrefix: pol?.receiptPrefix ?? null,
      overpaymentPolicy: pol?.overpaymentPolicy ?? null,
      proofMaxBytes: pol?.proofMaxBytes ?? 5 * 1024 * 1024,
      proofMaxFilesPerRecord: pol?.proofMaxFilesPerRecord ?? 5,
      missingPolicyLabels: pol?.missingPolicyLabels ?? [],
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
    },
    syncBadges: buildSyncBadgeMap(input.outbox, ["payment"]),
  };
}

/**
 * Overlays locally queued/conflicted payments onto an online server overview.
 */
export function mergePaymentsOverviewWithVaultOverlay(input: {
  baseOverview: PaymentsOverviewDto;
  projections: DecryptedEntityView[];
  outbox: OutboxRecord[];
}): {
  overview: PaymentsOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
} {
  const merged = mergeOverlayRecords<PaymentDto>({
    entityType: "payment",
    serverRows: input.baseOverview.payments,
    projections: input.projections,
    outbox: input.outbox,
    toDto: toPaymentDtoFromRecord,
    mergeExisting: (serverRow, localDto) => ({
      ...serverRow,
      ...localDto,
      version: serverRow.version,
    }),
  });
  return {
    overview: {
      ...input.baseOverview,
      payments: merged.rows,
    },
    syncBadges: merged.syncBadges,
  };
}

export async function loadPaymentsOverviewFromVault(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
): Promise<{
  overview: PaymentsOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
  lastSyncedAt: string | null;
}> {
  const [projections, outbox, syncMeta, policiesMeta] = await Promise.all([
    listDecryptedProjections(db, key, [
      "payment",
      "invoice",
      "tenant",
      "transient_guest",
    ]),
    listActiveOutboxRecords(db),
    db.vaultMeta.get("sync"),
    db.vaultMeta.get("policies"),
  ]);

  const built = buildPaymentsOverviewFromRecords({
    projections,
    outbox,
    policiesMeta: policiesMeta?.key === "policies" ? policiesMeta : null,
  });
  return {
    ...built,
    lastSyncedAt: syncMeta?.key === "sync" ? syncMeta.lastSyncedAt : null,
  };
}

const VALID_MAINT_CATEGORIES = new Set<MaintenanceCategoryValue>([
  "PLUMBING",
  "ELECTRICAL",
  "APPLIANCE",
  "STRUCTURAL",
  "PEST_CONTROL",
  "CLEANING",
  "SECURITY",
  "OTHER",
]);
const VALID_MAINT_PRIORITIES = new Set<MaintenancePriorityValue>([
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);
const VALID_MAINT_STATUSES = new Set<MaintenanceStatusValue>([
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
]);

function toMaintenanceDtoFromRecord(
  row: DecryptedEntityView,
  roomNumbersById?: Map<string, string>,
): MaintenanceRequestDto | null {
  if (row.data._tombstone === true) return null;
  const title = asString(row.data.title)?.trim();
  const roomId = asString(row.data.roomId);
  if (!title || !roomId) return null;

  const rawCategory = asString(
    row.data.category,
  ) as MaintenanceCategoryValue | null;
  const category =
    rawCategory && VALID_MAINT_CATEGORIES.has(rawCategory)
      ? rawCategory
      : "OTHER";
  const rawPriority = asString(
    row.data.priority,
  ) as MaintenancePriorityValue | null;
  const priority =
    rawPriority && VALID_MAINT_PRIORITIES.has(rawPriority)
      ? rawPriority
      : "MEDIUM";
  const rawStatus = asString(row.data.status) as MaintenanceStatusValue | null;
  const status =
    rawStatus && VALID_MAINT_STATUSES.has(rawStatus) ? rawStatus : "OPEN";

  const updatesRaw = Array.isArray(row.data.updates) ? row.data.updates : [];
  const updates: MaintenanceUpdateDto[] = updatesRaw
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .map((item, idx) => ({
      id: asNonEmptyString(item.id, `${row.entityId}-upd-${idx}`),
      statusFrom:
        (asString(item.statusFrom) as MaintenanceStatusValue | null) ?? null,
      statusTo:
        (asString(item.statusTo) as MaintenanceStatusValue | null) ?? null,
      note: asNonEmptyString(item.note),
      createdByActorType: asNonEmptyString(item.createdByActorType, "owner"),
      createdAt: asNonEmptyString(item.createdAt, row.updatedAt),
    }));

  const attachmentsRaw = Array.isArray(row.data.attachments)
    ? row.data.attachments
    : [];
  const attachments: MaintenanceAttachmentDto[] = attachmentsRaw
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .map((item, idx) => ({
      id: asNonEmptyString(item.id, `${row.entityId}-att-${idx}`),
      maintenanceUpdateId: asString(item.maintenanceUpdateId),
      fileName: asNonEmptyString(item.fileName, "Queued attachment"),
      mimeType: asNonEmptyString(item.mimeType, "image/jpeg"),
      byteSize: asNumber(item.byteSize, 0),
      sha256: asNonEmptyString(item.sha256),
      downloadPath: asNonEmptyString(item.downloadPath),
      createdAt: asNonEmptyString(item.createdAt, row.updatedAt),
    }));

  const activeHoldsRaw = Array.isArray(row.data.activeHolds)
    ? row.data.activeHolds
    : [];
  const activeHolds: MaintenanceHoldDto[] = activeHoldsRaw
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .map((item, idx) => ({
      id: asNonEmptyString(item.id, `${row.entityId}-hold-${idx}`),
      roomId: asNonEmptyString(item.roomId, roomId),
      roomNumber: asNonEmptyString(item.roomNumber, "—"),
      bedId: asNonEmptyString(item.bedId),
      bedNumber: asNonEmptyString(item.bedNumber),
      allocationGroupId: asString(item.allocationGroupId),
      scope: asString(item.scope) === "BED" ? "BED" : "WHOLE_ROOM",
      status:
        asString(item.status) === "COMPLETED"
          ? "COMPLETED"
          : asString(item.status) === "CANCELLED"
            ? "CANCELLED"
            : "ACTIVE",
      startDateManila: asNonEmptyString(item.startDateManila),
      endDateManila: asNonEmptyString(item.endDateManila),
      startDate: asNonEmptyString(item.startDate, row.updatedAt),
      endDate: asNonEmptyString(item.endDate, row.updatedAt),
      notes: asString(item.notes),
    }));

  return {
    id: asNonEmptyString(row.data.id, row.entityId),
    version: Math.max(
      row.isPendingLocal ? 0 : 1,
      asNumber(row.data._version ?? row.data.version, 1),
    ),
    roomId,
    roomNumber:
      asString(row.data.roomNumber) ?? roomNumbersById?.get(roomId) ?? "—",
    bedId: asString(row.data.bedId),
    bedNumber: asString(row.data.bedNumber),
    title,
    description: asNonEmptyString(row.data.description),
    category,
    priority,
    status,
    resolvedAt: asString(row.data.resolvedAt),
    archivedAt: asString(row.data.archivedAt),
    createdByActorType: asNonEmptyString(row.data.createdByActorType, "owner"),
    createdAt: asNonEmptyString(row.data.createdAt, row.updatedAt),
    updatedAt: asNonEmptyString(row.data.updatedAt, row.updatedAt),
    updates,
    attachments,
    activeHolds,
  };
}

/**
 * Pure selector rebuilding `MaintenanceOverviewDto` + per-ticket offline badges.
 */
export function buildMaintenanceOverviewFromRecords(input: {
  projections: DecryptedEntityView[];
  outbox: OutboxRecord[];
  policiesMeta?: VaultPoliciesSnapshot | null;
}): {
  overview: MaintenanceOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
} {
  const bedsByRoomId = new Map<
    string,
    Array<{ id: string; number: string; status: string }>
  >();
  for (const row of input.projections) {
    if (row.entityType !== "bed" || isRecordDeletedOrTombstone(row)) continue;
    if (asString(row.data.archivedAt) !== null) continue;
    const roomId = asString(row.data.roomId);
    if (!roomId) continue;
    const list = bedsByRoomId.get(roomId) ?? [];
    list.push({
      id: asNonEmptyString(row.data.id, row.entityId),
      number: asNonEmptyString(row.data.number, "—"),
      status: asNonEmptyString(row.data.status, "AVAILABLE"),
    });
    bedsByRoomId.set(roomId, list);
  }

  const rooms: MaintenanceRoomOptionDto[] = [];
  const roomNumbersById = new Map<string, string>();
  for (const row of input.projections) {
    if (row.entityType !== "room" || isRecordDeletedOrTombstone(row)) continue;
    if (asString(row.data.archivedAt) !== null) continue;
    const id = asNonEmptyString(row.data.id, row.entityId);
    const number = asNonEmptyString(row.data.number, "—");
    roomNumbersById.set(id, number);
    const building: RoomBuildingValue =
      asString(row.data.building) === "TRANSIENT" ? "TRANSIENT" : "BOARDING";
    rooms.push({
      id,
      building,
      number,
      floor: asString(row.data.floor),
      beds: (bedsByRoomId.get(id) ?? []).sort((a, b) =>
        a.number.localeCompare(b.number),
      ),
    });
  }
  rooms.sort(
    (a, b) =>
      a.building.localeCompare(b.building) || a.number.localeCompare(b.number),
  );

  const requests: MaintenanceRequestDto[] = [];
  let openCount = 0;
  let inProgressCount = 0;
  let urgentOpenCount = 0;
  let activeHoldsCount = 0;

  for (const row of input.projections) {
    if (row.entityType !== "maintenance_request") continue;
    const dto = toMaintenanceDtoFromRecord(row, roomNumbersById);
    if (!dto) continue;
    requests.push(dto);

    if (dto.archivedAt === null) {
      if (dto.status === "OPEN") openCount += 1;
      if (dto.status === "IN_PROGRESS") inProgressCount += 1;
      if (dto.priority === "URGENT" && dto.status !== "RESOLVED") {
        urgentOpenCount += 1;
      }
      activeHoldsCount += dto.activeHolds.length;
    }
  }

  requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    overview: {
      proofMaxMb: input.policiesMeta?.proofMaxMb ?? 5,
      proofMaxFilesPerRecord: input.policiesMeta?.proofMaxFilesPerRecord ?? 5,
      totals: {
        openCount,
        inProgressCount,
        urgentOpenCount,
        activeHoldsCount,
      },
      requests,
      rooms,
    },
    syncBadges: buildSyncBadgeMap(input.outbox, ["maintenance_request"]),
  };
}

export function mergeMaintenanceOverviewWithVaultOverlay(input: {
  baseOverview: MaintenanceOverviewDto;
  projections: DecryptedEntityView[];
  outbox: OutboxRecord[];
}): {
  overview: MaintenanceOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
} {
  const merged = mergeOverlayRecords<MaintenanceRequestDto>({
    entityType: "maintenance_request",
    serverRows: input.baseOverview.requests,
    projections: input.projections,
    outbox: input.outbox,
    toDto: (view) => toMaintenanceDtoFromRecord(view),
    mergeExisting: (serverRow, localDto) => ({
      ...serverRow,
      status: localDto.status,
      archivedAt: localDto.archivedAt,
      updatedAt: localDto.updatedAt,
      version: serverRow.version,
    }),
  });
  return {
    overview: {
      ...input.baseOverview,
      requests: merged.rows,
    },
    syncBadges: merged.syncBadges,
  };
}

export async function loadMaintenanceOverviewFromVault(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
): Promise<{
  overview: MaintenanceOverviewDto;
  syncBadges: Record<string, OfflineEntitySyncBadge>;
  lastSyncedAt: string | null;
}> {
  const [projections, outbox, syncMeta, policiesMeta] = await Promise.all([
    listDecryptedProjections(db, key, ["maintenance_request", "room", "bed"]),
    listActiveOutboxRecords(db),
    db.vaultMeta.get("sync"),
    db.vaultMeta.get("policies"),
  ]);

  const built = buildMaintenanceOverviewFromRecords({
    projections,
    outbox,
    policiesMeta: policiesMeta?.key === "policies" ? policiesMeta : null,
  });
  return {
    ...built,
    lastSyncedAt: syncMeta?.key === "sync" ? syncMeta.lastSyncedAt : null,
  };
}

export async function loadMaintenanceDetailFromVault(
  db: DaisyOfflineDatabase,
  key: CryptoKey,
  requestId: string,
): Promise<{
  detail: MaintenanceDetailDto | null;
  syncBadge: OfflineEntitySyncBadge | undefined;
  lastSyncedAt: string | null;
}> {
  const loaded = await loadMaintenanceOverviewFromVault(db, key);
  const request =
    loaded.overview.requests.find((r) => r.id === requestId) ?? null;
  return {
    detail: request
      ? {
          proofMaxMb: loaded.overview.proofMaxMb,
          proofMaxFilesPerRecord: loaded.overview.proofMaxFilesPerRecord,
          request,
        }
      : null,
    syncBadge: loaded.syncBadges[requestId],
    lastSyncedAt: loaded.lastSyncedAt,
  };
}
