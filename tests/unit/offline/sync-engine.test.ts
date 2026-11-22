import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import {
  decryptJsonPayload,
  initializeVaultKeyMetadata,
} from "../../../src/offline/crypto";
import {
  DaisyOfflineDatabase,
  enqueueOfflineOperationAtomic,
  type OutboxOperationEnvelope,
} from "../../../src/offline/db";
import {
  runWithSyncLeader,
  syncOfflineWorkspace,
} from "../../../src/offline/sync-engine";

let db: DaisyOfflineDatabase;
let key: CryptoKey;

beforeEach(async () => {
  db = new DaisyOfflineDatabase({
    name: `daisy-sync-test-${randomUUID()}`,
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  const init = await initializeVaultKeyMetadata("sync-passphrase-123", 10_000);
  key = init.key;
});

afterEach(async () => {
  await db.delete();
});

describe("offline sync engine (push-before-pull, dependencies, attachments, backoff, 410 rebootstrap)", () => {
  it("pushes queued operations with attachment upload + expired URL renewal and binds dependent baseVersion", async () => {
    const deviceId = randomUUID();
    const tenantId = randomUUID();
    const opCreateId = randomUUID();
    const opUpdateId = randomUUID();
    const opMaintId = randomUUID();

    await enqueueOfflineOperationAtomic(db, key, {
      opId: opCreateId,
      deviceId,
      type: "tenant.create",
      entityId: tenantId,
      baseVersion: 0,
      payload: { fullName: "Ana Santos", phone: "09171234567" },
    });

    await enqueueOfflineOperationAtomic(db, key, {
      opId: opUpdateId,
      deviceId,
      type: "tenant.update",
      entityId: tenantId,
      baseVersion: 0,
      dependsOn: [opCreateId],
      payload: { fullName: "Ana Santos Updated", phone: "09171234567" },
    });

    await enqueueOfflineOperationAtomic(db, key, {
      opId: opMaintId,
      deviceId,
      type: "maintenance.create",
      entityId: randomUUID(),
      baseVersion: 0,
      payload: {
        roomId: randomUUID(),
        title: "Leak",
        description: "Pipe leak",
        category: "PLUMBING",
        priority: "HIGH",
        attachmentIntentIds: [],
      },
      attachments: [
        {
          attachmentId: randomUUID(),
          clientFileId: "photo-1",
          kind: "maintenance_attachment",
          intentEndpoint: "/api/maintenance/attachments/intent",
          fileName: "leak.jpg",
          mimeType: "image/jpeg",
          bytes: new Uint8Array([1, 2, 3]),
          sha256: "deadbeef",
        },
      ],
    });

    let putAttempts = 0;
    const pushedBatches: OutboxOperationEnvelope[][] = [];

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/maintenance/attachments/intent") {
        return new Response(
          JSON.stringify({
            intentId: "intent-1",
            uploadUrl: "https://storage.local/upload-1",
          }),
          { status: 201 },
        );
      }
      if (url === "https://storage.local/upload-1") {
        putAttempts += 1;
        // Simulate expired presigned URL on first PUT, then succeed after renewal
        return new Response(null, { status: putAttempts === 1 ? 403 : 200 });
      }
      if (url === "/api/sync/push") {
        const body = JSON.parse(String(init?.body)) as {
          operations: OutboxOperationEnvelope[];
        };
        pushedBatches.push(body.operations);
        return new Response(
          JSON.stringify({
            protocolVersion: 1,
            outcomes: body.operations.map((op) => ({
              opId: op.opId,
              status: "applied",
              reason: null,
              resultingVersion: op.type === "tenant.create" ? 1 : 2,
              retryable: false,
            })),
          }),
          { status: 200 },
        );
      }
      if (url === "/api/sync/bootstrap") {
        return new Response(
          JSON.stringify({
            protocolVersion: 1,
            watermark: "5",
            records: [],
            hasMore: false,
            cursor: null,
            syncCursor: "sync-cursor-5",
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    // Run 1: pushes opCreateId and opMaintId (opUpdateId waits until opCreateId returns version 1).
    const res1 = await syncOfflineWorkspace({
      db,
      key,
      ownerToken: "leader-1",
      fetchFn: fetchMock,
    });
    expect(res1.status).toBe("completed");
    expect(putAttempts).toBe(2); // expired URL renewed + succeeded
    expect(pushedBatches[0]!.map((o) => o.opId)).toEqual([
      opCreateId,
      opMaintId,
    ]);
    const maintSent = pushedBatches[0]!.find((o) => o.opId === opMaintId)!;
    expect(maintSent.payload.attachmentIntentIds).toEqual(["intent-1"]);

    // Attachments for applied op were cleaned up locally.
    expect(await db.attachments.count()).toBe(0);

    // Run 2: opUpdateId binds baseVersion = 1 from acknowledged opCreateId before submission.
    const pullCalls: string[] = [];
    const fetchMock2 = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/sync/push") {
        const body = JSON.parse(String(init?.body)) as {
          operations: OutboxOperationEnvelope[];
        };
        pushedBatches.push(body.operations);
        return new Response(
          JSON.stringify({
            protocolVersion: 1,
            outcomes: body.operations.map((op) => ({
              opId: op.opId,
              status: "duplicate",
              reason: null,
              resultingVersion: 2,
              retryable: false,
            })),
          }),
          { status: 200 },
        );
      }
      if (url.startsWith("/api/sync/pull")) {
        pullCalls.push(url);
        return new Response(
          JSON.stringify({
            protocolVersion: 1,
            headSequence: "5",
            changes: [],
            hasMore: false,
            nextCursor: "sync-cursor-5",
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await syncOfflineWorkspace({
      db,
      key,
      ownerToken: "leader-1",
      fetchFn: fetchMock2,
    });
    expect(pushedBatches[1]![0]!.opId).toBe(opUpdateId);
    expect(pushedBatches[1]![0]!.baseVersion).toBe(1);
    expect(pullCalls[0]).toContain("sync-cursor-5");
  });

  it("respects 429 Retry-After, handles 410 rebootstrap without losing pending drafts, and enforces single-leader locks", async () => {
    const deviceId = randomUUID();
    const pendingOpId = randomUUID();

    await db.vaultMeta.put({
      key: "sync",
      schemaVersion: 1,
      watermark: "1",
      syncCursor: "expired-cursor",
      lastSyncedAt: null,
      nextLocalSequence: 1,
      rebootstrapRequired: false,
    });

    await enqueueOfflineOperationAtomic(db, key, {
      opId: pendingOpId,
      deviceId,
      type: "tenant.create",
      entityId: randomUUID(),
      baseVersion: 0,
      payload: { fullName: "Pending Across Rebootstrap", phone: "09170001111" },
    });

    const now = 1_763_200_000_000;
    const rateLimitRes = await syncOfflineWorkspace({
      db,
      key,
      ownerToken: "leader-a",
      nowMs: now,
      fetchFn: async () =>
        new Response(JSON.stringify({ error: "Slow down" }), {
          status: 429,
          headers: { "Retry-After": "15" },
        }),
    });
    expect(rateLimitRes.status).toBe("rate_limited");
    expect(rateLimitRes.retryAfterSeconds).toBe(15);

    // Move clock past Retry-After; push succeeds (returns conflict -> Needs attention),
    // pull returns 410 -> triggers bootstrap while retaining the local Needs-attention row.
    await syncOfflineWorkspace({
      db,
      key,
      ownerToken: "leader-a",
      nowMs: now + 20_000,
      fetchFn: async (url) => {
        if (url === "/api/sync/push") {
          return new Response(
            JSON.stringify({
              protocolVersion: 1,
              outcomes: [
                {
                  opId: pendingOpId,
                  status: "conflict",
                  reason: "Conflict occurred",
                  resultingVersion: null,
                  retryable: false,
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.startsWith("/api/sync/pull")) {
          return new Response(
            JSON.stringify({ code: "rebootstrap_required" }),
            { status: 410 },
          );
        }
        if (url === "/api/sync/bootstrap") {
          return new Response(
            JSON.stringify({
              protocolVersion: 1,
              watermark: "9",
              records: [],
              hasMore: false,
              cursor: null,
              syncCursor: "fresh-cursor-9",
            }),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const retainedOutbox = await db.outbox.get(pendingOpId);
    expect(retainedOutbox?.status).toBe("conflict");
    const decoded = await decryptJsonPayload<OutboxOperationEnvelope>(
      key,
      retainedOutbox!.encryptedOperation,
    );
    expect(decoded.payload.fullName).toBe("Pending Across Rebootstrap");

    // Concurrent single-leader lease rejects overlapping leader
    const concurrent = await runWithSyncLeader(db, "tab-1", async () => {
      const blocked = await runWithSyncLeader(db, "tab-2", async () => "no");
      expect(blocked.acquired).toBe(false);
      return "ok";
    });
    expect(concurrent).toEqual({ acquired: true, result: "ok" });
  });
});
