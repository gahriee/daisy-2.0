import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { validateRoomImageSignature } from "@/features/rooms/photos";
import type { RoomPhotoAllowedMimeType } from "@/features/rooms/schemas";
import {
  ConflictError,
  NotFoundError,
  PreconditionError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";
import { getDatabase } from "@/server/db/client";
import {
  ensureOwnerRecord,
  type DatabaseExecutor,
} from "@/server/db/owner-record";
import { isPgConstraintError } from "@/server/db/pg-errors";
import {
  getPrivateObject,
  headPrivateObject,
  putPrivateObject,
} from "@/server/storage/client";
import {
  allocateSyncSequence,
  appendChangeFeed,
  writeAuditEntry,
} from "@/server/sync/publish";
import {
  ArchiveTenantContractSchema,
  CreateTenantContractIntentSchema,
  CreateTenantContractSchema,
  type ArchiveTenantContractInput,
  type ContractAllowedMimeType,
  type ContractScanModeValue,
  type CreateTenantContractInput,
  type CreateTenantContractIntentInput,
  type TenantContractDto,
  type TenantContractIntentDto,
  type TenantContractPageDto,
} from "./schemas";

const CONTRACT_INTENT_TTL_SECONDS = 900;
const CONTRACT_UPLOAD_RATE_LIMIT = { maximum: 40, seconds: 600 } as const;

export const tenantContractSelect = {
  id: true,
  tenantId: true,
  assignmentId: true,
  assignment: {
    select: {
      room: { select: { number: true } },
    },
  },
  version: true,
  title: true,
  signedDateManila: true,
  notes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  pages: {
    orderBy: [{ pageOrder: "asc" as const }],
    select: {
      id: true,
      contractId: true,
      pageOrder: true,
      filterMode: true,
      label: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      createdAt: true,
    },
  },
} satisfies Prisma.TenantContractSelect;

export type TenantContractRow = {
  id: string;
  tenantId: string;
  assignmentId: string | null;
  assignment: { room: { number: string } } | null;
  version: number;
  title: string;
  signedDateManila: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pages: Array<{
    id: string;
    contractId: string;
    pageOrder: number;
    filterMode: ContractScanModeValue;
    label: string | null;
    fileName: string;
    mimeType: string;
    byteSize: number;
    createdAt: Date;
  }>;
};

export function toTenantContractDto(row: TenantContractRow): TenantContractDto {
  const pages: TenantContractPageDto[] = row.pages.map((page) => ({
    id: page.id,
    contractId: page.contractId,
    pageOrder: page.pageOrder,
    filterMode: page.filterMode,
    label: page.label,
    fileName: page.fileName,
    mimeType: page.mimeType,
    byteSize: page.byteSize,
    url: `/api/tenants/contracts/pages/${page.id}`,
    createdAt: page.createdAt.toISOString(),
  }));

  return {
    id: row.id,
    tenantId: row.tenantId,
    assignmentId: row.assignmentId,
    assignmentRoomNumber: row.assignment?.room.number ?? null,
    version: row.version,
    title: row.title,
    signedDateManila: row.signedDateManila,
    notes: row.notes,
    pageCount: pages.length,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    pages,
  };
}

/**
 * Verifies leading magic bytes for contract uploads (JPEG, PNG, WebP, or PDF).
 */
export function validateContractFileSignature(
  mimeType: ContractAllowedMimeType,
  bytes: Uint8Array,
): boolean {
  if (mimeType === "application/pdf") {
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    );
  }
  return validateRoomImageSignature(
    mimeType as RoomPhotoAllowedMimeType,
    bytes,
  );
}

/**
 * Enforces a DB-backed per-Owner sliding window for tenant contract upload intents and relays.
 */
export async function consumeTenantContractUploadLimit(
  ownerUserId: string,
): Promise<number> {
  const db = getDatabase();
  const key = `tenant-contract-upload:${ownerUserId}`;
  const { maximum, seconds } = CONTRACT_UPLOAD_RATE_LIMIT;

  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "SecurityRateLimit"
      WHERE "key" = ${key} AND "resetsAt" <= CURRENT_TIMESTAMP
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
  if (!row) throw new Error("Upload rate limit unavailable.");
  return row.count > maximum ? row.retry : 0;
}

/**
 * Registers an Owner-scoped contract upload intent outside database transactions.
 */
