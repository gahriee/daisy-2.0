import "server-only";
import { randomUUID } from "node:crypto";
import {
  cancelAllocationInTx,
  completeAllocationInTx,
  createAllocationInTx,
} from "@/features/allocations/service";
import { addManilaDays, manilaDateTimeToUtc, toManilaDate } from "@/lib/dates";
import {
  ConflictError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from "@/lib/errors";
import { getServerOperationalLimits } from "@/config/business-config";
import { getDatabase } from "@/server/db/client";
import {
  ensureOwnerRecord,
  type DatabaseExecutor,
} from "@/server/db/owner-record";
import {
  allocateSyncSequence,
  appendChangeFeed,
  writeAuditEntry,
  type AuditActorType,
} from "@/server/sync/publish";
import {
  verifyUploadedMaintenanceAttachments,
  type VerifiedMaintenanceAttachment,
} from "./attachments";
import {
  AddMaintenanceUpdateSchema,
  ArchiveRestoreMaintenanceSchema,
  CreateMaintenanceRequestSchema,
  PlaceMaintenanceHoldSchema,
  ReleaseMaintenanceHoldSchema,
  type AddMaintenanceUpdateInput,
  type ArchiveRestoreMaintenanceInput,
  type CreateMaintenanceRequestInput,
  type MaintenanceAttachmentDto,
  type MaintenanceCategoryValue,
  type MaintenanceCreateContextDto,
  type MaintenanceDetailDto,
  type MaintenanceHoldDto,
  type MaintenanceOverviewDto,
  type MaintenancePriorityValue,
  type MaintenanceRequestDto,
  type MaintenanceRoomOptionDto,
  type MaintenanceStatusValue,
  type MaintenanceUpdateDto,
  type PlaceMaintenanceHoldInput,
  type ReleaseMaintenanceHoldInput,
} from "./schemas";

const maintenanceRequestSelect = {
  id: true,
  version: true,
  roomId: true,
  room: { select: { title: true } },
  bedId: true,
  bed: { select: { number: true } },
  title: true,
  description: true,
  category: true,
  priority: true,
  status: true,
  resolvedAt: true,
  archivedAt: true,
  createdByActorType: true,
  createdAt: true,
  updatedAt: true,
  updates: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      statusFrom: true,
      statusTo: true,
      note: true,
      createdByActorType: true,
      createdAt: true,
    },
  },
  attachments: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      maintenanceUpdateId: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      sha256: true,
      createdAt: true,
    },
  },
  holdAllocations: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      roomId: true,
      room: { select: { title: true } },
      bedId: true,
      bed: { select: { number: true } },
      allocationGroupId: true,
      scope: true,
      status: true,
      startDate: true,
      endDate: true,
      notes: true,
    },
  },
} as const;

type MaintenanceRequestRow = {
  id: string;
  version: number;
  roomId: string;
  room: { title: string };
  bedId: string | null;
  bed: { number: string } | null;
  title: string;
  description: string;
  category: MaintenanceCategoryValue;
  priority: MaintenancePriorityValue;
  status: MaintenanceStatusValue;
  resolvedAt: Date | null;
  archivedAt: Date | null;
  createdByActorType: string;
  createdAt: Date;
  updatedAt: Date;
  updates: Array<{
    id: string;
    statusFrom: MaintenanceStatusValue | null;
    statusTo: MaintenanceStatusValue | null;
    note: string;
    createdByActorType: string;
    createdAt: Date;
  }>;
  attachments: Array<{
    id: string;
    maintenanceUpdateId: string | null;
    fileName: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    createdAt: Date;
  }>;
  holdAllocations: Array<{
    id: string;
    roomId: string;
    room: { title: string };
    bedId: string;
    bed: { number: string };
    allocationGroupId: string | null;
    scope: "BED" | "WHOLE_ROOM";
    status: "ACTIVE" | "COMPLETED" | "CANCELLED";
    startDate: Date;
    endDate: Date;
    notes: string | null;
  }>;
};

function toAttachmentDto(
  row: MaintenanceRequestRow["attachments"][number],
): MaintenanceAttachmentDto {
  return {
    id: row.id,
    maintenanceUpdateId: row.maintenanceUpdateId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    downloadPath: `/api/maintenance/attachments/${row.id}/download`,
    createdAt: row.createdAt.toISOString(),
  };
}

