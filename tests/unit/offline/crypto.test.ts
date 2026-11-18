import { describe, expect, it } from "vitest";
import {
  assertOfflineUnlockWithinWindow,
  decryptBinaryBlob,
  decryptJsonPayload,
  encryptBinaryBlob,
  encryptJsonPayload,
  generateVaultPassphrase,
  initializeVaultKeyMetadata,
  VaultKeyCustody,
  verifyAndUnlockVaultKey,
} from "../../../src/offline/crypto";

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
});
