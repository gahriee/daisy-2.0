import "server-only";
import { randomUUID } from "node:crypto";
import { manilaDateTimeToUtc, toManilaDate } from "@/lib/dates";
import {
  ConflictError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/lib/errors";
import { formatMoneyDecimal, parseMoneyDecimal } from "@/lib/money";
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
import {
  cancelAllocationInTx,
  completeAllocationInTx,
  createAllocationInTx,
  lockAllocationResources,
} from "@/features/allocations/service";
import {
  getTenantDerivedBalancesMap,
  listTenantInvoices,
} from "@/features/billing/service";
import { listTenantPayments } from "@/features/payments/service";
import { syncRoomUnitBed } from "@/features/rooms/service";
import { listTenantContractsForTenant } from "./contracts";
import {
  ArchiveRestoreTenantSchema,
  CreateTenantAssignmentSchema,
  CreateTenantNoteSchema,
  CreateTenantSchema,
  DeleteTenantNoteSchema,
  MoveOutTenantAssignmentSchema,
  UpdateTenantSchema,
  type AssignableBedOptionDto,
  type CreateTenantAssignmentInput,
  type CreateTenantInput,
  type CreateTenantNoteInput,
  type DeleteTenantNoteInput,
  type MoveOutTenantAssignmentInput,
  type TenantAssignmentDto,
  type TenantAssignmentStatusValue,
  type TenantDetailDto,
  type TenantDto,
  type TenantListItemDto,
  type TenantNoteDto,
  type TenantsOverviewDto,
  type UpdateTenantInput,
} from "./schemas";

function decimalToString(value: { toString(): string }): string {
  return formatMoneyDecimal(parseMoneyDecimal(value.toString()));
}

function toTenantDto(row: {
  id: string;
  version: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyContact: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TenantDto {
  return {
    id: row.id,
    version: row.version,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    emergencyContact: row.emergencyContact,
    notes: row.notes,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAssignmentDto(row: {
  id: string;
  tenantId: string;
  roomId: string;
  bedId: string;
  allocationId: string;
  startDate: Date;
  endDate: Date;
  actualMoveOutDate: Date | null;
  monthlyRate: { toString(): string };
  securityDeposit: { toString(): string };
  status: TenantAssignmentStatusValue;
  version: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  room: { title: string };
  bed: { number: string; label: string | null };
}): TenantAssignmentDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    roomId: row.roomId,
    roomNumber: row.room.title,
    bedId: row.bedId,
    bedNumber: row.bed.number,
    bedLabel: row.bed.label,
    allocationId: row.allocationId,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    startDateManila: toManilaDate(row.startDate),
    endDateManila: toManilaDate(row.endDate),
    actualMoveOutDate: row.actualMoveOutDate
      ? row.actualMoveOutDate.toISOString()
      : null,
    actualMoveOutDateManila: row.actualMoveOutDate
      ? toManilaDate(row.actualMoveOutDate)
      : null,
    monthlyRate: decimalToString(row.monthlyRate),
    securityDeposit: decimalToString(row.securityDeposit),
    status: row.status,
    version: row.version,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTenantNoteDto(row: {
  id: string;
  tenantId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}): TenantNoteDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const tenantNoteSelect = {
  id: true,
  tenantId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} as const;

const tenantSelect = {
  id: true,
  version: true,
  fullName: true,
  phone: true,
  email: true,
  address: true,
  emergencyContact: true,
  notes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const assignmentSelect = {
  id: true,
  tenantId: true,
  roomId: true,
  bedId: true,
  allocationId: true,
  startDate: true,
  endDate: true,
  actualMoveOutDate: true,
  monthlyRate: true,
  securityDeposit: true,
  status: true,
  version: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  room: { select: { title: true } },
  bed: { select: { number: true, label: true } },
} as const;

async function lockTenantRow(
  tx: DatabaseExecutor,
  ownerUserId: string,
  tenantId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Tenant"
    WHERE "ownerUserId" = ${ownerUserId} AND "id" = ${tenantId}::uuid
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new NotFoundError("The requested tenant was not found.");
  }
}

async function listAssignableBeds(
  ownerUserId: string,
): Promise<AssignableBedOptionDto[]> {
  const db = getDatabase();
  const activeRoomsWithoutBeds = await db.room.findMany({
    where: {
      ownerUserId,
      building: "BOARDING",
      archivedAt: null,
      beds: { none: { archivedAt: null } },
    },
    select: { id: true },
  });
  for (const room of activeRoomsWithoutBeds) {
    await syncRoomUnitBed(ownerUserId, room.id);
  }

  const beds = await db.bed.findMany({
    where: {
      ownerUserId,
      archivedAt: null,
      room: { building: "BOARDING", archivedAt: null },
      status: { in: ["AVAILABLE", "OCCUPIED"] },
    },
    orderBy: [{ room: { title: "asc" } }, { number: "asc" }],
    select: {
      id: true,
      roomId: true,
      number: true,
      label: true,
      monthlyRate: true,
      status: true,
      room: {
        select: { title: true, floor: true, baseMonthlyRate: true },
      },
    },
  });

  return beds.map((bed) => ({
    bedId: bed.id,
    roomId: bed.roomId,
    roomNumber: bed.room.title,
    roomFloor: bed.room.floor,
    bedNumber: bed.number,
    bedLabel: bed.label,
    monthlyRate: bed.room.baseMonthlyRate
      ? decimalToString(bed.room.baseMonthlyRate)
      : decimalToString(bed.monthlyRate ?? "0.00"),
    status: bed.status,
  }));
}

export async function listTenantsOverview(
  ownerUserId: string,
): Promise<TenantsOverviewDto> {
  const db = getDatabase();
  const [tenants, assignableBeds, balancesMap] = await Promise.all([
    db.tenant.findMany({
      where: { ownerUserId },
      orderBy: [{ archivedAt: "asc" }, { fullName: "asc" }],
      select: {
        ...tenantSelect,
        assignments: {
          where: { status: "ACTIVE" },
          take: 1,
          select: assignmentSelect,
        },
        tenantNotes: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: tenantNoteSelect,
        },
      },
    }),
    listAssignableBeds(ownerUserId),
    getTenantDerivedBalancesMap(db, ownerUserId),
  ]);

  const items: TenantListItemDto[] = tenants.map((row) => ({
    ...toTenantDto(row),
    activeAssignment: row.assignments[0]
      ? toAssignmentDto(row.assignments[0])
      : null,
    tenantNotes: row.tenantNotes.map(toTenantNoteDto),
    derivedBalance: balancesMap.get(row.id) ?? "0.00",
  }));

  return {
    tenants: items,
    assignableBeds,
  };
}

export async function getTenantDetail(
  ownerUserId: string,
  tenantId: string,
): Promise<TenantDetailDto | null> {
  const db = getDatabase();
  const [
    tenant,
    assignableBeds,
    balancesMap,
    invoices,
    paymentHistory,
    contracts,
  ] = await Promise.all([
    db.tenant.findFirst({
      where: { id: tenantId, ownerUserId },
      select: {
        ...tenantSelect,
        assignments: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: assignmentSelect,
        },
        tenantNotes: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: tenantNoteSelect,
        },
      },
    }),
    listAssignableBeds(ownerUserId),
    getTenantDerivedBalancesMap(db, ownerUserId, [tenantId]),
    listTenantInvoices(ownerUserId, tenantId),
    listTenantPayments(ownerUserId, tenantId),
    listTenantContractsForTenant(db, ownerUserId, tenantId),
  ]);

  if (!tenant) return null;

  const assignments = tenant.assignments.map(toAssignmentDto);
  const activeAssignment =
    assignments.find((assignment) => assignment.status === "ACTIVE") ?? null;

  return {
    tenant: toTenantDto(tenant),
    activeAssignment,
    assignments,
    tenantNotes: tenant.tenantNotes.map(toTenantNoteDto),
    contracts,
    derivedBalance: balancesMap.get(tenant.id) ?? "0.00",
    unallocatedCredit: paymentHistory.unallocatedCredit,
    assignableBeds,
    invoices,
    payments: paymentHistory.payments,
  };
}

export async function createTenantInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: CreateTenantInput,
  options?: {
    actorType?: AuditActorType;
    actorId?: string;
    operationId?: string;
  },
): Promise<TenantDto> {
  const parsed = CreateTenantSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check tenant details and try again.",
    );
  }
  const input = parsed.data;
  await ensureOwnerRecord(tx, ownerUserId);

  const id = input.id ?? randomUUID();
  let created;
  try {
    created = await tx.tenant.create({
      data: {
        id,
        ownerUserId,
        version: 1,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        address: input.address,
        emergencyContact: input.emergencyContact,
        notes: input.notes,
      },
      select: tenantSelect,
    });
  } catch (error) {
    if (isPgConstraintError(error, "23505")) {
      throw new ConflictError("A tenant with this identifier already exists.");
    }
    throw error;
  }

  const dto = toTenantDto(created);
  const sequence = await allocateSyncSequence(tx, ownerUserId);

  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "tenants",
    action: "tenant.created",
    actorType: options?.actorType ?? "owner",
    actorId: options?.actorId ?? ownerUserId,
    entityType: "tenant",
    entityId: dto.id,
    operationId: options?.operationId,
    metadata: { version: dto.version },
  });

  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "tenant",
    entityId: dto.id,
    version: dto.version,
    operation: "upsert",
    payload: dto,
  });

  return dto;
}