function toUpdateDto(
  row: MaintenanceRequestRow["updates"][number],
): MaintenanceUpdateDto {
  return {
    id: row.id,
    statusFrom: row.statusFrom,
    statusTo: row.statusTo,
    note: row.note,
    createdByActorType: row.createdByActorType,
    createdAt: row.createdAt.toISOString(),
  };
}

function toHoldDto(
  row: MaintenanceRequestRow["holdAllocations"][number],
): MaintenanceHoldDto {
  return {
    id: row.id,
    roomId: row.roomId,
    roomNumber: row.room.title,
    bedId: row.bedId,
    bedNumber: row.bed.number,
    allocationGroupId: row.allocationGroupId,
    scope: row.scope,
    status: row.status,
    startDateManila: toManilaDate(row.startDate),
    endDateManila: toManilaDate(row.endDate),
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    notes: row.notes,
  };
}

function toMaintenanceRequestDto(
  row: MaintenanceRequestRow,
): MaintenanceRequestDto {
  return {
    id: row.id,
    version: row.version,
    roomId: row.roomId,
    roomNumber: row.room.title,
    bedId: row.bedId,
    bedNumber: row.bed?.number ?? null,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdByActorType: row.createdByActorType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updates: row.updates.map(toUpdateDto),
    attachments: row.attachments.map(toAttachmentDto),
    activeHolds: row.holdAllocations
      .filter((h) => h.status === "ACTIVE")
      .map(toHoldDto),
  };
}

export async function lockSyncHeadForMaintenance(
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

async function publishMaintenanceSnapshotInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  dto: MaintenanceRequestDto,
  operation: "upsert" | "tombstone" = "upsert",
): Promise<bigint> {
  const sequence = await allocateSyncSequence(tx, ownerUserId);
  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "maintenance_request",
    entityId: dto.id,
    version: dto.version,
    operation,
    payload: dto,
  });
  return sequence;
}

