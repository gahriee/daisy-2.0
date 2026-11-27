import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";
import { getServerOperationalLimits } from "@/config/business-config";
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
  CreateProofUploadIntentSchema,
  type CreateProofUploadIntentInput,
  type ProofUploadIntentDto,
} from "./schemas";

const PROOF_INTENT_TTL_SECONDS = 300;
const PROOF_UPLOAD_RATE_LIMIT = { maximum: 30, seconds: 600 } as const;

export type VerifiedProofUpload = {
  intentId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
};

/**
 * Enforces a DB-backed per-Owner sliding window for proof upload intent & upload
 * calls using PostgreSQL server time.
 */
export async function consumeProofUploadLimit(
  ownerUserId: string,
): Promise<number> {
  const db = getDatabase();
  const key = `proof-upload:${ownerUserId}`;
  const { maximum, seconds } = PROOF_UPLOAD_RATE_LIMIT;

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

function readOwnerProofLimits(): {
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
} {
  const limits = getServerOperationalLimits();
  return {
    proofMaxBytes: limits.proofMaxBytes,
    proofMaxFilesPerRecord: limits.proofMaxFilesPerRecord,
  };
}

/**
 * Issues or reuses an Owner-scoped proof upload intent with a 300s presigned S3
 * PUT URL and same-origin proxy path. S3 signing stays outside DB transactions.
 */
export async function createProofUploadIntent(params: {
  ownerUserId: string;
  rawInput: CreateProofUploadIntentInput;
}): Promise<ProofUploadIntentDto> {
  const parsed = CreateProofUploadIntentSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check the selected proof file.",
    );
  }
  const input = parsed.data;
  const retryAfter = await consumeProofUploadLimit(params.ownerUserId);
  if (retryAfter > 0) {
    throw new RateLimitedError(
      retryAfter,
      "Too many proof upload requests. Wait briefly before trying again.",
    );
  }

  const limits = readOwnerProofLimits();
  if (input.byteSize > limits.proofMaxBytes) {
    const maxMb = Math.max(1, Math.round(limits.proofMaxBytes / (1024 * 1024)));
    throw new ValidationError(
      `Proof file exceeds the configured ${maxMb} MB limit.`,
    );
  }

  const db = getDatabase();
  if (input.deviceId) {
    const device = await db.device.findFirst({
      where: {
        id: input.deviceId,
        ownerUserId: params.ownerUserId,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!device) {
      throw new ValidationError("Associated device is missing or revoked.");
    }
  }

  const nowUtc = new Date();
  const expiresAt = new Date(
    nowUtc.getTime() + PROOF_INTENT_TTL_SECONDS * 1000,
  );

  let intentRecord: {
    id: string;
    objectKey: string;
    mimeType: string;
    declaredByteSize: number;
    reused: boolean;
  };

  if (input.opId && input.clientFileId) {
    const existing = await db.paymentProofIntent.findFirst({
      where: {
        ownerUserId: params.ownerUserId,
        opId: input.opId,
        clientFileId: input.clientFileId,
      },
      select: {
        id: true,
        objectKey: true,
        fileName: true,
        mimeType: true,
        declaredByteSize: true,
        sha256: true,
        status: true,
      },
    });

    if (existing) {
      if (
        existing.mimeType !== input.mimeType ||
        existing.declaredByteSize !== input.byteSize ||
        existing.sha256 !== input.sha256
      ) {
        throw new ConflictError(
          "Attachment identifier was reused with different file content.",
        );
      }
      if (existing.status === "ATTACHED") {
        throw new ConflictError(
          "This proof upload is already attached to a posted payment.",
        );
      }
      if (existing.status === "CANCELLED") {
        throw new ConflictError(
          "Cancelled proof upload intent cannot be reused.",
        );
      }

      await db.paymentProofIntent.update({
        where: { id: existing.id },
        data: { expiresAt },
      });

      intentRecord = {
        id: existing.id,
        objectKey: existing.objectKey,
        mimeType: existing.mimeType,
        declaredByteSize: existing.declaredByteSize,
        reused: true,
      };
    } else {
      intentRecord = await insertFreshIntent();
    }
  } else {
    intentRecord = await insertFreshIntent();
  }

  async function insertFreshIntent() {
    const intentId = randomUUID();
    const objectKey = `owners/${params.ownerUserId}/payments/proofs/${intentId}`;
    try {
      const created = await db.$transaction(async (tx) => {
        await ensureOwnerRecord(tx, params.ownerUserId);
        return tx.paymentProofIntent.create({
          data: {
            id: intentId,
            ownerUserId: params.ownerUserId,
            deviceId: input.deviceId ?? null,
            opId: input.opId ?? null,
            clientFileId: input.clientFileId ?? null,
            objectKey,
            fileName: input.fileName,
            mimeType: input.mimeType,
            declaredByteSize: input.byteSize,
            sha256: input.sha256,
            status: "PENDING_UPLOAD",
            expiresAt,
          },
          select: {
            id: true,
            objectKey: true,
            mimeType: true,
            declaredByteSize: true,
          },
        });
      });
      return { ...created, reused: false };
    } catch (error) {
      if (
        isPgConstraintError(
          error,
          "23505",
          "PaymentProofIntent_ownerUserId_opId_clientFileId_key",
        )
      ) {
        throw new ConflictError(
          "Concurrent proof intent conflict for this attachment. Retry.",
        );
      }
      throw error;
    }
  }

  const uploadUrl = await signPrivateUpload({
    key: intentRecord.objectKey,
    contentType: intentRecord.mimeType,
    contentLength: intentRecord.declaredByteSize,
    expiresInSeconds: PROOF_INTENT_TTL_SECONDS,
  });

  return {
    intentId: intentRecord.id,
    objectKey: intentRecord.objectKey,
    uploadUrl,
    proxyUploadPath: `/api/payments/proofs/intents/${intentRecord.id}`,
    expiresAt: expiresAt.toISOString(),
    maxBytes: limits.proofMaxBytes,
    reused: intentRecord.reused,
  };
}

/**
 * Validates size, SHA-256 checksum, and ownership before streaming a proof file
 * to Neon Object Storage outside any database transaction.
 */
export async function uploadProofIntentContent(params: {
  ownerUserId: string;
  intentId: string;
  contentType: string | null;
  bodyBytes: Uint8Array;
}): Promise<{ intentId: string; byteSize: number; sha256: string }> {
  const retryAfter = await consumeProofUploadLimit(params.ownerUserId);
  if (retryAfter > 0) {
    throw new RateLimitedError(
      retryAfter,
      "Too many proof uploads. Wait briefly before trying again.",
    );
  }

  const db = getDatabase();
  const intent = await db.paymentProofIntent.findFirst({
    where: {
      id: params.intentId,
      ownerUserId: params.ownerUserId,
    },
    select: {
      id: true,
      objectKey: true,
      mimeType: true,
      declaredByteSize: true,
      sha256: true,
      status: true,
      expiresAt: true,
    },
  });

  if (!intent) {
    throw new NotFoundError("Proof upload intent was not found.");
  }
  if (intent.status !== "PENDING_UPLOAD") {
    throw new ConflictError(
      "This proof upload intent can no longer accept bytes.",
    );
  }
  if (intent.expiresAt.getTime() < Date.now()) {
    throw new ConflictError(
      "Proof upload intent expired. Request a new upload intent and retry.",
    );
  }

  const normalizedMime = params.contentType
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (normalizedMime !== intent.mimeType) {
    throw new ValidationError("Uploaded content type does not match intent.");
  }

  const limits = readOwnerProofLimits();
  if (
    params.bodyBytes.byteLength === 0 ||
    params.bodyBytes.byteLength > limits.proofMaxBytes ||
    params.bodyBytes.byteLength !== intent.declaredByteSize
  ) {
    throw new ValidationError(
      "Uploaded proof byte size does not match the authorized limit or declared size.",
    );
  }

  const actualHash = createHash("sha256")
    .update(params.bodyBytes)
    .digest("hex");
  if (actualHash !== intent.sha256) {
    throw new ValidationError(
      "Uploaded proof checksum did not match expected SHA-256.",
    );
  }

  await putPrivateObject({
    key: intent.objectKey,
    contentType: intent.mimeType,
    body: params.bodyBytes,
  });

  return {
    intentId: intent.id,
    byteSize: params.bodyBytes.byteLength,
    sha256: actualHash,
  };
}

/**
 * Verifies every referenced proof upload intent in PostgreSQL + Neon Object
 * Storage strictly BEFORE entering the payment write transaction.
 */
export async function verifyProofIntentsOutsideTx(
  ownerUserId: string,
  proofIntentIds: string[],
  options?: { paymentId?: string },
): Promise<Map<string, VerifiedProofUpload>> {
  const result = new Map<string, VerifiedProofUpload>();
  if (proofIntentIds.length === 0) {
    return result;
  }

  const uniqueIds = Array.from(new Set(proofIntentIds));
  const limits = readOwnerProofLimits();
  if (uniqueIds.length > limits.proofMaxFilesPerRecord) {
    throw new ValidationError(
      `Attach at most ${limits.proofMaxFilesPerRecord} proof files per payment.`,
    );
  }

  const intents = await getDatabase().paymentProofIntent.findMany({
    where: {
      ownerUserId,
      id: { in: uniqueIds },
    },
    select: {
      id: true,
      objectKey: true,
      fileName: true,
      mimeType: true,
      declaredByteSize: true,
      verifiedByteSize: true,
      sha256: true,
      status: true,
      attachedPaymentId: true,
    },
  });

  if (intents.length !== uniqueIds.length) {
    throw new ValidationError(
      "One or more proof upload references were not found.",
    );
  }

  for (const intent of intents) {
    if (intent.status === "CANCELLED") {
      throw new ValidationError(
        "Cancelled proof upload cannot be attached to a payment.",
      );
    }
    if (intent.status === "ATTACHED") {
      if (
        options?.paymentId &&
        intent.attachedPaymentId === options.paymentId
      ) {
        result.set(intent.id, {
          intentId: intent.id,
          objectKey: intent.objectKey,
          fileName: intent.fileName,
          mimeType: intent.mimeType,
          byteSize: intent.verifiedByteSize ?? intent.declaredByteSize,
          sha256: intent.sha256,
        });
        continue;
      }
      throw new ConflictError(
        "A referenced proof file is already attached to another payment.",
      );
    }

    const head = await headPrivateObject(intent.objectKey);
    if (!head) {
      throw new ValidationError(
        "Proof file upload has not finished in storage yet. Retry after uploading.",
      );
    }
    if (
      head.contentLength <= 0 ||
      head.contentLength > limits.proofMaxBytes ||
      head.contentLength !== intent.declaredByteSize
    ) {
      throw new ValidationError(
        "Uploaded proof size in storage failed verification against declared size or Owner limit.",
      );
    }

    result.set(intent.id, {
      intentId: intent.id,
      objectKey: intent.objectKey,
      fileName: intent.fileName,
      mimeType: intent.mimeType,
      byteSize: head.contentLength,
      sha256: intent.sha256,
    });
  }

  return result;
}

/**
 * Authorizes Owner access to a PaymentProof record and mints a short-lived 60s
 * signed download URL.
 */
export async function getAuthorizedProofDownload(params: {
  ownerUserId: string;
  proofId: string;
}): Promise<{
  url: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}> {
  const proof = await getDatabase().paymentProof.findFirst({
    where: {
      id: params.proofId,
      ownerUserId: params.ownerUserId,
    },
    select: {
      id: true,
      objectKey: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
    },
  });

  if (!proof) {
    throw new NotFoundError("Payment proof was not found.");
  }

  const url = await signPrivateDownload(proof.objectKey);
  return {
    url,
    fileName: proof.fileName,
    mimeType: proof.mimeType,
    byteSize: proof.byteSize,
  };
}
