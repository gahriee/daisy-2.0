import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";
import { getDatabase } from "@/server/db/client";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import { isPgConstraintError } from "@/server/db/pg-errors";
import {
  headPrivateObject,
  putPrivateObject,
  signPrivateDownload,
  signPrivateUpload,
} from "@/server/storage/client";
import {
  CreateMaintenanceAttachmentIntentSchema,
  type CreateMaintenanceAttachmentIntentInput,
  type MaintenanceAttachmentIntentDto,
} from "./schemas";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES_PER_RECORD = 5;
const ATTACHMENT_INTENT_TTL_SECONDS = 300;
const ATTACHMENT_UPLOAD_RATE_LIMIT = { maximum: 30, seconds: 600 } as const;

export type VerifiedMaintenanceAttachment = {
  intentId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
};

/**
 * Enforces a DB-backed per-Owner sliding window for maintenance attachment
 * intent and upload relay calls using PostgreSQL server time.
 */
export async function consumeMaintenanceUploadLimit(
  ownerUserId: string,
): Promise<number> {
  const db = getDatabase();
  const key = `maintenance-upload:${ownerUserId}`;
  const { maximum, seconds } = ATTACHMENT_UPLOAD_RATE_LIMIT;

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

async function readOwnerAttachmentLimits(ownerUserId: string): Promise<{
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
}> {
  const settings = await getDatabase().businessSettings.findUnique({
    where: { ownerUserId },
    select: { proofMaxBytes: true, proofMaxFilesPerRecord: true },
  });
  return {
    proofMaxBytes: settings?.proofMaxBytes ?? DEFAULT_MAX_BYTES,
    proofMaxFilesPerRecord:
      settings?.proofMaxFilesPerRecord ?? DEFAULT_MAX_FILES_PER_RECORD,
  };
}

/**
 * Issues or reuses an Owner-scoped maintenance attachment intent bound optionally
 * to (opId, clientFileId) for offline queue stability.
 */
export async function createMaintenanceAttachmentIntent(params: {
  ownerUserId: string;
  rawInput: CreateMaintenanceAttachmentIntentInput;
}): Promise<MaintenanceAttachmentIntentDto> {
  const parsed = CreateMaintenanceAttachmentIntentSchema.safeParse(
    params.rawInput,
  );
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check the selected attachment.",
    );
  }
  const input = parsed.data;
  const retryAfter = await consumeMaintenanceUploadLimit(params.ownerUserId);
  if (retryAfter > 0) {
    throw new RateLimitedError(
      retryAfter,
      "Too many attachment upload requests. Wait briefly before trying again.",
    );
  }

  const limits = await readOwnerAttachmentLimits(params.ownerUserId);
  if (input.byteSize > limits.proofMaxBytes) {
    const maxMb = Math.max(1, Math.round(limits.proofMaxBytes / (1024 * 1024)));
    throw new ValidationError(
      `Attachment file exceeds the configured ${maxMb} MB limit.`,
    );
  }

  const db = getDatabase();
  const safeOwnerSegment = params.ownerUserId.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (input.opId && input.clientFileId) {
    const existing = await db.maintenanceAttachmentIntent.findFirst({
      where: {
        ownerUserId: params.ownerUserId,
        opId: input.opId,
        clientFileId: input.clientFileId,
      },
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
    if (existing) {
      if (
        existing.sha256 !== input.sha256 ||
        existing.byteSize !== input.byteSize ||
        existing.mimeType !== input.mimeType
      ) {
        throw new ConflictError(
          "Attachment intent key was reused with different file metadata.",
        );
      }
      const nextExpiry = new Date(
        Date.now() + ATTACHMENT_INTENT_TTL_SECONDS * 1000,
      );
      if (existing.status === "PENDING_UPLOAD") {
        await db.maintenanceAttachmentIntent.update({
          where: { id: existing.id },
          data: { expiresAt: nextExpiry },
          select: { id: true },
        });
      }
      await signPrivateUpload({
        key: existing.objectKey,
        contentType: input.mimeType,
        contentLength: existing.byteSize,
        expiresInSeconds: ATTACHMENT_INTENT_TTL_SECONDS,
      }).catch(() => undefined);

      return {
        intentId: existing.id,
        objectKey: existing.objectKey,
        status: existing.status,
        uploadMode: "relay",
        uploadUrl: `/api/maintenance/attachments/intents/${existing.id}`,
        expiresAt: nextExpiry.toISOString(),
        reused: true,
      };
    }
  }

  const intentId = randomUUID();
  const ext =
    input.mimeType === "application/pdf"
      ? "pdf"
      : input.mimeType === "image/png"
        ? "png"
        : input.mimeType === "image/webp"
          ? "webp"
          : input.mimeType === "image/heic"
            ? "heic"
            : "jpg";
  const objectKey = `maintenance/${safeOwnerSegment}/${input.opId ?? intentId}/${intentId}.${ext}`;
  const expiresAt = new Date(Date.now() + ATTACHMENT_INTENT_TTL_SECONDS * 1000);

  await ensureOwnerRecord(db, params.ownerUserId);

  try {
    await db.maintenanceAttachmentIntent.create({
      data: {
        id: intentId,
        ownerUserId: params.ownerUserId,
        opId: input.opId ?? null,
        clientFileId: input.clientFileId ?? null,
        maintenanceRequestId: input.maintenanceRequestId ?? null,
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
        "Attachment upload intent conflicted concurrently. Retry with the same key.",
      );
    }
    throw error;
  }

  return {
    intentId,
    objectKey,
    status: "PENDING_UPLOAD",
    uploadMode: "relay",
    uploadUrl: `/api/maintenance/attachments/intents/${intentId}`,
    expiresAt: expiresAt.toISOString(),
    reused: false,
  };
}

/**
 * Validates size, SHA-256 digest, and ownership outside database transactions,
 * uploads bytes into the private `assets` bucket, and stamps `uploadedAt`.
 */
export async function uploadMaintenanceAttachmentThroughProxy(params: {
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
  const retryAfter = await consumeMaintenanceUploadLimit(params.ownerUserId);
  if (retryAfter > 0) {
    throw new RateLimitedError(
      retryAfter,
      "Too many attachment upload attempts. Wait briefly before retrying.",
    );
  }

  const db = getDatabase();
  const intent = await db.maintenanceAttachmentIntent.findFirst({
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
    throw new NotFoundError("Attachment upload intent was not found.");
  }
  if (intent.status !== "PENDING_UPLOAD") {
    throw new ConflictError("This attachment intent is already finalized.");
  }
  if (intent.expiresAt.getTime() < Date.now()) {
    throw new ConflictError(
      "Attachment upload intent expired. Request a new upload intent.",
    );
  }
  if (params.contentType && params.contentType !== intent.mimeType) {
    throw new ValidationError(
      "Uploaded file MIME type does not match the intent.",
    );
  }
  if (params.bytes.byteLength !== intent.byteSize) {
    throw new ValidationError(
      "Uploaded file byte size does not match the registered intent.",
    );
  }
  const actualSha = createHash("sha256").update(params.bytes).digest("hex");
  if (actualSha !== intent.sha256) {
    throw new ValidationError(
      "Uploaded file SHA-256 checksum does not match the declared file.",
    );
  }

  await putPrivateObject({
    key: intent.objectKey,
    contentType: intent.mimeType,
    body: params.bytes,
  });

  const now = new Date();
  await db.maintenanceAttachmentIntent.update({
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

/**
 * Verifies attachment intents against S3 outside the database transaction so
 * request creation or updates never hold DB locks across network I/O.
 */
export async function verifyUploadedMaintenanceAttachments(
  ownerUserId: string,
  intentIds: string[],
  existingAttachmentCount = 0,
): Promise<VerifiedMaintenanceAttachment[]> {
  if (intentIds.length === 0) return [];

  const limits = await readOwnerAttachmentLimits(ownerUserId);
  if (
    existingAttachmentCount + intentIds.length >
    limits.proofMaxFilesPerRecord
  ) {
    throw new ValidationError(
      `Attachments per maintenance request are capped at ${limits.proofMaxFilesPerRecord} file(s).`,
    );
  }

  const db = getDatabase();
  const intents = await db.maintenanceAttachmentIntent.findMany({
    where: { ownerUserId, id: { in: intentIds } },
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

  if (intents.length !== intentIds.length) {
    throw new NotFoundError(
      "One or more selected attachment uploads were not found.",
    );
  }

  const verified: VerifiedMaintenanceAttachment[] = [];
  for (const intent of intents) {
    if (intent.status !== "PENDING_UPLOAD") {
      throw new ConflictError(
        `Attachment ${intent.fileName} is already linked to a record.`,
      );
    }
    if (intent.byteSize > limits.proofMaxBytes) {
      throw new ValidationError(
        `Attachment ${intent.fileName} exceeds the maximum allowed size.`,
      );
    }
    const head = await headPrivateObject(intent.objectKey);
    if (!head || head.contentLength !== intent.byteSize) {
      throw new ValidationError(
        `Attachment ${intent.fileName} has not finished uploading to storage.`,
      );
    }
    verified.push({
      intentId: intent.id,
      objectKey: intent.objectKey,
      fileName: intent.fileName,
      mimeType: intent.mimeType,
      byteSize: intent.byteSize,
      sha256: intent.sha256,
    });
  }

  return verified;
}

export async function getAuthorizedMaintenanceAttachmentDownload(
  ownerUserId: string,
  attachmentId: string,
): Promise<{
  url: string;
  fileName: string;
  mimeType: string;
  expiresInSeconds: number;
}> {
  const attachment = await getDatabase().maintenanceAttachment.findFirst({
    where: { id: attachmentId, ownerUserId },
    select: {
      objectKey: true,
      fileName: true,
      mimeType: true,
    },
  });
  if (!attachment) {
    throw new NotFoundError("Maintenance attachment was not found.");
  }

  const expiresInSeconds = 60;
  const url = await signPrivateDownload(attachment.objectKey);
  return {
    url,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    expiresInSeconds,
  };
}