export async function createTenant(
  ownerUserId: string,
  rawInput: CreateTenantInput,
): Promise<TenantDto> {
  const db = getDatabase();
  return db.$transaction((tx) => createTenantInTx(tx, ownerUserId, rawInput));
}

export async function updateTenantInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: UpdateTenantInput,
  options?: {
    actorType?: AuditActorType;
    actorId?: string;
    operationId?: string;
  },
): Promise<TenantDto> {
  const parsed = UpdateTenantSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check tenant details and try again.",
    );
  }
  const input = parsed.data;
  await lockTenantRow(tx, ownerUserId, input.tenantId);

  const existing = await tx.tenant.findFirst({
    where: { id: input.tenantId, ownerUserId },
    select: { id: true, version: true, archivedAt: true },
  });
  if (!existing) {
    throw new NotFoundError("The requested tenant was not found.");
  }
  if (existing.archivedAt !== null) {
    throw new ConflictError("Restore the archived tenant before editing.");
  }
  if (existing.version !== input.expectedVersion) {
    throw new ConflictError(
      "This tenant changed elsewhere. Reload and review before saving.",
    );
  }

  const updated = await tx.tenant.updateMany({
    where: {
      id: existing.id,
      ownerUserId,
      version: input.expectedVersion,
      archivedAt: null,
    },
    data: {
      version: { increment: 1 },
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      address: input.address,
      emergencyContact: input.emergencyContact,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
  if (updated.count === 0) {
    throw new ConflictError(
      "This tenant changed elsewhere. Reload and review before saving.",
    );
  }

  const saved = await tx.tenant.findUniqueOrThrow({
    where: { id: existing.id },
    select: tenantSelect,
  });

  const dto = toTenantDto(saved);
  const sequence = await allocateSyncSequence(tx, ownerUserId);

  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "tenants",
    action: "tenant.updated",
    actorType: options?.actorType ?? "owner",
    actorId: options?.actorId ?? ownerUserId,
    entityType: "tenant",
    entityId: dto.id,
    operationId: options?.operationId,
    metadata: { version: dto.version },
  });

  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "tenant",
    entityId: dto.id,
    version: dto.version,
    operation: "upsert",
    payload: dto,
  });

  return dto;
}

