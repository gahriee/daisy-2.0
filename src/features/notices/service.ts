import "server-only";
import { randomUUID } from "node:crypto";
import { addManilaDays, manilaDateTimeToUtc, toManilaDate } from "@/lib/dates";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { getDatabase } from "@/server/db/client";
import {
  ensureOwnerRecord,
  type DatabaseExecutor,
} from "@/server/db/owner-record";
import {
  allocateSyncSequence,
  appendChangeFeed,
  writeAuditEntry,
} from "@/server/sync/publish";
import {
  ArchiveRestoreNoticeSchema,
  CreateNoticeSchema,
  UpdateNoticeSchema,
  type ArchiveRestoreNoticeInput,
  type CreateNoticeInput,
  type NoticeAudienceValue,
  type NoticeDto,
  type NoticeLifecycleStatus,
  type NoticeOverviewDto,
  type UpdateNoticeInput,
} from "./schemas";

const noticeSelect = {
  id: true,
  version: true,
  audience: true,
  roomId: true,
  room: { select: { number: true } },
  tenantId: true,
  tenant: { select: { fullName: true } },
  title: true,
  body: true,
  startDateManila: true,
  endDateManila: true,
  startDate: true,
  endDate: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type NoticeRow = {
  id: string;
  version: number;
  audience: NoticeAudienceValue;
  roomId: string | null;
  room: { number: string } | null;
  tenantId: string | null;
  tenant: { fullName: string } | null;
  title: string;
  body: string;
  startDateManila: string;
  endDateManila: string;
  startDate: Date;
  endDate: Date;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function computeNoticeLifecycleStatus(
  row: Pick<NoticeRow, "archivedAt" | "startDateManila" | "endDateManila">,
  todayManila: string,
): NoticeLifecycleStatus {
  if (row.archivedAt) return "ARCHIVED";
  if (row.startDateManila > todayManila) return "SCHEDULED";
  if (row.endDateManila < todayManila) return "EXPIRED";
  return "ACTIVE";
}

function toNoticeDto(row: NoticeRow, todayManila: string): NoticeDto {
  return {
    id: row.id,
    version: row.version,
    audience: row.audience,
    roomId: row.roomId,
    roomNumber: row.room?.number ?? null,
    tenantId: row.tenantId,
    tenantName: row.tenant?.fullName ?? null,
    title: row.title,
    body: row.body,
    startDateManila: row.startDateManila,
    endDateManila: row.endDateManila,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    lifecycleStatus: computeNoticeLifecycleStatus(row, todayManila),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeNoticeForFeed(dto: NoticeDto) {
  return {
    id: dto.id,
    version: dto.version,
    audience: dto.audience,
    roomId: dto.roomId,
    roomNumber: dto.roomNumber,
    tenantId: dto.tenantId,
    tenantName: dto.tenantName,
    title: dto.title,
    body: dto.body,
    startDateManila: dto.startDateManila,
    endDateManila: dto.endDateManila,
    startDate: dto.startDate,
    endDate: dto.endDate,
    archivedAt: dto.archivedAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

async function lockSyncHeadForNotices(
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

async function assertNoticeTargetsExistInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  audience: NoticeAudienceValue,
  roomId: string | null,
  tenantId: string | null,
): Promise<void> {
  if (audience === "ROOM") {
    if (!roomId) {
      throw new ValidationError("Select the room this notice applies to.");
    }
    const room = await tx.room.findFirst({
      where: { id: roomId, ownerUserId, archivedAt: null },
      select: { id: true },
    });
    if (!room) {
      throw new NotFoundError("Selected room was not found.");
    }
    return;
  }

  if (audience === "TENANT") {
    if (!tenantId) {
      throw new ValidationError("Select the tenant this notice applies to.");
    }
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId, ownerUserId, archivedAt: null },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundError("Selected tenant was not found.");
    }
  }
}

async function publishNoticeSnapshotInTx(
  tx: DatabaseExecutor,
  ownerUserId: string,
  dto: NoticeDto,
  operation: "upsert" | "tombstone" = dto.archivedAt ? "tombstone" : "upsert",
): Promise<bigint> {
  const sequence = await allocateSyncSequence(tx, ownerUserId);
  await appendChangeFeed(tx, {
    ownerUserId,
    sequence,
    entityType: "notice",
    entityId: dto.id,
    version: dto.version,
    operation,
    payload: serializeNoticeForFeed(dto),
  });
  return sequence;
}

/**
 * Repeatable-read Owner snapshot returning notices, active/scheduled/expired/archived
 * totals for Asia/Manila today, and active room & tenant audience selectors.
 */
export async function getNoticesOverview(
  ownerUserId: string,
): Promise<NoticeOverviewDto> {
  const db = getDatabase();
  const todayManila = toManilaDate(new Date());

  return db.$transaction(
    async (tx) => {
      const [noticeRows, roomRows, tenantRows] = await Promise.all([
        tx.notice.findMany({
          where: { ownerUserId },
          orderBy: [
            { archivedAt: "asc" },
            { startDateManila: "desc" },
            { createdAt: "desc" },
          ],
          select: noticeSelect,
        }),
        tx.room.findMany({
          where: { ownerUserId, archivedAt: null },
          orderBy: [{ building: "asc" }, { number: "asc" }],
          select: { id: true, building: true, number: true, floor: true },
        }),
        tx.tenant.findMany({
          where: { ownerUserId, archivedAt: null },
          orderBy: [{ fullName: "asc" }],
          select: { id: true, fullName: true },
        }),
      ]);

      const notices = noticeRows.map((row) => toNoticeDto(row, todayManila));
      let activeCount = 0;
      let scheduledCount = 0;
      let expiredCount = 0;
      let archivedCount = 0;

      for (const notice of notices) {
        if (notice.lifecycleStatus === "ACTIVE") activeCount += 1;
        else if (notice.lifecycleStatus === "SCHEDULED") scheduledCount += 1;
        else if (notice.lifecycleStatus === "EXPIRED") expiredCount += 1;
        else archivedCount += 1;
      }

      return {
        todayManila,
        totals: {
          activeCount,
          scheduledCount,
          expiredCount,
          archivedCount,
        },
        notices,
        rooms: roomRows,
        tenants: tenantRows,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

/**
 * Creates a property-wide, room-targeted, or tenant-targeted notice online-only
 * and publishes its ChangeFeed snapshot + identifier-only AuditLog entry.
 */
export async function createNotice(
  ownerUserId: string,
  rawInput: CreateNoticeInput,
): Promise<NoticeDto> {
  const parsed = CreateNoticeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check the notice details.",
    );
  }
  const input = parsed.data;
  const startDate = manilaDateTimeToUtc(input.startDateManila, "00:00");
  const endDate = manilaDateTimeToUtc(
    addManilaDays(input.endDateManila, 1),
    "00:00",
  );
  const todayManila = toManilaDate(new Date());
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForNotices(tx, ownerUserId);
      await assertNoticeTargetsExistInTx(
        tx,
        ownerUserId,
        input.audience,
        input.roomId,
        input.tenantId,
      );

      const created = await tx.notice.create({
        data: {
          id: randomUUID(),
          ownerUserId,
          audience: input.audience,
          roomId: input.audience === "ROOM" ? input.roomId : null,
          tenantId: input.audience === "TENANT" ? input.tenantId : null,
          title: input.title,
          body: input.body,
          startDateManila: input.startDateManila,
          endDateManila: input.endDateManila,
          startDate,
          endDate,
        },
        select: noticeSelect,
      });

      const dto = toNoticeDto(created, todayManila);
      const sequence = await publishNoticeSnapshotInTx(
        tx,
        ownerUserId,
        dto,
        "upsert",
      );

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "notices",
        action: "notice.created",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "notice",
        entityId: dto.id,
        metadata: {
          audience: dto.audience,
          ...(dto.roomId ? { roomId: dto.roomId } : {}),
          ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
          startDateManila: dto.startDateManila,
          endDateManila: dto.endDateManila,
        },
      });

      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Updates an active or scheduled notice with optimistic version checking and
 * publishes the updated snapshot to ChangeFeed.
 */
export async function updateNotice(
  ownerUserId: string,
  rawInput: UpdateNoticeInput,
): Promise<NoticeDto> {
  const parsed = UpdateNoticeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check the notice details.",
    );
  }
  const input = parsed.data;
  const startDate = manilaDateTimeToUtc(input.startDateManila, "00:00");
  const endDate = manilaDateTimeToUtc(
    addManilaDays(input.endDateManila, 1),
    "00:00",
  );
  const todayManila = toManilaDate(new Date());
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForNotices(tx, ownerUserId);

      const current = await tx.notice.findFirst({
        where: { id: input.noticeId, ownerUserId },
        select: { id: true, version: true, archivedAt: true },
      });
      if (!current) {
        throw new NotFoundError("Notice was not found.");
      }
      if (current.archivedAt) {
        throw new ConflictError("Restore this archived notice before editing.");
      }
      if (current.version !== input.expectedVersion) {
        throw new ConflictError("Notice changed since you opened it.");
      }

      await assertNoticeTargetsExistInTx(
        tx,
        ownerUserId,
        input.audience,
        input.roomId,
        input.tenantId,
      );

      const updated = await tx.notice.updateMany({
        where: {
          id: current.id,
          ownerUserId,
          version: input.expectedVersion,
          archivedAt: null,
        },
        data: {
          version: { increment: 1 },
          audience: input.audience,
          roomId: input.audience === "ROOM" ? input.roomId : null,
          tenantId: input.audience === "TENANT" ? input.tenantId : null,
          title: input.title,
          body: input.body,
          startDateManila: input.startDateManila,
          endDateManila: input.endDateManila,
          startDate,
          endDate,
        },
      });
      if (updated.count === 0) {
        throw new ConflictError("Notice was modified concurrently.");
      }

      const saved = await tx.notice.findUniqueOrThrow({
        where: { id: current.id },
        select: noticeSelect,
      });
      const dto = toNoticeDto(saved, todayManila);
      const sequence = await publishNoticeSnapshotInTx(
        tx,
        ownerUserId,
        dto,
        "upsert",
      );

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "notices",
        action: "notice.updated",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "notice",
        entityId: dto.id,
        metadata: {
          audience: dto.audience,
          ...(dto.roomId ? { roomId: dto.roomId } : {}),
          ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
          startDateManila: dto.startDateManila,
          endDateManila: dto.endDateManila,
        },
      });

      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Soft-archives a notice and emits a ChangeFeed tombstone snapshot.
 */
export async function archiveNotice(
  ownerUserId: string,
  rawInput: ArchiveRestoreNoticeInput,
): Promise<NoticeDto> {
  const parsed = ArchiveRestoreNoticeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Select a valid notice.",
    );
  }
  const input = parsed.data;
  const todayManila = toManilaDate(new Date());
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForNotices(tx, ownerUserId);

      const current = await tx.notice.findFirst({
        where: { id: input.noticeId, ownerUserId },
        select: { id: true, version: true, archivedAt: true },
      });
      if (!current) {
        throw new NotFoundError("Notice was not found.");
      }
      if (current.archivedAt) {
        throw new ConflictError("Notice is already archived.");
      }
      if (current.version !== input.expectedVersion) {
        throw new ConflictError("Notice changed since you loaded it.");
      }

      const updated = await tx.notice.updateMany({
        where: {
          id: current.id,
          ownerUserId,
          version: input.expectedVersion,
          archivedAt: null,
        },
        data: {
          version: { increment: 1 },
          archivedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new ConflictError("Notice was modified concurrently.");
      }

      const saved = await tx.notice.findUniqueOrThrow({
        where: { id: current.id },
        select: noticeSelect,
      });
      const dto = toNoticeDto(saved, todayManila);
      const sequence = await publishNoticeSnapshotInTx(
        tx,
        ownerUserId,
        dto,
        "tombstone",
      );

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "notices",
        action: "notice.archived",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "notice",
        entityId: dto.id,
      });

      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}

