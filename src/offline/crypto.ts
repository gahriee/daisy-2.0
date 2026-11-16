/**
 * Browser/WebCrypto AES-GCM + PBKDF2 key custody for Daisy's offline vault.
 * Encryption keys remain strictly in memory and are never persisted to storage.
 */

export const VAULT_CRYPTO_VERSION = 1 as const;
export const DEFAULT_PBKDF2_ITERATIONS = 310_000;
export const DEFAULT_INACTIVITY_LOCK_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_OFFLINE_UNLOCK_DAYS = 30;
const VERIFIER_PLAINTEXT = "daisy-vault-verifier-v1";
const DAY_MS = 24 * 60 * 60 * 1000;

export type EncryptedPayloadRecord = {
  v: typeof VAULT_CRYPTO_VERSION;
  ivB64: string;
  ciphertextB64: string;
};

export type EncryptedBinaryRecord = {
  v: typeof VAULT_CRYPTO_VERSION;
  ivB64: string;
  ciphertext: ArrayBuffer;
  mimeType: string;
};

export type VaultKeyMetadata = {
  v: typeof VAULT_CRYPTO_VERSION;
  saltB64: string;
  iterations: number;
  verifier: EncryptedPayloadRecord;
};

function getWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API is unavailable in this environment.");
  }
  return globalThis.crypto;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await getWebCrypto().subtle.digest(
    "SHA-256",
    toArrayBuffer(bytes),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derives an in-memory, non-extractable AES-256-GCM CryptoKey from a passphrase and salt.
 */
export async function deriveVaultAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  if (passphrase.trim().length < 8) {
    throw new Error("Passphrase must be at least 8 characters.");
  }
  const cryptoApi = getWebCrypto();
  const encoder = new TextEncoder();
  const keyMaterial = await cryptoApi.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJsonPayload(
  key: CryptoKey,
  value: unknown,
): Promise<EncryptedPayloadRecord> {
  const cryptoApi = getWebCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encoded),
  );
  return {
    v: VAULT_CRYPTO_VERSION,
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptJsonPayload<T>(
  key: CryptoKey,
  record: EncryptedPayloadRecord,
): Promise<T> {
  const cryptoApi = getWebCrypto();
  const iv = base64ToBytes(record.ivB64);
  const ciphertext = base64ToBytes(record.ciphertextB64);
  const decrypted = await cryptoApi.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}

export async function encryptBinaryBlob(
  key: CryptoKey,
  bytes: Uint8Array,
  mimeType: string,
): Promise<EncryptedBinaryRecord> {
  const cryptoApi = getWebCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const ciphertext = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(bytes),
  );
  return {
    v: VAULT_CRYPTO_VERSION,
    ivB64: bytesToBase64(iv),
    ciphertext,
    mimeType,
  };
}

export async function decryptBinaryBlob(
  key: CryptoKey,
  record: EncryptedBinaryRecord,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const cryptoApi = getWebCrypto();
  const iv = base64ToBytes(record.ivB64);
  const decrypted = await cryptoApi.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    record.ciphertext,
  );
  return {
    bytes: new Uint8Array(decrypted),
    mimeType: record.mimeType,
  };
}

/**
 * Creates passphrase verifier metadata without persisting any raw key material.
 */
