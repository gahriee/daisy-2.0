import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  ConflictError,
  NotFoundError,
  PreconditionError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";
import { getDatabase } from "@/server/db/client";
import { ensureOwnerRecord } from "@/server/db/owner-record";
import { isPgConstraintError } from "@/server/db/pg-errors";
import {
  getPrivateObject,
  headPrivateObject,
  putPrivateObject,
  signPrivateUpload,
} from "@/server/storage/client";
import {
  CreateRoomPhotoIntentSchema,
  RoomPhotoManifestSchema,
  type CreateRoomPhotoIntentInput,
  type RoomPhotoAllowedMimeType,
  type RoomPhotoDto,
  type RoomPhotoIntentDto,
  type RoomPhotoManifestInput,
  type RoomPhotoManifestItem,
  type RoomPhotoRole,
} from "./schemas";

const DEFAULT_MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_INTENT_TTL_SECONDS = 300;
const PHOTO_UPLOAD_RATE_LIMIT = { maximum: 400, seconds: 600 } as const;
const PHOTO_HEAD_CHECK_CONCURRENCY = 8;

export const roomPhotoSelect = {
  id: true,
  roomId: true,
  role: true,
  caption: true,
  sortOrder: true,
  fileName: true,
  mimeType: true,
  byteSize: true,
  updatedAt: true,
} as const;

export type RoomPhotoRow = {
  id: string;
  roomId: string;
  role: RoomPhotoRole;
  caption: string | null;
  sortOrder: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  updatedAt: Date;
};

export type VerifiedRoomPhotoIntent = {
  intentId: string;
  objectKey: string;
  fileName: string;
  mimeType: RoomPhotoAllowedMimeType;
  byteSize: number;
  sha256: string;
};

export type VerifiedRoomPhotoPlan = {
  preview: RoomPhotoManifestItem | null;
  gallery: RoomPhotoManifestItem[];
  intentsById: Map<string, VerifiedRoomPhotoIntent>;
};

/**
 * Verifies the leading file signature bytes against the declared image MIME type.
 */
export function validateRoomImageSignature(
  mimeType: RoomPhotoAllowedMimeType,
  bytes: Uint8Array,
): boolean {
  if (mimeType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
}

export function splitRoomPhotoDtos(
  rows: ReadonlyArray<RoomPhotoRow>,
  options?: { publicRoute?: boolean },
): {
  previewPhoto: RoomPhotoDto | null;
  galleryPhotos: RoomPhotoDto[];
} {
  const basePath = options?.publicRoute
    ? "/api/public/room-photos"
    : "/api/rooms/photos";

  const toDto = (row: RoomPhotoRow): RoomPhotoDto => ({
    id: row.id,
    roomId: row.roomId,
    role: row.role,
    caption: row.caption,
    sortOrder: row.sortOrder,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    url: `${basePath}/${row.id}?v=${row.updatedAt.getTime()}`,
  });

  const sorted = [...rows].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.updatedAt.getTime() - b.updatedAt.getTime() ||
      a.id.localeCompare(b.id),
  );

  const previewRow = sorted.find((row) => row.role === "PREVIEW") ?? null;
  const galleryPhotos = sorted
    .filter((row) => row.role === "GALLERY")
    .map(toDto);

  return {
    previewPhoto: previewRow ? toDto(previewRow) : null,
    galleryPhotos,
  };
}

/**
 * Enforces a DB-backed per-Owner sliding window for room photo intent and
 * upload relay requests using PostgreSQL server time.
 */