export async function updateTenant(
  ownerUserId: string,
  rawInput: UpdateTenantInput,
): Promise<TenantDto> {
  const db = getDatabase();
  return db.$transaction((tx) => updateTenantInTx(tx, ownerUserId, rawInput));
}

export async function archiveTenantInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: { tenantId: string; expectedVersion: number },
  options?: {
    actorType?: AuditActorType;
    actorId?: string;
    operationId?: string;
    asOfUtc?: Date;
  },
): Promise<TenantDto> {
  const parsed = ArchiveRestoreTenantSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid tenant archive request.",
    );
  }
  const input = parsed.data;
  await lockTenantRow(tx, ownerUserId, input.tenantId);

  const existing = await tx.tenant.findFirst({
    where: { id: input.tenantId, ownerUserId },
    select: { id: true, version: true, archivedAt: true },
  });
  if (!existing) {
    throw new NotFoundError("The requested tenant was not found.");
  }
  if (existing.archivedAt !== null) {
    throw new ConflictError("This tenant is already archived.");
  }
  if (existing.version !== input.expectedVersion) {
    throw new ConflictError(
      "This tenant changed elsewhere. Reload and try again.",
    );
  }

  const activeAssignments = await tx.tenantAssignment.count({
    where: { ownerUserId, tenantId: existing.id, status: "ACTIVE" },
  });
  if (activeAssignments > 0) {
    throw new ConflictError(
      "Complete or cancel this tenant's active bed assignment before archiving.",
    );
  }

  const now = options?.asOfUtc ?? new Date();
  const updated = await tx.tenant.updateMany({
    where: {
      id: existing.id,
      ownerUserId,
      version: input.expectedVersion,
      archivedAt: null,
    },
    data: {
      archivedAt: now,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new ConflictError(
      "This tenant changed elsewhere. Reload and try again.",
    );
  }

  const saved = await tx.tenant.findUniqueOrThrow({
    where: { id: existing.id },
    select: tenantSelect,
  });

  const dto = toTenantDto(saved);
  const sequence = await allocateSyncSequence(tx, ownerUserId);

  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "tenants",
    action: "tenant.archived",
    actorType: options?.actorType ?? "owner",
    actorId: options?.actorId ?? ownerUserId,
    entityType: "tenant",
    entityId: dto.id,
    operationId: options?.operationId,
    metadata: { version: dto.version },
  });

  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "tenant",
    entityId: dto.id,
    version: dto.version,
    operation: "tombstone",
    payload: dto,
  });

  return dto;
}