async function attachVerifiedFilesInTx(
  tx: DatabaseExecutor,
  params: {
    ownerUserId: string;
    maintenanceRequestId: string;
    maintenanceUpdateId?: string;
    verified: VerifiedMaintenanceAttachment[];
  },
): Promise<number> {
  for (const file of params.verified) {
    const claimed = await tx.maintenanceAttachmentIntent.updateMany({
      where: {
        id: file.intentId,
        ownerUserId: params.ownerUserId,
        status: "PENDING_UPLOAD",
      },
      data: {
        status: "ATTACHED",
        maintenanceRequestId: params.maintenanceRequestId,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictError(
        `Attachment ${file.fileName} is no longer available to attach.`,
      );
    }

    await tx.maintenanceAttachment.create({
      data: {
        ownerUserId: params.ownerUserId,
        maintenanceRequestId: params.maintenanceRequestId,
        maintenanceUpdateId: params.maintenanceUpdateId ?? null,
        intentId: file.intentId,
        objectKey: file.objectKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
        byteSize: file.byteSize,
        sha256: file.sha256,
      },
      select: { id: true },
    });
  }
  return params.verified.length;
}

async function releaseHoldAllocationsInTx(
  tx: DatabaseExecutor,
  params: {
    ownerUserId: string;
    maintenanceRequestId: string;
    action: "COMPLETE" | "CANCEL";
    endUtc: Date;
    actorType: AuditActorType;
    actorId: string;
  },
): Promise<number> {
  const activeHolds = await tx.allocation.findMany({
    where: {
      ownerUserId: params.ownerUserId,
      maintenanceRequestId: params.maintenanceRequestId,
      type: "MAINTENANCE_HOLD",
      status: "ACTIVE",
    },
    orderBy: [{ bedId: "asc" }],
    select: {
      id: true,
      startDate: true,
    },
  });

  for (const hold of activeHolds) {
    const canComplete =
      params.action === "COMPLETE" &&
      params.endUtc.getTime() > hold.startDate.getTime();
    if (canComplete) {
      await completeAllocationInTx(tx, {
        ownerUserId: params.ownerUserId,
        allocationId: hold.id,
        truncatedEndDate: params.endUtc,
        asOfUtc: params.endUtc,
        actorType: params.actorType,
        actorId: params.actorId,
      });
    } else {
      await cancelAllocationInTx(tx, {
        ownerUserId: params.ownerUserId,
        allocationId: hold.id,
        asOfUtc: params.endUtc,
        actorType: params.actorType,
        actorId: params.actorId,
      });
    }
  }

  return activeHolds.length;
}

function readProofLimitsInTx() {
  const limits = getServerOperationalLimits();
  return {
    proofMaxMb: limits.proofMaxMb,
    proofMaxFilesPerRecord: limits.proofMaxFilesPerRecord,
  };
}

async function listMaintenanceRoomOptionsInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
): Promise<MaintenanceRoomOptionDto[]> {
  const rows = await tx.room.findMany({
    where: { ownerUserId, archivedAt: null },
    orderBy: [{ building: "asc" }, { title: "asc" }],
    select: {
      id: true,
      building: true,
      title: true,
      floor: true,
      beds: {
        where: { archivedAt: null },
        orderBy: [{ number: "asc" }],
        select: { id: true, number: true, status: true },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    building: row.building,
    number: row.title,
    floor: row.floor,
    beds: row.beds,
  }));
}

/**
 * Form context for the dedicated /maintenance/new page (active rooms and
 * configured attachment limits).
 */
export async function getMaintenanceCreateContext(
  ownerUserId: string,
): Promise<MaintenanceCreateContextDto> {
  const db = getDatabase();
  return db.$transaction(
    async (tx) => {
      const [limits, rooms] = await Promise.all([
        readProofLimitsInTx(),
        listMaintenanceRoomOptionsInTx(tx, ownerUserId),
      ]);
      return {
        ...limits,
        rooms,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

/**
 * Repeatable-read detail view for a single Owner maintenance request
 * (updates timeline, uploaded attachments, active holds, and upload limits).
 */
export async function getMaintenanceRequestDetail(
  ownerUserId: string,
  requestId: string,
): Promise<MaintenanceDetailDto | null> {
  const db = getDatabase();
  const [limits, row] = await db.$transaction(
    async (tx) =>
      Promise.all([
        readProofLimitsInTx(),
        tx.maintenanceRequest.findFirst({
          where: { id: requestId, ownerUserId },
          select: maintenanceRequestSelect,
        }),
      ]),
    { isolationLevel: "RepeatableRead" },
  );

  if (!row) {
    return null;
  }

  return {
    ...limits,
    request: toMaintenanceRequestDto(row),
  };
}

/**
 * Repeatable-read snapshot of all Owner maintenance requests, append-only
 * updates, attachments, active maintenance holds, and active room/bed selectors.
 */
export async function getMaintenanceOverview(
  ownerUserId: string,
): Promise<MaintenanceOverviewDto> {
  const db = getDatabase();
  const [limits, rows, rooms] = await db.$transaction(
    async (tx) =>
      Promise.all([
        readProofLimitsInTx(),
        tx.maintenanceRequest.findMany({
          where: { ownerUserId },
          orderBy: [{ createdAt: "desc" }],
          select: maintenanceRequestSelect,
        }),
        listMaintenanceRoomOptionsInTx(tx, ownerUserId),
      ]),
    { isolationLevel: "RepeatableRead" },
  );

  const requests = rows.map(toMaintenanceRequestDto);
  const activeRequests = requests.filter((r) => !r.archivedAt);

  return {
    proofMaxMb: limits.proofMaxMb,
    proofMaxFilesPerRecord: limits.proofMaxFilesPerRecord,
    totals: {
      openCount: activeRequests.filter((r) => r.status === "OPEN").length,
      inProgressCount: activeRequests.filter((r) => r.status === "IN_PROGRESS")
        .length,
      urgentOpenCount: activeRequests.filter(
        (r) =>
          r.priority === "URGENT" &&
          (r.status === "OPEN" || r.status === "IN_PROGRESS"),
      ).length,
      activeHoldsCount: activeRequests.reduce(
        (sum, r) => sum + r.activeHolds.length,
        0,
      ),
    },
    requests,
    rooms,
  };
}

export async function createMaintenanceRequestInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: CreateMaintenanceRequestInput,
  options?: {
    actor?: {
      actorType: AuditActorType;
      actorId: string;
      operationId?: string;
    };
    verifiedAttachments?: VerifiedMaintenanceAttachment[];
  },
): Promise<MaintenanceRequestDto> {
  const parsed = CreateMaintenanceRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check maintenance request details.",
    );
  }
  const input = parsed.data;
  const actor = options?.actor ?? {
    actorType: "owner" as const,
    actorId: ownerUserId,
  };

  await lockSyncHeadForMaintenance(tx, ownerUserId);

  const room = await tx.room.findFirst({
    where: { id: input.roomId, ownerUserId },
    select: { id: true, archivedAt: true },
  });
  if (!room) {
    throw new NotFoundError("Selected room was not found.");
  }
  if (room.archivedAt !== null) {
    throw new PreconditionError(
      "Restore the room before logging maintenance for it.",
    );
  }

  if (input.bedId) {
    const bed = await tx.bed.findFirst({
      where: { id: input.bedId, ownerUserId, roomId: room.id },
      select: { id: true, archivedAt: true },
    });
    if (!bed) {
      throw new NotFoundError("Selected bed was not found in that room.");
    }
    if (bed.archivedAt !== null) {
      throw new PreconditionError(
        "Restore the bed before logging maintenance for it.",
      );
    }
  }

  const requestId = input.id ?? randomUUID();
  const created = await tx.maintenanceRequest.create({
    data: {
      id: requestId,
      ownerUserId,
      version: 1,
      roomId: room.id,
      bedId: input.bedId,
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority,
      status: "OPEN",
      createdByActorType: actor.actorType,
      createdByActorId: actor.actorId,
    },
    select: { id: true },
  });

  if (options?.verifiedAttachments && options.verifiedAttachments.length > 0) {
    await attachVerifiedFilesInTx(tx, {
      ownerUserId,
      maintenanceRequestId: created.id,
      verified: options.verifiedAttachments,
    });
  }

  const saved = await tx.maintenanceRequest.findUniqueOrThrow({
    where: { id: created.id },
    select: maintenanceRequestSelect,
  });
  const dto = toMaintenanceRequestDto(saved);
  const sequence = await publishMaintenanceSnapshotInTx(tx, ownerUserId, dto);

  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "maintenance",
    action: "maintenanceRequest.created",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "maintenance_request",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: {
      roomId: dto.roomId,
      bedId: dto.bedId,
      category: dto.category,
      priority: dto.priority,
      attachmentCount: dto.attachments.length,
    },
  });

  return dto;
}

export async function createMaintenanceRequest(
  ownerUserId: string,
  rawInput: CreateMaintenanceRequestInput,
): Promise<MaintenanceRequestDto> {
  const parsed = CreateMaintenanceRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check maintenance request details.",
    );
  }
  const verifiedAttachments = await verifyUploadedMaintenanceAttachments(
    ownerUserId,
    parsed.data.attachmentIntentIds,
    0,
  );
  const db = getDatabase();
  return db.$transaction(
    async (tx) =>
      createMaintenanceRequestInTx(tx, ownerUserId, parsed.data, {
        verifiedAttachments,
      }),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function addMaintenanceUpdateInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: AddMaintenanceUpdateInput,
  options?: {
    actor?: {
      actorType: AuditActorType;
      actorId: string;
      operationId?: string;
    };
    verifiedAttachments?: VerifiedMaintenanceAttachment[];
  },
): Promise<MaintenanceRequestDto> {
  const parsed = AddMaintenanceUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check maintenance update details.",
    );
  }
  const input = parsed.data;
  const actor = options?.actor ?? {
    actorType: "owner" as const,
    actorId: ownerUserId,
  };

  await lockSyncHeadForMaintenance(tx, ownerUserId);

  const existing = await tx.maintenanceRequest.findFirst({
    where: { id: input.requestId, ownerUserId },
    select: {
      id: true,
      version: true,
      status: true,
      archivedAt: true,
      resolvedAt: true,
    },
  });
  if (!existing) {
    throw new NotFoundError("Maintenance request was not found.");
  }
  if (existing.archivedAt !== null) {
    throw new ConflictError(
      "This maintenance request is archived. Restore it before posting updates.",
    );
  }
  if (existing.version !== input.expectedVersion) {
    throw new ConflictError(
      "Maintenance request changed since you loaded it. Reload before updating.",
    );
  }

  const nextStatus = input.statusTo ?? existing.status;
  const nowUtc = new Date();
  const resolvedAt =
    nextStatus === "RESOLVED" ? (existing.resolvedAt ?? nowUtc) : null;

  const bumped = await tx.maintenanceRequest.updateMany({
    where: {
      id: existing.id,
      ownerUserId,
      version: input.expectedVersion,
      archivedAt: null,
    },
    data: {
      status: nextStatus,
      resolvedAt,
      version: { increment: 1 },
    },
  });
  if (bumped.count === 0) {
    throw new ConflictError(
      "Maintenance request was modified concurrently. Reload and try again.",
    );
  }

  const updateRow = await tx.maintenanceUpdate.create({
    data: {
      id: input.updateId ?? randomUUID(),
      ownerUserId,
      maintenanceRequestId: existing.id,
      statusFrom:
        input.statusTo && input.statusTo !== existing.status
          ? existing.status
          : null,
      statusTo:
        input.statusTo && input.statusTo !== existing.status
          ? input.statusTo
          : null,
      note: input.note,
      createdByActorType: actor.actorType,
      createdByActorId: actor.actorId,
    },
    select: { id: true },
  });

  if (options?.verifiedAttachments && options.verifiedAttachments.length > 0) {
    await attachVerifiedFilesInTx(tx, {
      ownerUserId,
      maintenanceRequestId: existing.id,
      maintenanceUpdateId: updateRow.id,
      verified: options.verifiedAttachments,
    });
  }

  let releasedHoldCount = 0;
  if (nextStatus === "RESOLVED") {
    releasedHoldCount = await releaseHoldAllocationsInTx(tx, {
      ownerUserId,
      maintenanceRequestId: existing.id,
      action: "COMPLETE",
      endUtc: nowUtc,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
  }

  const saved = await tx.maintenanceRequest.findUniqueOrThrow({
    where: { id: existing.id },
    select: maintenanceRequestSelect,
  });
  const dto = toMaintenanceRequestDto(saved);
  const sequence = await publishMaintenanceSnapshotInTx(tx, ownerUserId, dto);

  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "maintenance",
    action: "maintenanceRequest.updated",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "maintenance_request",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: {
      statusFrom: existing.status,
      statusTo: nextStatus,
      updateId: updateRow.id,
      releasedHoldCount,
    },
  });

  return dto;
}