export async function createTenantContractIntent(params: {
  ownerUserId: string;
  rawInput: CreateTenantContractIntentInput;
}): Promise<TenantContractIntentDto> {
  const parsed = CreateTenantContractIntentSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check the selected contract file.",
    );
  }
  const input = parsed.data;

  const retryAfter = await consumeTenantContractUploadLimit(params.ownerUserId);
  if (retryAfter > 0) {
    throw new RateLimitedError(
      retryAfter,
      "Too many contract upload requests. Wait briefly before retrying.",
    );
  }

  const db = getDatabase();
  const tenant = await db.tenant.findFirst({
    where: { id: input.tenantId, ownerUserId: params.ownerUserId },
    select: { id: true, archivedAt: true },
  });
  if (!tenant) {
    throw new NotFoundError("The requested tenant was not found.");
  }
  if (tenant.archivedAt !== null) {
    throw new PreconditionError(
      "Restore this archived tenant before adding a signed contract.",
    );
  }

  const intentId = randomUUID();
  const safeOwnerSegment = params.ownerUserId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext =
    input.mimeType === "application/pdf"
      ? "pdf"
      : input.mimeType === "image/png"
        ? "png"
        : input.mimeType === "image/webp"
          ? "webp"
          : "jpg";
  const objectKey = `tenants/${safeOwnerSegment}/contracts/${tenant.id}/${intentId}.${ext}`;
  const expiresAt = new Date(Date.now() + CONTRACT_INTENT_TTL_SECONDS * 1000);

  await ensureOwnerRecord(db, params.ownerUserId);

  try {
    await db.tenantContractIntent.create({
      data: {
        id: intentId,
        ownerUserId: params.ownerUserId,
        tenantId: tenant.id,
        objectKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        sha256: input.sha256,
        status: "PENDING_UPLOAD",
        expiresAt,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isPgConstraintError(error, "23505")) {
      throw new ConflictError(
        "Contract upload intent conflicted. Try uploading the page again.",
      );
    }
    throw error;
  }

  return {
    intentId,
    objectKey,
    status: "PENDING_UPLOAD",
    uploadUrl: `/api/tenants/contracts/intents/${intentId}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Validates size, SHA-256 digest, MIME type, and file magic bytes outside DB
 * transactions, stores private bytes, and stamps `uploadedAt`.
 */
export async function uploadTenantContractThroughProxy(params: {
  ownerUserId: string;
  intentId: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<{
  intentId: string;
  byteSize: number;
  sha256: string;
  uploadedAt: string;
}> {
  const retryAfter = await consumeTenantContractUploadLimit(params.ownerUserId);
  if (retryAfter > 0) {
    throw new RateLimitedError(
      retryAfter,
      "Too many contract upload attempts. Wait briefly before retrying.",
    );
  }

  const db = getDatabase();
  const intent = await db.tenantContractIntent.findFirst({
    where: { id: params.intentId, ownerUserId: params.ownerUserId },
    select: {
      id: true,
      objectKey: true,
      mimeType: true,
      byteSize: true,
      sha256: true,
      status: true,
      expiresAt: true,
    },
  });
  if (!intent) {
    throw new NotFoundError("Contract upload intent was not found.");
  }
  if (intent.status !== "PENDING_UPLOAD") {
    throw new ConflictError("This contract page upload is already finalized.");
  }
  if (intent.expiresAt.getTime() < Date.now()) {
    throw new ConflictError(
      "Contract upload intent expired. Re-upload the page before saving.",
    );
  }

  const declaredContentType = params.contentType.split(";")[0]?.trim() ?? "";
  if (declaredContentType && declaredContentType !== intent.mimeType) {
    throw new ValidationError(
      "Uploaded file MIME type does not match the registered intent.",
    );
  }
  if (params.bytes.byteLength !== intent.byteSize) {
    throw new ValidationError(
      "Uploaded file byte size does not match the registered intent.",
    );
  }

  const expectedMime = intent.mimeType as ContractAllowedMimeType;
  if (!validateContractFileSignature(expectedMime, params.bytes)) {
    throw new ValidationError(
      "Uploaded contract file contents do not match a valid JPEG, PNG, WebP, or PDF signature.",
    );
  }

  const actualSha = createHash("sha256").update(params.bytes).digest("hex");
  if (actualSha !== intent.sha256) {
    throw new ValidationError(
      "Uploaded file checksum does not match the registered contract page.",
    );
  }

  await putPrivateObject({
    key: intent.objectKey,
    contentType: intent.mimeType,
    body: params.bytes,
  });

  const now = new Date();
  await db.tenantContractIntent.update({
    where: { id: intent.id },
    data: { uploadedAt: now },
    select: { id: true },
  });

  return {
    intentId: intent.id,
    byteSize: intent.byteSize,
    sha256: intent.sha256,
    uploadedAt: now.toISOString(),
  };
}

type VerifiedContractPage = {
  intentId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  filterMode: ContractScanModeValue;
  label: string | null;
};

async function verifyUploadedContractPagesOutsideTx(
  ownerUserId: string,
  tenantId: string,
  pages: Array<{
    intentId: string;
    filterMode: ContractScanModeValue;
    label: string | null;
  }>,
): Promise<VerifiedContractPage[]> {
  const db = getDatabase();
  const intentIds = pages.map((page) => page.intentId);
  const intents = await db.tenantContractIntent.findMany({
    where: {
      ownerUserId,
      tenantId,
      id: { in: intentIds },
    },
    select: {
      id: true,
      objectKey: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      sha256: true,
      status: true,
      uploadedAt: true,
    },
  });

  const intentById = new Map(intents.map((row) => [row.id, row]));
  const verified: VerifiedContractPage[] = [];

  for (const page of pages) {
    const intent = intentById.get(page.intentId);
    if (!intent) {
      throw new NotFoundError(
        "One or more uploaded contract pages could not be found for this tenant.",
      );
    }
    if (intent.status !== "PENDING_UPLOAD") {
      throw new ConflictError(
        `Contract page ${intent.fileName} is already attached to a contract.`,
      );
    }
    if (!intent.uploadedAt) {
      throw new PreconditionError(
        `Contract page ${intent.fileName} has not finished uploading yet.`,
      );
    }

    const head = await headPrivateObject(intent.objectKey);
    if (
      !head ||
      (head.contentLength !== undefined &&
        head.contentLength !== intent.byteSize)
    ) {
      throw new PreconditionError(
        `Contract page ${intent.fileName} is missing from storage. Upload it again.`,
      );
    }

    verified.push({
      intentId: intent.id,
      objectKey: intent.objectKey,
      fileName: intent.fileName,
      mimeType: intent.mimeType,
      byteSize: intent.byteSize,
      sha256: intent.sha256,
      filterMode: page.filterMode,
      label: page.label,
    });
  }

  return verified;
}

/**
 * Persists a private signed tenant contract along with its ordered scanned
 * pages/PDFs, locks SyncHead, writes an identifier-only audit entry, and emits
 * a ChangeFeed record.
 */
export async function createTenantContract(
  ownerUserId: string,
  rawInput: CreateTenantContractInput,
): Promise<TenantContractDto> {
  const parsed = CreateTenantContractSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ??
        "Check contract details and attached pages before saving.",
    );
  }
  const input = parsed.data;

  const verifiedPages = await verifyUploadedContractPagesOutsideTx(
    ownerUserId,
    input.tenantId,
    input.pages,
  );

  const db = getDatabase();
  return db.$transaction(async (tx) => {
    await ensureOwnerRecord(tx, ownerUserId);

    const tenantRows = await tx.$queryRaw<
      Array<{ id: string; archivedAt: Date | null }>
    >`
      SELECT "id", "archivedAt"
      FROM "Tenant"
      WHERE "id" = ${input.tenantId}::uuid
        AND "ownerUserId" = ${ownerUserId}
      FOR UPDATE
    `;
    const tenant = tenantRows[0];
    if (!tenant) {
      throw new NotFoundError("The requested tenant was not found.");
    }
    if (tenant.archivedAt !== null) {
      throw new PreconditionError(
        "Restore this archived tenant before adding a signed contract.",
      );
    }

    if (input.assignmentId) {
      const assignment = await tx.tenantAssignment.findFirst({
        where: {
          id: input.assignmentId,
          ownerUserId,
          tenantId: tenant.id,
        },
        select: { id: true },
      });
      if (!assignment) {
        throw new NotFoundError(
          "Selected stay assignment was not found for this tenant.",
        );
      }
    }

    const contract = await tx.tenantContract.create({
      data: {
        ownerUserId,
        tenantId: tenant.id,
        assignmentId: input.assignmentId,
        version: 1,
        title: input.title,
        signedDateManila: input.signedDateManila,
        notes: input.notes,
      },
      select: { id: true },
    });

    for (const [index, page] of verifiedPages.entries()) {
      const claimed = await tx.tenantContractIntent.updateMany({
        where: {
          id: page.intentId,
          ownerUserId,
          tenantId: tenant.id,
          status: "PENDING_UPLOAD",
          uploadedAt: { not: null },
        },
        data: {
          status: "ATTACHED",
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictError(
          `Contract page ${page.fileName} is no longer available to attach.`,
        );
      }

      await tx.tenantContractPage.create({
        data: {
          ownerUserId,
          contractId: contract.id,
          intentId: page.intentId,
          objectKey: page.objectKey,
          pageOrder: index + 1,
          filterMode: page.filterMode,
          label: page.label,
          fileName: page.fileName,
          mimeType: page.mimeType,
          byteSize: page.byteSize,
          sha256: page.sha256,
        },
        select: { id: true },
      });
    }

    const saved = await tx.tenantContract.findUniqueOrThrow({
      where: { id: contract.id },
      select: tenantContractSelect,
    });
    const dto = toTenantContractDto(saved);

    const sequence = await allocateSyncSequence(tx, ownerUserId);
    await writeAuditEntry(tx, {
      ownerUserId,
      sequence,
      area: "tenants",
      action: "tenant_contract.created",
      actorType: "owner",
      actorId: ownerUserId,
      entityType: "tenant_contract",
      entityId: dto.id,
      metadata: {
        tenantId: dto.tenantId,
        assignmentId: dto.assignmentId,
        pageCount: dto.pageCount,
      },
    });
    await appendChangeFeed(tx, {
      ownerUserId,
      sequence,
      entityType: "tenant_contract",
      entityId: dto.id,
      version: dto.version,
      operation: "upsert",
      payload: dto,
    });

    return dto;
  });
}

/**
 * Soft-archives a signed contract on a tenant profile with optimistic concurrency,
 * identifier-only audit trail, and ChangeFeed tombstone.
 */
export async function archiveTenantContract(
  ownerUserId: string,
  rawInput: ArchiveTenantContractInput,
): Promise<TenantContractDto> {
  const parsed = ArchiveTenantContractSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid contract archive request.",
    );
  }
  const input = parsed.data;

  const db = getDatabase();
  return db.$transaction(async (tx) => {
    const existing = await tx.tenantContract.findFirst({
      where: {
        id: input.contractId,
        ownerUserId,
        tenantId: input.tenantId,
      },
      select: { id: true, version: true, archivedAt: true },
    });
    if (!existing) {
      throw new NotFoundError("The requested signed contract was not found.");
    }
    if (existing.archivedAt !== null) {
      throw new ConflictError("This signed contract is already archived.");
    }
    if (existing.version !== input.expectedVersion) {
      throw new ConflictError(
        "This signed contract changed elsewhere. Reload and try again.",
      );
    }

    const now = new Date();
    const updated = await tx.tenantContract.updateMany({
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
    if (updated.count !== 1) {
      throw new ConflictError(
        "This signed contract changed elsewhere. Reload and try again.",
      );
    }

    const saved = await tx.tenantContract.findUniqueOrThrow({
      where: { id: existing.id },
      select: tenantContractSelect,
    });
    const dto = toTenantContractDto(saved);

    const sequence = await allocateSyncSequence(tx, ownerUserId);
    await writeAuditEntry(tx, {
      ownerUserId,
      sequence,
      area: "tenants",
      action: "tenant_contract.archived",
      actorType: "owner",
      actorId: ownerUserId,
      entityType: "tenant_contract",
      entityId: dto.id,
      metadata: {
        tenantId: dto.tenantId,
        version: dto.version,
      },
    });
    await appendChangeFeed(tx, {
      ownerUserId,
      sequence,
      entityType: "tenant_contract",
      entityId: dto.id,
      version: dto.version,
      operation: "tombstone",
      payload: dto,
    });

    return dto;
  });
}

export async function listTenantContractsForTenant(
  db: DatabaseExecutor,
  ownerUserId: string,
  tenantId: string,
): Promise<TenantContractDto[]> {
  const rows = await db.tenantContract.findMany({
    where: { ownerUserId, tenantId },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }],
    select: tenantContractSelect,
  });
  return rows.map(toTenantContractDto);
}

export async function getTenantContractDetail(
  ownerUserId: string,
  tenantId: string,
  contractId: string,
): Promise<TenantContractDto | null> {
  const row = await getDatabase().tenantContract.findFirst({
    where: { id: contractId, ownerUserId, tenantId },
    select: tenantContractSelect,
  });
  return row ? toTenantContractDto(row) : null;
}

/**
 * Returns private bytes for an Owner-authorized contract page or PDF for
 * authenticated workspace previews.
 */
export async function getAuthorizedTenantContractPageBytes(
  ownerUserId: string,
  pageId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; fileName: string }> {
  const row = await getDatabase().tenantContractPage.findFirst({
    where: { id: pageId, ownerUserId },
    select: { objectKey: true, mimeType: true, fileName: true },
  });
  if (!row) {
    throw new NotFoundError("Signed contract page was not found.");
  }

  const object = await getPrivateObject(row.objectKey);
  if (!object) {
    throw new NotFoundError(
      "Signed contract page file is missing from storage.",
    );
  }

  return {
    bytes: object.bytes,
    mimeType: row.mimeType,
    fileName: row.fileName,
  };
}