export async function archiveTenant(
  ownerUserId: string,
  rawInput: { tenantId: string; expectedVersion: number },
): Promise<TenantDto> {
  const db = getDatabase();
  return db.$transaction((tx) => archiveTenantInTx(tx, ownerUserId, rawInput));
}

export async function restoreTenantInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: { tenantId: string; expectedVersion: number },
  options?: {
    actorType?: AuditActorType;
    actorId?: string;
    operationId?: string;
  },
): Promise<TenantDto> {
  const parsed = ArchiveRestoreTenantSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid tenant restore request.",
    );
  }
  const input = parsed.data;
  await lockTenantRow(tx, ownerUserId, input.tenantId);

  const existing = await tx.tenant.findFirst({
    where: { id: input.tenantId, ownerUserId },
    select: { id: true, version: true, archivedAt: true },
  });
  if (!existing) {
    throw new NotFoundError("The requested tenant was not found.");
  }
  if (existing.archivedAt === null) {
    throw new ConflictError("This tenant is already active.");
  }
  if (existing.version !== input.expectedVersion) {
    throw new ConflictError(
      "This tenant changed elsewhere. Reload and try again.",
    );
  }

  const updated = await tx.tenant.updateMany({
    where: {
      id: existing.id,
      ownerUserId,
      version: input.expectedVersion,
    },
    data: {
      archivedAt: null,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new ConflictError(
      "This tenant changed elsewhere. Reload and try again.",
    );
  }

  const saved = await tx.tenant.findUniqueOrThrow({
    where: { id: existing.id },
    select: tenantSelect,
  });

  const dto = toTenantDto(saved);
  const sequence = await allocateSyncSequence(tx, ownerUserId);

  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "tenants",
    action: "tenant.restored",
    actorType: options?.actorType ?? "owner",
    actorId: options?.actorId ?? ownerUserId,
    entityType: "tenant",
    entityId: dto.id,
    operationId: options?.operationId,
    metadata: { version: dto.version },
  });

  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "tenant",
    entityId: dto.id,
    version: dto.version,
    operation: "upsert",
    payload: dto,
  });

  return dto;
}

