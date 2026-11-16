import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import {
  decryptJsonPayload,
  initializeVaultKeyMetadata,
} from "../../../src/offline/crypto";
import {
  applySyncChangesAtomic,
  assertOfflineSchemaCompatible,
  DAISY_OFFLINE_SCHEMA_VERSION,
  DaisyOfflineDatabase,
  discardNeedsAttentionOperation,
  enqueueOfflineOperationAtomic,
  findLatestActiveEntityOutboxOpId,
  keepMineNeedsAttentionOperation,
  snapshotEntityKey,
} from "../../../src/offline/db";

let db: DaisyOfflineDatabase;
let key: CryptoKey;

beforeEach(async () => {
  db = new DaisyOfflineDatabase({
    name: `daisy-test-${randomUUID()}`,
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  const init = await initializeVaultKeyMetadata("test-passphrase-123", 10_000);
  key = init.key;
});

afterEach(async () => {
  await db.delete();
});

describe("Dexie offline vault atomicity, projections, and conflict resolution", () => {
  it("commits outbox, attachments, and projections atomically and leaves no phantom data on quota failure", async () => {
    const deviceId = randomUUID();
    const tenantId = randomUUID();
    const opId = randomUUID();

    await enqueueOfflineOperationAtomic(db, key, {
      opId,
      deviceId,
      type: "payment.record",
      entityId: tenantId,
      baseVersion: 0,
      payload: { amount: "1500.00" },
      projectionPayload: { amount: "1500.00", status: "Pending" },
      attachments: [
        {
          attachmentId: randomUUID(),
          clientFileId: "file-1",
          kind: "payment_proof",
          intentEndpoint: "/api/payments/proofs/intent",
          fileName: "proof.jpg",
          mimeType: "image/jpeg",
          bytes: new Uint8Array([9, 8, 7]),
          sha256: "abc",
        },
      ],
    });

    expect(await db.outbox.count()).toBe(1);
    expect(await db.attachments.count()).toBe(1);
    expect(await db.projections.count()).toBe(1);

    // Simulate IndexedDB QuotaExceededError mid-commit -> full rollback
    const putSpy = vi
      .spyOn(db.projections, "put")
      .mockRejectedValueOnce(
        new DOMException("Quota exceeded", "QuotaExceededError"),
      );

    const failOpId = randomUUID();
    await expect(
      enqueueOfflineOperationAtomic(db, key, {
        opId: failOpId,
        deviceId,
        type: "tenant.create",
        entityId: randomUUID(),
        baseVersion: 0,
        payload: { fullName: "Quota Fail", phone: "09170001111" },
        projectionPayload: { fullName: "Quota Fail" },
      }),
    ).rejects.toThrow(/Quota exceeded/);

    putSpy.mockRestore();
    expect(await db.outbox.get(failOpId)).toBeUndefined();
    expect(await db.outbox.count()).toBe(1);
  });

  it("applies server deltas + tombstones while preserving pending local intents, and resolves Needs attention via Keep mine or Discard", async () => {
    const deviceId = randomUUID();
    const t1 = randomUUID();
    const opConflictId = randomUUID();

    // Queue offline edit, then simulate server advancing version to 2
    await enqueueOfflineOperationAtomic(db, key, {
      opId: opConflictId,
      deviceId,
      type: "tenant.update",
      entityId: t1,
      baseVersion: 1,
      payload: { fullName: "Local Offline Edit", phone: "09170002222" },
      projectionPayload: {
        fullName: "Local Offline Edit",
        phone: "09170002222",
      },
    });

    await db.outbox.update(opConflictId, {
      status: "conflict",
      reason: "Version mismatch",
    });

    await applySyncChangesAtomic(db, key, {
      changes: [
        {
          sequence: "5",
          entityType: "tenant",
          entityId: t1,
          version: 2,
          operation: "upsert",
          payload: { id: t1, fullName: "Server Name v2", phone: "09171110000" },
          occurredAt: "2026-11-16T06:00:00.000Z",
        },
        {
          sequence: "6",
          entityType: "tenant",
          entityId: randomUUID(),
          version: 3,
          operation: "tombstone",
          payload: { archivedAt: "2026-11-16T06:01:00.000Z" },
          occurredAt: "2026-11-16T06:01:00.000Z",
        },
      ],
      nextSyncCursor: "cursor-v6",
      watermark: "6",
    });

    const syncMeta = await db.vaultMeta.get("sync");
    expect(syncMeta?.key === "sync" && syncMeta.syncCursor).toBe("cursor-v6");
    expect(await db.outbox.get(opConflictId)).toBeTruthy();

    // Keep mine issues a fresh opId bound to confirmed server version 2
    const keepOpId = randomUUID();
    const kept = await keepMineNeedsAttentionOperation(db, key, {
      supersededOpId: opConflictId,
      newOpId: keepOpId,
    });
    expect(kept.outbox.opId).toBe(keepOpId);
    expect(kept.outbox.baseVersion).toBe(2);
    expect(await db.outbox.get(opConflictId)).toBeUndefined();

    // Discard restores confirmed server snapshot projection
    await discardNeedsAttentionOperation(db, key, keepOpId);
    expect(await db.outbox.count()).toBe(0);
    const proj = await db.projections.get(snapshotEntityKey("tenant", t1));
    expect(proj?.isPendingLocal).toBe(false);
    const decoded = await decryptJsonPayload<{ fullName: string }>(
      key,
      proj!.encryptedPayload,
    );
    expect(decoded.fullName).toBe("Server Name v2");
  });

  it("blocks incompatible newer schemas when unsynced outbox items remain", async () => {
    await db.vaultMeta.put({
      key: "sync",
      schemaVersion: DAISY_OFFLINE_SCHEMA_VERSION + 1,
      watermark: "1",
      syncCursor: "c1",
      lastSyncedAt: null,
      nextLocalSequence: 2,
      rebootstrapRequired: false,
    });
    await enqueueOfflineOperationAtomic(db, key, {
      opId: randomUUID(),
      deviceId: randomUUID(),
      type: "tenant.create",
      entityId: randomUUID(),
      baseVersion: 0,
      payload: { fullName: "Pending", phone: "09170000001" },
    });
    // Force schemaVersion back up as enqueue wrote current version
    await db.vaultMeta.put({
      key: "sync",
      schemaVersion: DAISY_OFFLINE_SCHEMA_VERSION + 1,
      watermark: "1",
      syncCursor: "c1",
      lastSyncedAt: null,
      nextLocalSequence: 3,
      rebootstrapRequired: false,
    });

    await expect(assertOfflineSchemaCompatible(db)).rejects.toThrow(
      /newer than this app/,
    );
  });

  it("chains active outbox dependency lookup and preserves optimistic archive/restore state during rebasing", async () => {
    const deviceId = randomUUID();
    const tenantId = randomUUID();
    const createOpId = randomUUID();
    const archiveOpId = randomUUID();

    await enqueueOfflineOperationAtomic(db, key, {
      opId: createOpId,
      deviceId,
      type: "tenant.create",
      entityId: tenantId,
      baseVersion: 0,
      payload: { fullName: "Ana Reyes", phone: "09170003333" },
      projectionPayload: {
        id: tenantId,
        fullName: "Ana Reyes",
        phone: "09170003333",
        archivedAt: null,
      },
    });

    const pred = await findLatestActiveEntityOutboxOpId(db, "tenant", tenantId);
    expect(pred).toBe(createOpId);

    const archiveAt = "2026-11-16T08:15:00.000Z";
    await enqueueOfflineOperationAtomic(db, key, {
      opId: archiveOpId,
      deviceId,
      type: "tenant.archive",
      entityId: tenantId,
      baseVersion: 1,
      dependsOn: pred ? [pred] : [],
      payload: {},
      occurredAt: archiveAt,
      projectionPayload: {
        id: tenantId,
        fullName: "Ana Reyes",
        phone: "09170003333",
        archivedAt: archiveAt,
      },
    });

    expect(await findLatestActiveEntityOutboxOpId(db, "tenant", tenantId)).toBe(
      archiveOpId,
    );

    // Apply an unrelated delta so rebasing re-evaluates only when targeted,
    // or apply an initial snapshot version for the tenant while pending ops remain.
    await applySyncChangesAtomic(db, key, {
      changes: [
        {
          sequence: "10",
          entityType: "tenant",
          entityId: tenantId,
          version: 1,
          operation: "upsert",
          payload: {
            id: tenantId,
            fullName: "Ana Reyes",
            phone: "09170003333",
            archivedAt: null,
          },
          occurredAt: "2026-11-16T08:10:00.000Z",
        },
      ],
      watermark: "10",
    });

    const rebasedProj = await db.projections.get(
      snapshotEntityKey("tenant", tenantId),
    );
    const decoded = await decryptJsonPayload<{ archivedAt: string | null }>(
      key,
      rebasedProj!.encryptedPayload,
    );
    expect(decoded.archivedAt).toBe(archiveAt);
  });

  it("preserves maintenance.update statusTo during delta rebasing", async () => {
    const deviceId = randomUUID();
    const requestId = randomUUID();

    await enqueueOfflineOperationAtomic(db, key, {
      opId: randomUUID(),
      deviceId,
      type: "maintenance.update",
      entityId: requestId,
      baseVersion: 1,
      payload: {
        statusTo: "IN_PROGRESS",
        note: "Technician en route",
        attachmentIntentIds: [],
      },
      projectionPayload: {
        id: requestId,
        roomId: randomUUID(),
        title: "Leaking faucet",
        status: "IN_PROGRESS",
      },
    });

    await applySyncChangesAtomic(db, key, {
      changes: [
        {
          sequence: "12",
          entityType: "maintenance_request",
          entityId: requestId,
          version: 1,
          operation: "upsert",
          payload: {
            id: requestId,
            roomId: randomUUID(),
            title: "Leaking faucet",
            status: "OPEN",
          },
          occurredAt: "2026-11-16T08:00:00.000Z",
        },
      ],
      watermark: "12",
    });

    const proj = await db.projections.get(
      snapshotEntityKey("maintenance_request", requestId),
    );
    const decoded = await decryptJsonPayload<{ status: string }>(
      key,
      proj!.encryptedPayload,
    );
    expect(decoded.status).toBe("IN_PROGRESS");
  });

  it("preserves tentative and check-in/check-out transient reservation states during delta rebasing", async () => {
    const deviceId = randomUUID();
    const resId = randomUUID();

    await enqueueOfflineOperationAtomic(db, key, {
      opId: randomUUID(),
      deviceId,
      type: "transient_reservation.checkin",
      entityId: resId,
      baseVersion: 1,
      payload: {},
      occurredAt: "2026-11-16T10:00:00.000Z",
      projectionPayload: {
        id: resId,
        guestId: randomUUID(),
        roomId: randomUUID(),
        status: "CHECKED_IN",
      },
    });

    await applySyncChangesAtomic(db, key, {
      changes: [
        {
          sequence: "14",
          entityType: "transient_reservation",
          entityId: resId,
          version: 1,
          operation: "upsert",
          payload: {
            id: resId,
            guestId: randomUUID(),
            roomId: randomUUID(),
            status: "CONFIRMED",
          },
          occurredAt: "2026-11-16T09:00:00.000Z",
        },
      ],
      watermark: "14",
    });

    const proj = await db.projections.get(
      snapshotEntityKey("transient_reservation", resId),
    );
    const decoded = await decryptJsonPayload<{
      status: string;
      checkedInAt: string;
    }>(key, proj!.encryptedPayload);
    expect(decoded.status).toBe("CHECKED_IN");
    expect(decoded.checkedInAt).toBe("2026-11-16T10:00:00.000Z");
  });
});