/**
 * Restores an archived notice and republishes an upsert ChangeFeed snapshot.
 */
export async function restoreNotice(
  ownerUserId: string,
  rawInput: ArchiveRestoreNoticeInput,
): Promise<NoticeDto> {
  const parsed = ArchiveRestoreNoticeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Select a valid notice.",
    );
  }
  const input = parsed.data;
  const todayManila = toManilaDate(new Date());
  const db = getDatabase();

  return db.$transaction(
    async (tx) => {
      await lockSyncHeadForNotices(tx, ownerUserId);

      const current = await tx.notice.findFirst({
        where: { id: input.noticeId, ownerUserId },
        select: { id: true, version: true, archivedAt: true },
      });
      if (!current) {
        throw new NotFoundError("Notice was not found.");
      }
      if (!current.archivedAt) {
        throw new ConflictError("Notice is already active.");
      }
      if (current.version !== input.expectedVersion) {
        throw new ConflictError("Notice changed since you loaded it.");
      }

      const updated = await tx.notice.updateMany({
        where: {
          id: current.id,
          ownerUserId,
          version: input.expectedVersion,
          archivedAt: { not: null },
        },
        data: {
          version: { increment: 1 },
          archivedAt: null,
        },
      });
      if (updated.count === 0) {
        throw new ConflictError("Notice was modified concurrently.");
      }

      const saved = await tx.notice.findUniqueOrThrow({
        where: { id: current.id },
        select: noticeSelect,
      });
      const dto = toNoticeDto(saved, todayManila);
      const sequence = await publishNoticeSnapshotInTx(
        tx,
        ownerUserId,
        dto,
        "upsert",
      );

      await writeAuditEntry(tx, {
        ownerUserId,
        sequence,
        area: "notices",
        action: "notice.restored",
        actorType: "owner",
        actorId: ownerUserId,
        entityType: "notice",
        entityId: dto.id,
      });

      return dto;
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
}
