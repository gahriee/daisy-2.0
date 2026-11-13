import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { addManilaDays, manilaDateTimeToUtc } from "@/lib/dates";
import { ValidationError } from "@/lib/errors";
import { getDatabase } from "@/server/db/client";
import {
  AuditFilterSchema,
  type AuditAreaFilter,
  type AuditFilterInput,
  type AuditLogEntryDto,
} from "./schemas";

/**
 * Bounded identifier-only audit projection for the Owner workspace.
 * Read-only: produces no audit or notification events.
 */
export async function listAuditLogs(
  ownerUserId: string,
  rawFilter: AuditFilterInput = {},
): Promise<{
  entries: AuditLogEntryDto[];
  filters: {
    area: AuditAreaFilter;
    query: string;
    action: string;
    fromDate: string;
    toDate: string;
  };
}> {
  const parsed = AuditFilterSchema.safeParse(rawFilter);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid audit filter parameters.",
    );
  }
  const { area, query, action, fromDate, toDate, limit } = parsed.data;

  const createdAtFilter: Prisma.DateTimeFilter = {};
  if (fromDate) {
    createdAtFilter.gte = manilaDateTimeToUtc(fromDate, "00:00");
  }
  if (toDate) {
    createdAtFilter.lt = manilaDateTimeToUtc(addManilaDays(toDate, 1), "00:00");
  }

  const where: Prisma.AuditLogWhereInput = {
    ownerUserId,
    ...(area !== "all" ? { area } : {}),
    ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
    ...(query
      ? {
          OR: [
            { action: { contains: query, mode: "insensitive" } },
            { entityType: { contains: query, mode: "insensitive" } },
            { entityId: { contains: query, mode: "insensitive" } },
            { actorType: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(fromDate || toDate ? { createdAt: createdAtFilter } : {}),
  };

  const rows = await getDatabase().auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      area: true,
      action: true,
      actorType: true,
      actorId: true,
      entityType: true,
      entityId: true,
      sequence: true,
      createdAt: true,
    },
  });

  return {
    entries: rows.map((row) => ({
      id: row.id,
      area: row.area,
      action: row.action,
      actorType: row.actorType,
      actorId: row.actorId,
      entityType: row.entityType,
      entityId: row.entityId,
      sequence: row.sequence !== null ? row.sequence.toString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
    filters: {
      area,
      query: query ?? "",
      action: action ?? "",
      fromDate: fromDate ?? "",
      toDate: toDate ?? "",
    },
  };
}