export async function addMaintenanceUpdate(
  ownerUserId: string,
  rawInput: AddMaintenanceUpdateInput,
): Promise<MaintenanceRequestDto> {
  const parsed = AddMaintenanceUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check maintenance update details.",
    );
  }
  const db = getDatabase();
  const existingCount = await db.maintenanceAttachment.count({
    where: { ownerUserId, maintenanceRequestId: parsed.data.requestId },
  });
  const verifiedAttachments = await verifyUploadedMaintenanceAttachments(
    ownerUserId,
    parsed.data.attachmentIntentIds,
    existingCount,
  );
  return db.$transaction(
    async (tx) =>
      addMaintenanceUpdateInTx(tx, ownerUserId, parsed.data, {
        verifiedAttachments,
      }),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function archiveMaintenanceRequestInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: ArchiveRestoreMaintenanceInput,
  actor: {
    actorType: AuditActorType;
    actorId: string;
    operationId?: string;
  } = {
    actorType: "owner",
    actorId: ownerUserId,
  },
): Promise<MaintenanceRequestDto> {
  const parsed = ArchiveRestoreMaintenanceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid archive request.",
    );
  }
  const { requestId, expectedVersion } = parsed.data;
  await lockSyncHeadForMaintenance(tx, ownerUserId);

  const existing = await tx.maintenanceRequest.findFirst({
    where: { id: requestId, ownerUserId },
    select: { id: true, version: true, archivedAt: true },
  });
  if (!existing) {
    throw new NotFoundError("Maintenance request was not found.");
  }
  if (existing.version !== expectedVersion) {
    throw new ConflictError("Maintenance request changed since you loaded it.");
  }
  if (existing.archivedAt !== null) {
    throw new PreconditionError("Maintenance request is already archived.");
  }

  const activeHoldCount = await tx.allocation.count({
    where: {
      ownerUserId,
      maintenanceRequestId: existing.id,
      status: "ACTIVE",
    },
  });
  if (activeHoldCount > 0) {
    throw new PreconditionError(
      "Release active maintenance holds before archiving this request.",
    );
  }

  const updated = await tx.maintenanceRequest.updateMany({
    where: {
      id: existing.id,
      ownerUserId,
      version: expectedVersion,
      archivedAt: null,
    },
    data: { archivedAt: new Date(), version: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new ConflictError("Maintenance request changed concurrently.");
  }

  const saved = await tx.maintenanceRequest.findUniqueOrThrow({
    where: { id: existing.id },
    select: maintenanceRequestSelect,
  });
  const dto = toMaintenanceRequestDto(saved);
  const sequence = await publishMaintenanceSnapshotInTx(
    tx,
    ownerUserId,
    dto,
    "tombstone",
  );

  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "maintenance",
    action: "maintenanceRequest.archived",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "maintenance_request",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: { version: dto.version },
  });

  return dto;
}

