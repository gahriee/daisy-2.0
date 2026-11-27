import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  ensureTrustedDeviceVaultUnlocked,
  recordOnlineSessionAnchor,
} from "../../../src/offline/client";
import {
  assertOfflineUnlockWithinWindow,
  decryptBinaryBlob,
  decryptJsonPayload,
  encryptBinaryBlob,
  encryptJsonPayload,
  generateVaultPassphrase,
  initializeTrustedDeviceVaultKey,
  initializeVaultKeyMetadata,
  VaultKeyCustody,
  verifyAndUnlockVaultKey,
  verifyTrustedDeviceVaultKey,
} from "../../../src/offline/crypto";
import { DaisyOfflineDatabase } from "../../../src/offline/db";

describe("offline AES-GCM vault crypto and key custody", () => {
  it("initializes passphrase metadata, verifies passphrases, and encrypts JSON & binary blobs", async () => {
    const { metadata, key } = await initializeVaultKeyMetadata(
      "correct-horse-passphrase",
      10_000,
    );

    const unlocked = await verifyAndUnlockVaultKey(
      "correct-horse-passphrase",
      metadata,
    );
    expect(unlocked).toBeTruthy();

    await expect(
      verifyAndUnlockVaultKey("wrong-passphrase-123", metadata),
    ).rejects.toThrow(/Incorrect offline vault passphrase/i);

    const encJson = await encryptJsonPayload(key, {
      fullName: "Maria Cruz",
      balance: "1500.00",
    });
    expect(encJson.ciphertextB64).not.toContain("Maria");
    const decJson = await decryptJsonPayload<{
      fullName: string;
      balance: string;
    }>(unlocked, encJson);
    expect(decJson).toEqual({ fullName: "Maria Cruz", balance: "1500.00" });

    const rawBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const encBlob = await encryptBinaryBlob(key, rawBytes, "image/jpeg");
    const decBlob = await decryptBinaryBlob(unlocked, encBlob);
    expect(decBlob.mimeType).toBe("image/jpeg");
    expect(Array.from(decBlob.bytes)).toEqual([1, 2, 3, 4, 5]);
  });

  it("enforces in-memory inactivity auto-lock and offline unlock window bounds", async () => {
    const { key } = await initializeVaultKeyMetadata("vault-pass-1234", 10_000);
    const custody = new VaultKeyCustody(5000);
    const t0 = 1_763_200_000_000;

    custody.setUnlockedKey(key, t0);
    expect(custody.isUnlocked(t0 + 4000)).toBe(true);
    expect(custody.getKey(t0 + 4500)).toBe(key); // refreshes activity window
    expect(custody.isUnlocked(t0 + 10_000)).toBe(false);
    expect(() => custody.getKey(t0 + 10_000)).toThrow(/locked/i);

    // Offline window bounds + backward clock skew guard
    assertOfflineUnlockWithinWindow({
      lastOnlineAuthAtMs: t0,
      offlineUnlockMaxDays: 7,
      nowMs: t0 + 3 * 24 * 60 * 60 * 1000,
    });

    expect(() =>
      assertOfflineUnlockWithinWindow({
        lastOnlineAuthAtMs: t0,
        offlineUnlockMaxDays: 7,
        nowMs: t0 + 8 * 24 * 60 * 60 * 1000,
      }),
    ).toThrow(/expired/i);

    expect(() =>
      assertOfflineUnlockWithinWindow({
        lastOnlineAuthAtMs: t0,
        offlineUnlockMaxDays: 7,
        nowMs: t0 - 5 * 60 * 1000,
      }),
    ).toThrow(/clock/i);
  });

  it("generates distinct high-entropy vault passphrases accepted by key derivation", async () => {
    const first = generateVaultPassphrase();
    const second = generateVaultPassphrase();
    expect(first).toMatch(/^[A-Za-z0-9]{5}(-[A-Za-z0-9]{5}){3}$/);
    expect(second).toMatch(/^[A-Za-z0-9]{5}(-[A-Za-z0-9]{5}){3}$/);
    expect(first).not.toBe(second);

    const { metadata } = await initializeVaultKeyMetadata(first, 10_000);
    const unlocked = await verifyAndUnlockVaultKey(first, metadata);
    expect(unlocked).toBeTruthy();
  });

  it("initializes and verifies a non-extractable trusted-device AES-GCM key", async () => {
    const { metadata, key } = await initializeTrustedDeviceVaultKey();
    expect(metadata.mode).toBe("trusted_device");
    expect(key.extractable).toBe(false);

    const verified = await verifyTrustedDeviceVaultKey(metadata);
    expect(verified).toBe(key);

    const enc = await encryptJsonPayload(verified, { tenant: "Lola Rosa" });
    const dec = await decryptJsonPayload<{ tenant: string }>(verified, enc);
    expect(dec).toEqual({ tenant: "Lola Rosa" });
  });

  it("auto-unlocks passwordlessly on trusted devices and blocks untrusted, revoked, or expired sessions", async () => {
    const db = new DaisyOfflineDatabase({
      name: `daisy-trusted-test-${crypto.randomUUID()}`,
      indexedDB,
      IDBKeyRange,
    });
    const custody = new VaultKeyCustody(60_000);
    const t0 = 1_763_200_000_000;

    try {
      // Untrusted browser is refused
      await recordOnlineSessionAnchor(db, {
        ownerUserId: "owner",
        deviceId: null,
        nowMs: t0,
      });
      const untrusted = await ensureTrustedDeviceVaultUnlocked({
        db,
        custody,
        isOnline: true,
        nowMs: t0,
      });
      expect(untrusted.status).toBe("untrusted_device");
      expect(custody.isUnlocked(t0)).toBe(false);

      // Trusted browser online auto-initializes and unlocks without a password
      await recordOnlineSessionAnchor(db, {
        ownerUserId: "owner",
        deviceId: "dev-trusted-1",
        offlineUnlockMaxDays: 7,
        nowMs: t0,
      });
      const initialized = await ensureTrustedDeviceVaultUnlocked({
        db,
        custody,
        isOnline: true,
        nowMs: t0,
      });
      expect(initialized).toEqual({
        status: "unlocked",
        initializedNew: true,
        deviceId: "dev-trusted-1",
      });
      expect(custody.isUnlocked(t0)).toBe(true);

      // Offline re-unlock after memory lock succeeds within offlineUnlockMaxDays
      custody.lock();
      const offlineUnlock = await ensureTrustedDeviceVaultUnlocked({
        db,
        custody,
        isOnline: false,
        nowMs: t0 + 2 * 24 * 60 * 60 * 1000,
      });
      expect(offlineUnlock.status).toBe("unlocked");
      expect(custody.isUnlocked(t0 + 2 * 24 * 60 * 60 * 1000)).toBe(true);

      // Offline after window expiry is refused
      custody.lock();
      const expired = await ensureTrustedDeviceVaultUnlocked({
        db,
        custody,
        isOnline: false,
        nowMs: t0 + 9 * 24 * 60 * 60 * 1000,
      });
      expect(expired.status).toBe("expired");
      expect(custody.isUnlocked(t0 + 9 * 24 * 60 * 60 * 1000)).toBe(false);

      // Revoking the device clears cached deviceId and locks out auto-unlock
      await recordOnlineSessionAnchor(db, {
        ownerUserId: "owner",
        deviceId: null,
        nowMs: t0 + 10_000,
      });
      const revoked = await ensureTrustedDeviceVaultUnlocked({
        db,
        custody,
        isOnline: true,
        nowMs: t0 + 10_000,
      });
      expect(revoked.status).toBe("untrusted_device");
      expect(custody.isUnlocked(t0 + 10_000)).toBe(false);
    } finally {
      await db.delete();
    }
  });
});
