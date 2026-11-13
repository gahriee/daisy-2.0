import "server-only";
import {
  S3Client,
  HeadBucketCommand,
  GetObjectCommand,
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
