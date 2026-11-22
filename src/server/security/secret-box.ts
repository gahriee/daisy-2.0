import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { ServiceUnavailableError } from "@/lib/errors";

const SECRET_BOX_VERSION = "v1";
const SECRET_BOX_PURPOSE = "daisy:settings-secret-box:v1";
const IV_BYTES = 12;

/**
 * Derives a purpose-separated 256-bit AES-GCM key from the application signing
 * secret for encrypting Owner-configured integration secrets (such as the
 * Semaphore SMS API key) at rest in PostgreSQL.
 */
function deriveSecretBoxKey(
  environment: Record<string, string | undefined> = process.env,
): Buffer {
  const rawSecret =
    environment.SYNC_CURSOR_SECRET?.trim() ||
    environment.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!rawSecret) {
    throw new ServiceUnavailableError(
      "Application encryption secret is not configured.",
    );
  }
  return createHmac("sha256", SECRET_BOX_PURPOSE).update(rawSecret).digest();
}

export function encryptAppSecret(
  plaintext: string,
  environment: Record<string, string | undefined> = process.env,
): string {
  const key = deriveSecretBoxKey(environment);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    SECRET_BOX_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptAppSecret(
  encoded: string,
  environment: Record<string, string | undefined> = process.env,
): string {
  const parts = encoded.trim().split(".");
  if (parts.length !== 4 || parts[0] !== SECRET_BOX_VERSION) {
    throw new ServiceUnavailableError(
      "Stored API key format is invalid. Re-enter your API key in Settings.",
    );
  }
  const [, ivB64, tagB64, cipherB64] = parts;
  if (!ivB64 || !tagB64 || !cipherB64) {
    throw new ServiceUnavailableError(
      "Stored API key is incomplete. Re-enter your API key in Settings.",
    );
  }
  const key = deriveSecretBoxKey(environment);
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(cipherB64, "base64url")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new ServiceUnavailableError(
      "Stored API key could not be decrypted. Re-enter your API key in Settings.",
    );
  }
}

export function maskSecretLast4(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (trimmed.length <= 4) {
    return trimmed;
  }
  return trimmed.slice(-4);
}
