import { encryptBinaryBlob, sha256Hex } from "./crypto";
import type {
  AttachmentRecord,
  DaisyOfflineDatabase,
  OfflineAttachmentKind,
} from "./db";

export const OFFLINE_DEFAULT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const OFFLINE_DEFAULT_PROOF_MAX_FILES = 5;
export const OFFLINE_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export type QueuedAttachmentInput = {
  attachmentId: string;
  clientFileId: string;
  kind: OfflineAttachmentKind;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

/**
 * Validates attachment count/size/MIME limits and computes content digest
 * prior to encrypting and storing into the IndexedDB outbox.
 */
export async function prepareQueuedAttachments(input: {
  kind: OfflineAttachmentKind;
  files: Array<{
    attachmentId: string;
    clientFileId: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }>;
  maxBytes?: number;
  maxFiles?: number;
}): Promise<
  Array<
    QueuedAttachmentInput & {
      intentEndpoint: string;
      sha256: string;
    }
  >
> {
  const maxBytes = input.maxBytes ?? OFFLINE_DEFAULT_PROOF_MAX_BYTES;
  const maxFiles = input.maxFiles ?? OFFLINE_DEFAULT_PROOF_MAX_FILES;

  if (input.files.length > maxFiles) {
    throw new Error(`Attach at most ${maxFiles} files per record.`);
  }

  const intentEndpoint =
    input.kind === "payment_proof"
      ? "/api/payments/proofs/intent"
      : "/api/maintenance/attachments/intent";

  return Promise.all(
    input.files.map(async (file) => {
      if (
        !OFFLINE_ATTACHMENT_ALLOWED_MIME_TYPES.includes(
          file.mimeType as (typeof OFFLINE_ATTACHMENT_ALLOWED_MIME_TYPES)[number],
        )
      ) {
        throw new Error(`Unsupported attachment file type: ${file.mimeType}`);
      }
      if (file.bytes.byteLength <= 0 || file.bytes.byteLength > maxBytes) {
        throw new Error(
          `${file.fileName} exceeds the ${(maxBytes / (1024 * 1024)).toFixed(1)} MB limit.`,
        );
      }
      const digest = await sha256Hex(file.bytes);
      return {
        attachmentId: file.attachmentId,
        clientFileId: file.clientFileId,
        kind: input.kind,
        intentEndpoint,
        fileName: file.fileName,
        mimeType: file.mimeType,
        bytes: file.bytes,
        sha256: digest,
      };
    }),
  );
}

/**
 * Encrypts binary bytes cleanly via AES-GCM for queued IndexedDB persistence.
 */
export async function encryptQueuedAttachmentBytes(
  key: CryptoKey,
  bytes: Uint8Array,
  mimeType: string,
) {
  return encryptBinaryBlob(key, bytes, mimeType);
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Uploads any un-uploaded encrypted attachments belonging to an operation,
 * reusing `(opId, clientFileId)` upload intents and renewing expired presigned
 * URLs while retaining encrypted local blobs until the operation is accepted.
 */
export async function uploadQueuedAttachmentsForOp(input: {
  db: DaisyOfflineDatabase;
  key: CryptoKey;
  opId: string;
  fetchFn?: FetchLike;
}): Promise<string[]> {
  const fetchFn = input.fetchFn ?? fetch;
  const rows = await input.db.attachments
    .where("opId")
    .equals(input.opId)
    .toArray();

  if (rows.length === 0) {
    return [];
  }

  const intentIds: string[] = [];

  for (const row of rows) {
    if (row.status === "uploaded" && row.intentId) {
      intentIds.push(row.intentId);
      continue;
    }

    const intentRes = await fetchFn(row.intentEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        opId: row.opId,
        clientFileId: row.clientFileId,
        fileName: row.fileName,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        sha256: row.sha256,
      }),
    });

    if (!intentRes.ok) {
      throw new Error(
        `Could not prepare upload intent for ${row.fileName} (${intentRes.status}).`,
      );
    }

    const intentBody = (await intentRes.json()) as {
      intentId: string;
      uploadUrl: string | null;
      alreadyUploaded?: boolean;
    };

    let intentId = intentBody.intentId;

    if (!intentBody.alreadyUploaded && intentBody.uploadUrl) {
      const { decryptBinaryBlob } = await import("./crypto");
      const { bytes, mimeType } = await decryptBinaryBlob(
        input.key,
        row.encryptedBytes,
      );

      const arrayBuf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;

      let putRes = await fetchFn(intentBody.uploadUrl, {
        method: "PUT",
        headers: { "content-type": mimeType },
        body: new Blob([arrayBuf], { type: mimeType }),
      });

      // Expired presigned URL: renew intent cleanly and retry PUT once using same (opId, clientFileId).
      if (putRes.status === 403) {
        const renewRes = await fetchFn(row.intentEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            opId: row.opId,
            clientFileId: row.clientFileId,
            fileName: row.fileName,
            mimeType: row.mimeType,
            byteSize: row.byteSize,
            sha256: row.sha256,
          }),
        });
        if (!renewRes.ok) {
          throw new Error(`Could not renew upload URL for ${row.fileName}.`);
        }
        const renewed = (await renewRes.json()) as {
          intentId: string;
          uploadUrl: string | null;
        };
        intentId = renewed.intentId;
        if (renewed.uploadUrl) {
          putRes = await fetchFn(renewed.uploadUrl, {
            method: "PUT",
            headers: { "content-type": mimeType },
            body: new Blob([arrayBuf], { type: mimeType }),
          });
        }
      }

      if (!putRes.ok) {
        await input.db.attachments.update(row.attachmentId, {
          status: "failed",
          intentId,
          updatedAt: new Date().toISOString(),
        });
        throw new Error(
          `Upload failed for ${row.fileName} (${putRes.status}). Local encrypted file kept.`,
        );
      }
    }

    await input.db.attachments.update(row.attachmentId, {
      status: "uploaded",
      intentId,
      updatedAt: new Date().toISOString(),
    } satisfies Partial<AttachmentRecord>);

    intentIds.push(intentId);
  }

  return intentIds;
}