export async function archiveMaintenanceRequest(
  ownerUserId: string,
  rawInput: ArchiveRestoreMaintenanceInput,
): Promise<MaintenanceRequestDto> {
  return getDatabase().$transaction(
    async (tx) => archiveMaintenanceRequestInTx(tx, ownerUserId, rawInput),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

export async function restoreMaintenanceRequestInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  rawInput: ArchiveRestoreMaintenanceInput,
  actor: {
    actorType: AuditActorType;
    actorId: string;
    operationId?: string;
  } = {
    actorType: "owner",
    actorId: ownerUserId,
  },
): Promise<MaintenanceRequestDto> {
  const parsed = ArchiveRestoreMaintenanceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid restore request.",
    );
  }
  const { requestId, expectedVersion } = parsed.data;
  await lockSyncHeadForMaintenance(tx, ownerUserId);

  const existing = await tx.maintenanceRequest.findFirst({
    where: { id: requestId, ownerUserId },
    select: { id: true, version: true, archivedAt: true },
  });
  if (!existing) {
    throw new NotFoundError("Maintenance request was not found.");
  }
  if (existing.version !== expectedVersion) {
    throw new ConflictError("Maintenance request changed since you loaded it.");
  }
  if (existing.archivedAt === null) {
    throw new PreconditionError("Maintenance request is already active.");
  }

  const updated = await tx.maintenanceRequest.updateMany({
    where: {
      id: existing.id,
      ownerUserId,
      version: expectedVersion,
    },
    data: { archivedAt: null, version: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new ConflictError("Maintenance request changed concurrently.");
  }

  const saved = await tx.maintenanceRequest.findUniqueOrThrow({
    where: { id: existing.id },
    select: maintenanceRequestSelect,
  });
  const dto = toMaintenanceRequestDto(saved);
  const sequence = await publishMaintenanceSnapshotInTx(
    tx,
    ownerUserId,
    dto,
    "upsert",
  );

  await writeAuditEntry(tx, {
    ownerUserId,
    sequence,
    area: "maintenance",
    action: "maintenanceRequest.restored",
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: "maintenance_request",
    entityId: dto.id,
    operationId: actor.operationId,
    metadata: { version: dto.version },
  });

  return dto;
}

export async function restoreMaintenanceRequest(
  ownerUserId: string,
  rawInput: ArchiveRestoreMaintenanceInput,
): Promise<MaintenanceRequestDto> {
  return getDatabase().$transaction(
    async (tx) => restoreMaintenanceRequestInTx(tx, ownerUserId, rawInput),
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Places an online-only `MAINTENANCE_HOLD` allocation through the shared unified
 * allocation engine. Any overlapping boarder assignment, transient reservation,
 * or existing hold throws `AllocationConflictError`.
 */
export async function placeMaintenanceHold(
  ownerUserId: string,
  rawInput: PlaceMaintenanceHoldInput,
): Promise<MaintenanceRequestDto> {
  const parsed = PlaceMaintenanceHoldSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check maintenance hold dates.",
    );
  }
  const input = parsed.data;
  const startUtc = manilaDateTimeToUtc(input.startDateManila, "00:00");
  const endUtc = manilaDateTimeToUtc(
    addManilaDays(input.endDateManila, 1),
    "00:00",
  );
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForMaintenance(tx, ownerUserId);

      const request = await tx.maintenanceRequest.findFirst({
        where: { id: input.requestId, ownerUserId },
        select: {
          id: true,
          version: true,
          roomId: true,
          status: true,
          archivedAt: true,
        },
      });
      if (!request) {
        throw new NotFoundError("Maintenance request was not found.");
      }
      if (request.archivedAt !== null) {
        throw new PreconditionError(
          "Restore the maintenance request before placing a hold.",
        );
      }
      if (request.status === "RESOLVED") {
        throw new ConflictError(
          "Reopen the maintenance request before placing a maintenance hold.",
        );
      }
      if (request.version !== input.expectedVersion) {
        throw new ConflictError(
          "Maintenance request changed since you loaded it. Reload before placing a hold.",
        );
      }

      const bumped = await tx.maintenanceRequest.updateMany({
        where: {
          id: request.id,
          ownerUserId,
          version: input.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });
      if (bumped.count === 0) {
        throw new ConflictError(
          "Maintenance request was modified concurrently.",
        );
      }

      const createdAllocations = await createAllocationInTx(tx, {
        ownerUserId,
        roomId: request.roomId,
        ...(input.bedId ? { bedId: input.bedId } : {}),
        maintenanceRequestId: request.id,
        scope: input.scope,
        type: "MAINTENANCE_HOLD",
        startDate: startUtc,
        endDate: endUtc,
        notes: input.notes ?? "Maintenance hold",
        asOfUtc: new Date(),
      });

      await tx.maintenanceUpdate.create({
        data: {
          ownerUserId,
          maintenanceRequestId: request.id,
          statusFrom: null,
          statusTo: null,
          note:
            input.notes ??
            `Placed ${input.scope === "WHOLE_ROOM" ? "whole-room" : "bed"} maintenance hold (${input.startDateManila} to ${input.endDateManila}).`,
          createdByActorType: "owner",
          createdByActorId: ownerUserId,
        },
        select: { id: true },
      });

      const saved = await tx.maintenanceRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: maintenanceRequestSelect,
      });
      const dto = toMaintenanceRequestDto(saved);
      const sequence = await publishMaintenanceSnapshotInTx(
        tx,
        ownerUserId,
        dto,
      );

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "maintenance",
        action: "maintenanceHold.placed",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "maintenance_request",
        entityId: dto.id,
        metadata: {
          scope: input.scope,
          allocationCount: createdAllocations.length,
          startDateManila: input.startDateManila,
          endDateManila: input.endDateManila,
        },
      });

      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Online-only release of all active `MAINTENANCE_HOLD` allocations on a
 * maintenance request, restoring affected beds immediately when idle.
 */