export async function restoreTenant(
  ownerUserId: string,
  rawInput: { tenantId: string; expectedVersion: number },
): Promise<TenantDto> {
  const db = getDatabase();
  return db.$transaction((tx) => restoreTenantInTx(tx, ownerUserId, rawInput));
}

/**
 * Online-only move-in workflow: verifies max 1 active assignment per tenant,
 * atomically creates the unified Allocation record, creates TenantAssignment,
 * updates Bed availability (AVAILABLE -> OCCUPIED on immediate start), and publishes audit/feed.
 */
export async function assignTenantToBed(
  ownerUserId: string,
  rawInput: CreateTenantAssignmentInput,
  asOfUtc: Date = new Date(),
): Promise<TenantAssignmentDto> {
  const parsed = CreateTenantAssignmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Check assignment fields and try again.",
    );
  }
  const input = parsed.data;
  const startInstant = manilaDateTimeToUtc(input.startDateManila, "00:00");
  const endInstant = manilaDateTimeToUtc(input.endDateManila, "00:00");
  const db = getDatabase();

  try {
    return await db.$transaction(async (tx) => {
      await lockTenantRow(tx, ownerUserId, input.tenantId);

      const tenant = await tx.tenant.findFirst({
        where: { id: input.tenantId, ownerUserId },
        select: { id: true, archivedAt: true },
      });
      if (!tenant) {
        throw new NotFoundError("The requested tenant was not found.");
      }
      if (tenant.archivedAt !== null) {
        throw new PreconditionError(
          "Restore this archived tenant before assigning a bed.",
        );
      }

      const bed = await tx.bed.findFirst({
        where: { id: input.bedId, ownerUserId },
        select: {
          id: true,
          roomId: true,
          room: { select: { building: true } },
        },
      });
      if (!bed) {
        throw new NotFoundError("The requested bed was not found.");
      }
      if (bed.room.building !== "BOARDING") {
        throw new PreconditionError(
          "Only Boarding House rooms can be assigned to tenants.",
        );
      }

      await lockAllocationResources(tx, ownerUserId, [bed.roomId], [bed.id]);

      const existingActive = await tx.tenantAssignment.findFirst({
        where: { ownerUserId, tenantId: tenant.id, status: "ACTIVE" },
        select: { id: true },
      });
      if (existingActive) {
        throw new ConflictError(
          "This tenant already has an active bed assignment.",
        );
      }

      const [allocation] = await createAllocationInTx(tx, {
        ownerUserId,
        roomId: bed.roomId,
        bedId: bed.id,
        scope: "BED",
        type: "TENANT_ASSIGNMENT",
        startDate: startInstant,
        endDate: endInstant,
        notes: input.notes,
        asOfUtc,
      });

      if (!allocation) {
        throw new Error("Allocation creation returned no record.");
      }

      const assignment = await tx.tenantAssignment.create({
        data: {
          ownerUserId,
          tenantId: tenant.id,
          roomId: bed.roomId,
          bedId: bed.id,
          allocationId: allocation.id,
          startDate: startInstant,
          endDate: endInstant,
          monthlyRate: input.monthlyRate,
          securityDeposit: input.securityDeposit,
          status: "ACTIVE",
          version: 1,
          notes: input.notes,
        },
        select: assignmentSelect,
      });

      const dto = toAssignmentDto(assignment);
      const sequence = await allocateSyncSequence(tx, ownerUserId);

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "tenants",
        action: "assignment.created",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "tenant_assignment",
        entityId: dto.id,
        metadata: {
          tenantId: dto.tenantId,
          roomId: dto.roomId,
          bedId: dto.bedId,
          allocationId: dto.allocationId,
          startDate: dto.startDate,
          endDate: dto.endDate,
        },
      });

      await appendChangeFeed(tx, {
        ownerUserId,
        sequence,
        entityType: "tenant_assignment",
        entityId: dto.id,
        version: dto.version,
        operation: "upsert",
        payload: dto,
      });

      return dto;
    });
  } catch (error) {
    if (
      isPgConstraintError(
        error,
        "23505",
        "TenantAssignment_one_active_per_tenant_key",
      )
    ) {
      throw new ConflictError(
        "This tenant already has an active bed assignment.",
      );
    }
    throw error;
  }
}

