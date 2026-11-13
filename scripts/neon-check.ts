import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import {
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

config({ path: ".env.local", quiet: true });

async function main(): Promise<void> {
  const { getStorage, signPrivateDownload, ASSETS_BUCKET } =
    await import("../src/server/storage/client");
  const storage = getStorage();
  const key = `__verification/${randomUUID()}.txt`;
  const body = "Daisy Neon storage connectivity probe";
  let attemptedUpload = false;
  try {
    const authUrl = process.env.NEON_AUTH_BASE_URL;
    if (!authUrl) throw new Error("Auth URL missing");
    const session = await fetch(`${authUrl.replace(/\/$/, "")}/get-session`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!session.ok) throw new Error("Auth session endpoint unavailable");
    const value: unknown = await session.json();
    if (value && typeof value === "object" && "user" in value && value.user)
      throw new Error("Unexpected anonymous session");
    console.log(
      "PASS Neon Auth: live session endpoint responds to anonymous request",
    );

    attemptedUpload = true;
    await storage.send(
      new PutObjectCommand({
        Bucket: ASSETS_BUCKET,
        Key: key,
        Body: body,
        ContentType: "text/plain",
      }),
    );
    const signed = await signPrivateDownload(key);
    const downloaded = await fetch(signed, {
      signal: AbortSignal.timeout(15000),
    });
    if (!downloaded.ok || (await downloaded.text()) !== body)
      throw new Error("Storage round trip failed");
    const unsigned = new URL(signed);
    unsigned.search = "";
    const anonymous = await fetch(unsigned, {
      signal: AbortSignal.timeout(15000),
    });
    if (![401, 403].includes(anonymous.status))
      throw new Error("Private object was not denied to anonymous access");
    console.log(
      "PASS Object Storage: upload, signed download, exact content, anonymous access denied",
    );
  } finally {
    try {
      if (attemptedUpload) {
        await storage.send(
          new DeleteObjectCommand({ Bucket: ASSETS_BUCKET, Key: key }),
        );
        let removed = false;
        try {
          await storage.send(
            new HeadObjectCommand({ Bucket: ASSETS_BUCKET, Key: key }),
          );
        } catch (error) {
          if (
            error instanceof Error &&
            "name" in error &&
            ["NotFound", "NoSuchKey"].includes(error.name)
          )
            removed = true;
        }
        if (!removed) throw new Error("Probe cleanup could not be verified");
        console.log(
          "PASS Object Storage: temporary probe removed; absence verified",
        );
      }
    } finally {
      storage.destroy();
    }
  }
}

main().catch(() => {
  console.error(
    "FAIL Neon service check. Check branch credentials, provider availability and probe cleanup.",
  );
  process.exitCode = 1;
});