export async function releaseMaintenanceHold(
  ownerUserId: string,
  rawInput: ReleaseMaintenanceHoldInput,
): Promise<MaintenanceRequestDto> {
  const parsed = ReleaseMaintenanceHoldSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid release request.",
    );
  }
  const input = parsed.data;
  const endUtc = input.endDateManila
    ? manilaDateTimeToUtc(addManilaDays(input.endDateManila, 1), "00:00")
    : new Date();
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForMaintenance(tx, ownerUserId);

      const request = await tx.maintenanceRequest.findFirst({
        where: { id: input.requestId, ownerUserId },
        select: { id: true, version: true },
      });
      if (!request) {
        throw new NotFoundError("Maintenance request was not found.");
      }
      if (request.version !== input.expectedVersion) {
        throw new ConflictError(
          "Maintenance request changed since you loaded it.",
        );
      }

      const bumped = await tx.maintenanceRequest.updateMany({
        where: {
          id: request.id,
          ownerUserId,
          version: input.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });
      if (bumped.count === 0) {
        throw new ConflictError(
          "Maintenance request was modified concurrently.",
        );
      }

      const released = await releaseHoldAllocationsInTx(tx, {
        ownerUserId,
        maintenanceRequestId: request.id,
        action: input.action,
        endUtc,
        actorType: "owner",
        actorId: ownerUserId,
      });

      if (released === 0) {
        throw new PreconditionError(
          "No active maintenance holds remain on this request.",
        );
      }

      await tx.maintenanceUpdate.create({
        data: {
          ownerUserId,
          maintenanceRequestId: request.id,
          statusFrom: null,
          statusTo: null,
          note:
            input.action === "CANCEL"
              ? `Cancelled ${released} maintenance hold(s).`
              : `Completed ${released} maintenance hold(s) and returned bed(s) to service.`,
          createdByActorType: "owner",
          createdByActorId: ownerUserId,
        },
        select: { id: true },
      });

      const saved = await tx.maintenanceRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: maintenanceRequestSelect,
      });
      const dto = toMaintenanceRequestDto(saved);
      const sequence = await publishMaintenanceSnapshotInTx(
        tx,
        ownerUserId,
        dto,
      );

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "maintenance",
        action: "maintenanceHold.released",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "maintenance_request",
        entityId: dto.id,
        metadata: { action: input.action, releasedCount: released },
      });

      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}