export async function initializeVaultKeyMetadata(
  passphrase: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<{ metadata: VaultKeyMetadata; key: CryptoKey }> {
  const cryptoApi = getWebCrypto();
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultAesKey(passphrase, salt, iterations);
  const verifier = await encryptJsonPayload(key, {
    check: VERIFIER_PLAINTEXT,
  });
  return {
    key,
    metadata: {
      v: VAULT_CRYPTO_VERSION,
      saltB64: bytesToBase64(salt),
      iterations,
      verifier,
    },
  };
}

/**
 * Verifies a passphrase against persisted salt & ciphertext verifier.
 */
export async function verifyAndUnlockVaultKey(
  passphrase: string,
  metadata: VaultKeyMetadata,
): Promise<CryptoKey> {
  const key = await deriveVaultAesKey(
    passphrase,
    base64ToBytes(metadata.saltB64),
    metadata.iterations,
  );
  let decoded: { check?: string };
  try {
    decoded = await decryptJsonPayload<{ check?: string }>(
      key,
      metadata.verifier,
    );
  } catch {
    throw new Error("Incorrect offline vault passphrase.");
  }
  if (decoded.check !== VERIFIER_PLAINTEXT) {
    throw new Error("Offline vault verifier check failed.");
  }
  return key;
}

/**
 * Validates that offline unlock stays strictly within the Owner's configured
 * online-sign-in window (`offlineUnlockMaxDays`), rejecting backward clock skew.
 */
export function assertOfflineUnlockWithinWindow(input: {
  lastOnlineAuthAtMs: number | null;
  offlineUnlockMaxDays: number;
  nowMs?: number;
}): void {
  if (!input.lastOnlineAuthAtMs) {
    throw new Error(
      "Online sign-in and initial snapshot are required before offline unlock.",
    );
  }
  const nowMs = input.nowMs ?? Date.now();
  if (nowMs < input.lastOnlineAuthAtMs - 60_000) {
    throw new Error(
      "Device clock appears earlier than your last online sign-in. Reconnect to verify your session.",
    );
  }
  const boundedDays = Math.min(
    Math.max(1, input.offlineUnlockMaxDays),
    MAX_OFFLINE_UNLOCK_DAYS,
  );
  const expiresAtMs = input.lastOnlineAuthAtMs + boundedDays * DAY_MS;
  if (nowMs > expiresAtMs) {
    throw new Error(
      `Offline unlock window (${boundedDays} days) expired. Sign in online to renew.`,
    );
  }
}

/**
 * Holds the unlocked CryptoKey strictly in memory with inactivity auto-lock.
 */
export class VaultKeyCustody {
  private key: CryptoKey | null = null;
  private lastActivityMs = 0;
  private readonly inactivityTimeoutMs: number;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  constructor(inactivityTimeoutMs: number = DEFAULT_INACTIVITY_LOCK_MS) {
    this.inactivityTimeoutMs = inactivityTimeoutMs;
  }

  private clearTimer() {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private armTimer() {
    this.clearTimer();
    if (this.inactivityTimeoutMs > 0) {
      this.timerId = setTimeout(() => {
        this.lock();
      }, this.inactivityTimeoutMs);
      if (
        typeof this.timerId === "object" &&
        this.timerId !== null &&
        "unref" in this.timerId &&
        typeof this.timerId.unref === "function"
      ) {
        this.timerId.unref();
      }
    }
  }

  setUnlockedKey(key: CryptoKey, nowMs: number = Date.now()): void {
    this.key = key;
    this.lastActivityMs = nowMs;
    this.armTimer();
  }

  getKey(nowMs: number = Date.now()): CryptoKey {
    if (!this.key) {
      throw new Error("Offline vault is locked. Enter passphrase to continue.");
    }
    if (
      this.inactivityTimeoutMs > 0 &&
      nowMs - this.lastActivityMs > this.inactivityTimeoutMs
    ) {
      this.lock();
      throw new Error(
        "Offline vault auto-locked after inactivity. Re-enter passphrase.",
      );
    }
    this.lastActivityMs = nowMs;
    this.armTimer();
    return this.key;
  }

  isUnlocked(nowMs: number = Date.now()): boolean {
    if (!this.key) return false;
    if (
      this.inactivityTimeoutMs > 0 &&
      nowMs - this.lastActivityMs > this.inactivityTimeoutMs
    ) {
      this.lock();
      return false;
    }
    return true;
  }

  lock(): void {
    this.key = null;
    this.lastActivityMs = 0;
    this.clearTimer();
  }
}