export async function consumeRoomPhotoUploadLimit(
  ownerUserId: string,
): Promise<number> {
  const db = getDatabase();
  const key = `room-photo-upload:${ownerUserId}`;
  const { maximum, seconds } = PHOTO_UPLOAD_RATE_LIMIT;

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

async function readOwnerRoomPhotoMaxBytes(
  ownerUserId: string,
): Promise<number> {
  const settings = await getDatabase().businessSettings.findUnique({
    where: { ownerUserId },
    select: { proofMaxBytes: true },
  });
  return settings?.proofMaxBytes ?? DEFAULT_MAX_PHOTO_BYTES;
}

/**
 * Registers an Owner-scoped room photo upload intent outside DB transactions.
 */
export async function createRoomPhotoIntent(params: {
  ownerUserId: string;
  rawInput: CreateRoomPhotoIntentInput;
}): Promise<RoomPhotoIntentDto> {
  const parsed = CreateRoomPhotoIntentSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check the selected room image.",
    );
  }
  const input = parsed.data;

  const retryAfter = await consumeRoomPhotoUploadLimit(params.ownerUserId);
  if (retryAfter > 0) {
    throw new RateLimitedError(
      retryAfter,
      "Too many photo upload requests. Wait briefly before trying again.",
    );
  }

  const maxBytes = await readOwnerRoomPhotoMaxBytes(params.ownerUserId);
  if (input.byteSize > maxBytes) {
    const maxMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    throw new ValidationError(
      `Room photo exceeds the configured ${maxMb} MB limit.`,
    );
  }

  const db = getDatabase();
  if (input.roomId) {
    const room = await db.room.findFirst({
      where: { id: input.roomId, ownerUserId: params.ownerUserId },
      select: { id: true, building: true },
    });
    if (!room) {
      throw new NotFoundError("The selected room was not found.");
    }
    if (room.building !== "TRANSIENT") {
      throw new PreconditionError(
        "Only Transient Building rooms support public room photos.",
      );
    }
  }

  const intentId = randomUUID();
  const safeOwnerSegment = params.ownerUserId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext =
    input.mimeType === "image/png"
      ? "png"
      : input.mimeType === "image/webp"
        ? "webp"
        : "jpg";
  const objectKey = `rooms/${safeOwnerSegment}/${input.roomId ?? "new"}/${intentId}.${ext}`;
  const expiresAt = new Date(Date.now() + PHOTO_INTENT_TTL_SECONDS * 1000);

  await ensureOwnerRecord(db, params.ownerUserId);
  await signPrivateUpload({
    key: objectKey,
    contentType: input.mimeType,
    contentLength: input.byteSize,
    expiresInSeconds: PHOTO_INTENT_TTL_SECONDS,
  }).catch(() => undefined);

  try {
    await db.roomPhotoIntent.create({
      data: {
        id: intentId,
        ownerUserId: params.ownerUserId,
        roomId: input.roomId ?? null,
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
        "Photo upload intent conflicted concurrently. Retry selecting the image.",
      );
    }
    throw error;
  }

  return {
    intentId,
    objectKey,
    status: "PENDING_UPLOAD",
    uploadMode: "relay",
    uploadUrl: `/api/rooms/photos/intents/${intentId}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Validates size, SHA-256 checksum, image magic bytes, and ownership before
 * uploading room image bytes into private Neon storage.
 */
export async function uploadRoomPhotoThroughProxy(params: {
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
  const retryAfter = await consumeRoomPhotoUploadLimit(params.ownerUserId);
  if (retryAfter > 0) {
    throw new RateLimitedError(
      retryAfter,
      "Too many photo upload attempts. Wait briefly before retrying.",
    );
  }

  const db = getDatabase();
  const intent = await db.roomPhotoIntent.findFirst({
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
    throw new NotFoundError("Room photo upload intent was not found.");
  }
  if (intent.status !== "PENDING_UPLOAD") {
    throw new ConflictError("This photo upload intent is already finalized.");
  }
  if (intent.expiresAt.getTime() < Date.now()) {
    throw new ConflictError(
      "Photo upload intent expired. Select the image again.",
    );
  }
  if (params.contentType && params.contentType !== intent.mimeType) {
    throw new ValidationError(
      "Uploaded image MIME type does not match the registered intent.",
    );
  }
  if (params.bytes.byteLength !== intent.byteSize) {
    throw new ValidationError(
      "Uploaded image size does not match the registered intent.",
    );
  }
  const actualSha = createHash("sha256").update(params.bytes).digest("hex");
  if (actualSha !== intent.sha256) {
    throw new ValidationError(
      "Uploaded image checksum does not match the selected file.",
    );
  }
  if (
    !validateRoomImageSignature(
      intent.mimeType as RoomPhotoAllowedMimeType,
      params.bytes,
    )
  ) {
    throw new ValidationError(
      "The selected file content does not match a valid JPEG, PNG, or WebP image.",
    );
  }

  await putPrivateObject({
    key: intent.objectKey,
    contentType: intent.mimeType,
    body: params.bytes,
  });

  const now = new Date();
  await db.roomPhotoIntent.update({
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
 * Verifies a room photo manifest and all uploaded intent objects via `HEAD`
 * requests outside database transactions.
 */
export async function verifyRoomPhotoManifestForWrite(params: {
  ownerUserId: string;
  roomId: string | null;
  manifest: RoomPhotoManifestInput | undefined;
}): Promise<VerifiedRoomPhotoPlan | null> {
  if (params.manifest === undefined) {
    return null;
  }

  const parsed = RoomPhotoManifestSchema.safeParse(params.manifest);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Check the selected room photos.",
    );
  }
  const manifest = parsed.data;
  const allItems = [
    ...(manifest.preview ? [manifest.preview] : []),
    ...manifest.gallery,
  ];

  const seenExisting = new Set<string>();
  const seenIntents = new Set<string>();
  for (const item of allItems) {
    if (item.kind === "existing") {
      if (!params.roomId) {
        throw new ValidationError(
          "New rooms cannot reuse existing saved photos from another room.",
        );
      }
      if (seenExisting.has(item.photoId)) {
        throw new ValidationError("Duplicate saved photo reference detected.");
      }
      seenExisting.add(item.photoId);
    } else {
      if (seenIntents.has(item.intentId)) {
        throw new ValidationError(
          "Each uploaded photo can only be attached once.",
        );
      }
      seenIntents.add(item.intentId);
    }
  }

  const intentsById = new Map<string, VerifiedRoomPhotoIntent>();
  const intentIds = [...seenIntents];
  if (intentIds.length > 0) {
    const db = getDatabase();
    const maxBytes = await readOwnerRoomPhotoMaxBytes(params.ownerUserId);
    const intents = await db.roomPhotoIntent.findMany({
      where: { ownerUserId: params.ownerUserId, id: { in: intentIds } },
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
        "One or more uploaded room photos were not found.",
      );
    }

    for (const intent of intents) {
      if (intent.status !== "PENDING_UPLOAD") {
        throw new ConflictError(
          `Photo ${intent.fileName} is already attached to a room.`,
        );
      }
      if (intent.byteSize > maxBytes) {
        throw new ValidationError(
          `Photo ${intent.fileName} exceeds the configured upload limit.`,
        );
      }
      if (intent.uploadedAt === null) {
        throw new ValidationError(
          `Photo ${intent.fileName} has not finished uploading yet.`,
        );
      }
    }

    for (
      let offset = 0;
      offset < intents.length;
      offset += PHOTO_HEAD_CHECK_CONCURRENCY
    ) {
      const batch = intents.slice(
        offset,
        offset + PHOTO_HEAD_CHECK_CONCURRENCY,
      );
      await Promise.all(
        batch.map(async (intent) => {
          const head = await headPrivateObject(intent.objectKey);
          if (!head || head.contentLength !== intent.byteSize) {
            throw new ValidationError(
              `Photo ${intent.fileName} could not be verified in storage.`,
            );
          }
          intentsById.set(intent.id, {
            intentId: intent.id,
            objectKey: intent.objectKey,
            fileName: intent.fileName,
            mimeType: intent.mimeType as RoomPhotoAllowedMimeType,
            byteSize: intent.byteSize,
            sha256: intent.sha256,
          });
        }),
      );
    }
  }

  return {
    preview: manifest.preview,
    gallery: manifest.gallery,
    intentsById,
  };
}

/**
 * Applies a pre-verified room photo manifest inside the room mutation transaction.
 */
export async function applyVerifiedRoomPhotoPlanInTx(
  tx: Prisma.TransactionClient,
  params: {
    ownerUserId: string;
    roomId: string;
    plan: VerifiedRoomPhotoPlan | null;
  },
): Promise<{ changed: boolean }> {
  if (!params.plan) {
    return { changed: false };
  }

  const existingRows = await tx.roomPhoto.findMany({
    where: { ownerUserId: params.ownerUserId, roomId: params.roomId },
    select: {
      id: true,
      role: true,
      caption: true,
      sortOrder: true,
    },
  });
  const existingById = new Map(existingRows.map((row) => [row.id, row]));

  const currentPreview =
    existingRows.find((row) => row.role === "PREVIEW") ?? null;
  if (params.plan.preview?.kind === "existing") {
    const match = existingById.get(params.plan.preview.photoId);
    if (!match || match.role !== "PREVIEW") {
      throw new NotFoundError(
        "The saved preview image could not be found on this room.",
      );
    }
  }

  for (const item of params.plan.gallery) {
    if (item.kind === "existing") {
      const match = existingById.get(item.photoId);
      if (!match || match.role !== "GALLERY") {
        throw new NotFoundError(
          "One or more saved gallery shots could not be found on this room.",
        );
      }
    }
  }

  let changed = false;

  async function claimAndCreatePhoto(
    intentId: string,
    role: RoomPhotoRole,
    sortOrder: number,
    caption: string | null,
  ) {
    const verified = params.plan!.intentsById.get(intentId);
    if (!verified) {
      throw new NotFoundError("Uploaded room photo could not be verified.");
    }
    const claimed = await tx.roomPhotoIntent.updateMany({
      where: {
        id: verified.intentId,
        ownerUserId: params.ownerUserId,
        status: "PENDING_UPLOAD",
      },
      data: {
        status: "ATTACHED",
        roomId: params.roomId,
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictError(
        `Photo ${verified.fileName} was already attached elsewhere. Upload it again.`,
      );
    }

    await tx.roomPhoto.create({
      data: {
        ownerUserId: params.ownerUserId,
        roomId: params.roomId,
        intentId: verified.intentId,
        objectKey: verified.objectKey,
        role,
        caption,
        sortOrder,
        fileName: verified.fileName,
        mimeType: verified.mimeType,
        byteSize: verified.byteSize,
        sha256: verified.sha256,
      },
      select: { id: true },
    });
  }

  if (params.plan.preview === null) {
    if (currentPreview) {
      await tx.roomPhoto.deleteMany({
        where: {
          ownerUserId: params.ownerUserId,
          roomId: params.roomId,
          id: currentPreview.id,
        },
      });
      changed = true;
    }
  } else if (params.plan.preview.kind === "intent") {
    if (currentPreview) {
      await tx.roomPhoto.deleteMany({
        where: {
          ownerUserId: params.ownerUserId,
          roomId: params.roomId,
          id: currentPreview.id,
        },
      });
    }
    await claimAndCreatePhoto(params.plan.preview.intentId, "PREVIEW", 0, null);
    changed = true;
  }

  const keptGalleryIds = new Set(
    params.plan.gallery
      .filter((item) => item.kind === "existing")
      .map((item) => item.photoId),
  );
  const removedGalleryIds = existingRows
    .filter((row) => row.role === "GALLERY" && !keptGalleryIds.has(row.id))
    .map((row) => row.id);

  if (removedGalleryIds.length > 0) {
    await tx.roomPhoto.deleteMany({
      where: {
        ownerUserId: params.ownerUserId,
        roomId: params.roomId,
        id: { in: removedGalleryIds },
      },
    });
    changed = true;
  }

  for (const [index, item] of params.plan.gallery.entries()) {
    const caption = item.caption ?? null;
    if (item.kind === "existing") {
      const prev = existingById.get(item.photoId)!;
      if (prev.sortOrder !== index || (prev.caption ?? null) !== caption) {
        await tx.roomPhoto.update({
          where: { id: prev.id },
          data: { sortOrder: index, caption },
          select: { id: true },
        });
        changed = true;
      }
    } else {
      await claimAndCreatePhoto(item.intentId, "GALLERY", index, caption);
      changed = true;
    }
  }

  return { changed };
}

/**
 * Fetches bytes for an Owner-authorized room photo (including unpublished rooms).
 */
export async function getAuthorizedRoomPhotoBytes(
  ownerUserId: string,
  photoId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; fileName: string }> {
  const row = await getDatabase().roomPhoto.findFirst({
    where: { id: photoId, ownerUserId },
    select: { objectKey: true, mimeType: true, fileName: true },
  });
  if (!row) {
    throw new NotFoundError("Room photo was not found.");
  }
  const object = await getPrivateObject(row.objectKey);
  if (!object) {
    throw new NotFoundError("Room photo file is missing from storage.");
  }
  return {
    bytes: object.bytes,
    mimeType: row.mimeType,
    fileName: row.fileName,
  };
}

/**
 * Fetches bytes for a publicly visible published transient room photo
 * (returning 404 for unpublished, archived, or unconfigured rooms).
 */
export async function getPublicRoomPhotoBytes(
  ownerUserId: string,
  photoId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; updatedAt: Date }> {
  const row = await getDatabase().roomPhoto.findFirst({
    where: {
      id: photoId,
      ownerUserId,
      room: {
        ownerUserId,
        archivedAt: null,
        isTransientPublished: true,
      },
    },
    select: {
      objectKey: true,
      mimeType: true,
      updatedAt: true,
    },
  });
  if (!row) {
    throw new NotFoundError("Public room photo was not found.");
  }
  const object = await getPrivateObject(row.objectKey);
  if (!object) {
    throw new NotFoundError("Public room photo is unavailable.");
  }
  return {
    bytes: object.bytes,
    mimeType: row.mimeType,
    updatedAt: row.updatedAt,
  };
}