/**
 * Online-only move-out or cancellation: atomically completes/truncates or cancels
 * the TenantAssignment and linked Allocation, restores Bed.status when no other
 * allocation covers `asOfUtc`, and publishes AuditLog + ChangeFeed entries.
 */
export async function moveOutTenantAssignment(
  ownerUserId: string,
  rawInput: MoveOutTenantAssignmentInput,
  asOfUtc: Date = new Date(),
): Promise<TenantAssignmentDto> {
  const parsed = MoveOutTenantAssignmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Check move-out details and try again.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  return db.$transaction(async (tx) => {
    const existing = await tx.tenantAssignment.findFirst({
      where: { id: input.assignmentId, ownerUserId },
      select: {
        id: true,
        tenantId: true,
        roomId: true,
        bedId: true,
        allocationId: true,
        startDate: true,
        endDate: true,
        status: true,
        version: true,
        notes: true,
      },
    });
    if (!existing) {
      throw new NotFoundError("The requested tenant assignment was not found.");
    }

    await lockTenantRow(tx, ownerUserId, existing.tenantId);
    await lockAllocationResources(
      tx,
      ownerUserId,
      [existing.roomId],
      [existing.bedId],
    );

    if (existing.status !== "ACTIVE") {
      throw new ConflictError("This assignment has already been closed.");
    }
    if (existing.version !== input.expectedVersion) {
      throw new ConflictError(
        "This assignment changed elsewhere. Reload and try again.",
      );
    }

    const startManila = toManilaDate(existing.startDate);
    const shouldCancel =
      input.mode === "cancel" ||
      (input.actualMoveOutDateManila <= startManila &&
        asOfUtc.getTime() <= existing.startDate.getTime());

    let nextStatus: TenantAssignmentStatusValue;
    let actualMoveOutDate: Date | null;

    if (shouldCancel) {
      await cancelAllocationInTx(tx, {
        ownerUserId,
        allocationId: existing.allocationId,
        asOfUtc,
      });
      nextStatus = "CANCELLED";
      actualMoveOutDate = null;
    } else {
      if (input.actualMoveOutDateManila < startManila) {
        throw new ValidationError(
          "Move-out date cannot be before move-in date. Cancel instead if the stay never began.",
        );
      }

      const candidateInstant =
        input.actualMoveOutDateManila === startManila
          ? asOfUtc
          : manilaDateTimeToUtc(input.actualMoveOutDateManila, "00:00");

      if (candidateInstant.getTime() <= existing.startDate.getTime()) {
        throw new ValidationError(
          "Move-out instant must be after move-in start. Cancel instead if the stay never began.",
        );
      }

      await completeAllocationInTx(tx, {
        ownerUserId,
        allocationId: existing.allocationId,
        truncatedEndDate: candidateInstant,
        asOfUtc,
      });
      nextStatus = "COMPLETED";
      actualMoveOutDate = candidateInstant;
    }

    const updated = await tx.tenantAssignment.updateMany({
      where: {
        id: existing.id,
        ownerUserId,
        version: input.expectedVersion,
        status: "ACTIVE",
      },
      data: {
        status: nextStatus,
        actualMoveOutDate,
        ...(input.notes !== null ? { notes: input.notes } : {}),
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new ConflictError(
        "This assignment changed elsewhere. Reload and try again.",
      );
    }

    const saved = await tx.tenantAssignment.findUniqueOrThrow({
      where: { id: existing.id },
      select: assignmentSelect,
    });

    const dto = toAssignmentDto(saved);
    const sequence = await allocateSyncSequence(tx, ownerUserId);

    await writeAuditEntry(tx, {
      ownerUserId,
      sequence,
      area: "tenants",
      action:
        nextStatus === "CANCELLED"
          ? "assignment.cancelled"
          : "assignment.completed",
      actorType: "owner",
      actorId: ownerUserId,
      entityType: "tenant_assignment",
      entityId: dto.id,
      metadata: {
        tenantId: dto.tenantId,
        roomId: dto.roomId,
        bedId: dto.bedId,
        allocationId: dto.allocationId,
        ...(dto.actualMoveOutDate
          ? { actualMoveOutDate: dto.actualMoveOutDate }
          : {}),
      },
    });

    await appendChangeFeed(tx, {
      ownerUserId,
      sequence,
      entityType: "tenant_assignment",
      entityId: dto.id,
      version: dto.version,
      operation: "upsert",
      payload: dto,
    });

    return dto;
  });
}

export async function createTenantNote(
  ownerUserId: string,
  rawInput: CreateTenantNoteInput,
): Promise<TenantNoteDto> {
  const parsed = CreateTenantNoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Enter a note before saving.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  return db.$transaction(async (tx) => {
    await lockTenantRow(tx, ownerUserId, input.tenantId);

    const existingTenant = await tx.tenant.findFirst({
      where: { id: input.tenantId, ownerUserId },
      select: { id: true, archivedAt: true },
    });
    if (!existingTenant) {
      throw new NotFoundError("The requested tenant was not found.");
    }
    if (existingTenant.archivedAt !== null) {
      throw new ConflictError(
        "Restore the archived tenant before adding notes.",
      );
    }

    const saved = await tx.tenantNote.create({
      data: {
        id: randomUUID(),
        ownerUserId,
        tenantId: existingTenant.id,
        content: input.content,
      },
      select: tenantNoteSelect,
    });

    const dto = toTenantNoteDto(saved);
    const sequence = await allocateSyncSequence(tx, ownerUserId);

    await writeAuditEntry(tx, {
      ownerUserId,
      sequence,
      area: "tenants",
      action: "tenant_note.created",
      actorType: "owner",
      actorId: ownerUserId,
      entityType: "tenant_note",
      entityId: dto.id,
      metadata: { tenantId: dto.tenantId },
    });

    await appendChangeFeed(tx, {
      ownerUserId,
      sequence,
      entityType: "tenant_note",
      entityId: dto.id,
      version: 1,
      operation: "upsert",
      payload: dto,
    });

    return dto;
  });
}

export async function deleteTenantNote(
  ownerUserId: string,
  rawInput: DeleteTenantNoteInput,
): Promise<{ deletedNoteId: string; tenantId: string }> {
  const parsed = DeleteTenantNoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Select a valid note.",
    );
  }
  const input = parsed.data;
  const db = getDatabase();

  return db.$transaction(async (tx) => {
    await lockTenantRow(tx, ownerUserId, input.tenantId);

    const existingTenant = await tx.tenant.findFirst({
      where: { id: input.tenantId, ownerUserId },
      select: { id: true, archivedAt: true },
    });
    if (!existingTenant) {
      throw new NotFoundError("The requested tenant was not found.");
    }
    if (existingTenant.archivedAt !== null) {
      throw new ConflictError(
        "Restore the archived tenant before deleting notes.",
      );
    }

    const existingNote = await tx.tenantNote.findFirst({
      where: {
        id: input.noteId,
        tenantId: existingTenant.id,
        ownerUserId,
      },
      select: tenantNoteSelect,
    });
    if (!existingNote) {
      throw new NotFoundError("The requested tenant note was not found.");
    }

    const dto = toTenantNoteDto(existingNote);
    await tx.tenantNote.delete({
      where: { id: existingNote.id },
    });

    const sequence = await allocateSyncSequence(tx, ownerUserId);

    await writeAuditEntry(tx, {
      ownerUserId,
      sequence,
      area: "tenants",
      action: "tenant_note.deleted",
      actorType: "owner",
      actorId: ownerUserId,
      entityType: "tenant_note",
      entityId: dto.id,
      metadata: { tenantId: dto.tenantId },
    });

    await appendChangeFeed(tx, {
      ownerUserId,
      sequence,
      entityType: "tenant_note",
      entityId: dto.id,
      version: 1,
      operation: "tombstone",
      payload: dto,
    });

    return { deletedNoteId: dto.id, tenantId: dto.tenantId };
  });
}
