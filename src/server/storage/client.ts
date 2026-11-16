import "server-only";
import {
  S3Client,
  HeadBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

export const ASSETS_BUCKET = "assets";

export function getStorage(): S3Client {
  const result = z
    .object({
      AWS_ENDPOINT_URL_S3: z.url().startsWith("https://"),
      AWS_REGION: z.string().min(1),
      AWS_ACCESS_KEY_ID: z.string().min(1),
      AWS_SECRET_ACCESS_KEY: z.string().min(1),
    })
    .safeParse(process.env);
  if (!result.success)
    throw new Error("Configure branch-scoped Neon storage credentials.");
  return new S3Client({
    endpoint: result.data.AWS_ENDPOINT_URL_S3,
    region: result.data.AWS_REGION,
    credentials: {
      accessKeyId: result.data.AWS_ACCESS_KEY_ID,
      secretAccessKey: result.data.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
}

export async function checkStorage(): Promise<void> {
  const storage = getStorage();
  try {
    await storage.send(new HeadBucketCommand({ Bucket: ASSETS_BUCKET }));
  } finally {
    storage.destroy();
  }
}

// Internal primitive: callers must authorize the owning record before signing its key.
// No public file endpoint is exposed until attachment ownership is implemented.
export async function signPrivateDownload(key: string): Promise<string> {
  const storage = getStorage();
  try {
    return await getSignedUrl(
      storage,
      new GetObjectCommand({ Bucket: ASSETS_BUCKET, Key: key }),
      { expiresIn: 60 },
    );
  } finally {
    storage.destroy();
  }
}

export async function signPrivateUpload(params: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
}): Promise<string> {
  const storage = getStorage();
  try {
    return await getSignedUrl(
      storage,
      new PutObjectCommand({
        Bucket: ASSETS_BUCKET,
        Key: params.key,
        ContentType: params.contentType,
        ContentLength: params.contentLength,
      }),
      { expiresIn: params.expiresInSeconds ?? 300 },
    );
  } finally {
    storage.destroy();
  }
}

export async function putPrivateObject(params: {
  key: string;
  contentType: string;
  body: Uint8Array;
}): Promise<{ byteSize: number }> {
  const storage = getStorage();
  try {
    await storage.send(
      new PutObjectCommand({
        Bucket: ASSETS_BUCKET,
        Key: params.key,
        ContentType: params.contentType,
        ContentLength: params.body.byteLength,
        Body: params.body,
      }),
    );
    return { byteSize: params.body.byteLength };
  } finally {
    storage.destroy();
  }
}

function isS3NotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    record.$metadata?.httpStatusCode === 404 ||
    record.name === "NotFound" ||
    record.name === "NoSuchKey" ||
    record.Code === "NotFound" ||
    record.Code === "NoSuchKey"
  );
}

export async function headPrivateObject(
  key: string,
): Promise<{ contentLength: number; contentType: string | null } | null> {
  const storage = getStorage();
  try {
    const res = await storage.send(
      new HeadObjectCommand({ Bucket: ASSETS_BUCKET, Key: key }),
    );
    return {
      contentLength: Number(res.ContentLength ?? 0),
      contentType: res.ContentType ?? null,
    };
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return null;
    }
    throw error;
  } finally {
    storage.destroy();
  }
}

export async function getPrivateObject(
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  const storage = getStorage();
  try {
    const res = await storage.send(
      new GetObjectCommand({ Bucket: ASSETS_BUCKET, Key: key }),
    );
    if (!res.Body) {
      return null;
    }
    const bytes = await res.Body.transformToByteArray();
    return {
      bytes,
      contentType: res.ContentType ?? null,
    };
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return null;
    }
    throw error;
  } finally {
    storage.destroy();
  }
}

export async function deletePrivateObject(key: string): Promise<boolean> {
  const storage = getStorage();
  try {
    await storage.send(
      new DeleteObjectCommand({ Bucket: ASSETS_BUCKET, Key: key }),
    );
    return true;
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return false;
    }
    throw error;
  } finally {
    storage.destroy();
  }
}
