import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type { TenantsOverviewDto } from "../../../src/features/tenants/schemas";
import type { DecryptedEntityView } from "../../../src/offline/client";
import { initializeVaultKeyMetadata } from "../../../src/offline/crypto";
import {
  applySyncChangesAtomic,
  DaisyOfflineDatabase,
  enqueueOfflineOperationAtomic,
  type OutboxRecord,
} from "../../../src/offline/db";
import {
  buildMaintenanceOverviewFromRecords,
  buildPaymentsOverviewFromRecords,
  buildTenantsOverviewFromRecords,
  loadMaintenanceDetailFromVault,
  loadMaintenanceOverviewFromVault,
  loadPaymentsOverviewFromVault,
  loadTenantsOverviewFromVault,
  mergePaymentsOverviewWithVaultOverlay,
  mergeTenantsOverviewWithVaultOverlay,
} from "../../../src/offline/snapshot-selectors";
import {
  buildBillingOverviewFromRecords,
  buildDashboardSnapshotFromRecords,
  buildNoticesOverviewFromRecords,
  buildRoomsOverviewFromRecords,
  buildTransientsOverviewFromRecords,
  loadDashboardSnapshotFromVault,
  loadTransientsOverviewFromVault,
  mergeTransientsOverviewWithVaultOverlay,
} from "../../../src/offline/snapshot-selectors-extra";

function makeOutboxStub(overrides: Partial<OutboxRecord>): OutboxRecord {
  return {
    opId: randomUUID(),
    deviceId: randomUUID(),
    localSequence: 1,
    entityType: "tenant",
    entityId: randomUUID(),
    type: "tenant.update",
    baseVersion: 1,
    dependsOn: [],
    attachmentIds: [],
    status: "pending",
    reason: null,
    resultingVersion: null,
    retryCount: 0,
    nextRetryAtMs: 0,
    submittedOnce: false,
    encryptedOperation: { v: 1, ivB64: "x", ciphertextB64: "y" },
    createdAt: "2026-11-16T00:00:00.000Z",
    updatedAt: "2026-11-16T00:00:00.000Z",
    ...overrides,
  };
}

function makeView(
  entityType: string,
  entityId: string,
  data: Record<string, unknown>,
  extra?: Partial<DecryptedEntityView>,
): DecryptedEntityView {
  return {
    key: `${entityType}:${entityId}`,
    entityType,
    entityId,
    isPendingLocal: false,
    hasConflict: false,
    pendingOpCount: 0,
    updatedAt: "2026-11-16T08:00:00.000Z",
    data,
    ...extra,
  };
}

describe("Offline snapshot selectors & projection overlays", () => {
  it("reconstructs tenant balances, active assignments, notes, boarding beds, and conflict badges", () => {
    const t1 = randomUUID();
    const rBoarding = randomUUID();
    const rTransient = randomUUID();
    const b1 = randomUUID();
    const b2 = randomUUID();
    const conflictOpId = randomUUID();

    const projections: DecryptedEntityView[] = [
      makeView("tenant", t1, {
        id: t1,
        _version: 2,
        fullName: "Juan Dela Cruz",
        phone: "09171234567",
        email: null,
        address: null,
        emergencyContact: null,
        notes: null,
        archivedAt: null,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-02T00:00:00.000Z",
      }),
      makeView("tenant_assignment", randomUUID(), {
        tenantId: t1,
        roomId: rBoarding,
        roomNumber: "101",
        bedId: b1,
        bedNumber: "1",
        bedLabel: "Lower",
        allocationId: randomUUID(),
        startDate: "2026-11-01T00:00:00.000Z",
        endDate: "2027-05-01T00:00:00.000Z",
        startDateManila: "2026-11-01",
        endDateManila: "2027-05-01",
        monthlyRate: "4500.00",
        securityDeposit: "4500.00",
        status: "ACTIVE",
        _version: 1,
      }),
      makeView("tenant_note", randomUUID(), {
        tenantId: t1,
        content: "Prefers GCash receipts",
        createdAt: "2026-11-10T01:00:00.000Z",
      }),
      makeView("invoice", randomUUID(), {
        tenantId: t1,
        status: "PARTIALLY_PAID",
        totalAmount: "4500.00",
        paidAmount: "1500.00",
      }),
      makeView("payment", randomUUID(), {
        tenantId: t1,
        status: "POSTED",
        unallocatedAmount: "250.00",
      }),
      makeView("room", rBoarding, {
        id: rBoarding,
        building: "BOARDING",
        number: "101",
        floor: "1st",
        baseMonthlyRate: "4500.00",
        archivedAt: null,
      }),
      makeView("room", rTransient, {
        id: rTransient,
        building: "TRANSIENT",
        number: "201",
        floor: "2nd",
        baseMonthlyRate: "0.00",
        archivedAt: null,
      }),
      makeView("bed", b1, {
        id: b1,
        roomId: rBoarding,
        number: "1",
        label: "Lower",
        monthlyRate: "4500.00",
        status: "OCCUPIED",
        archivedAt: null,
      }),
      makeView("bed", b2, {
        id: b2,
        roomId: rTransient,
        number: "1",
        label: null,
        monthlyRate: null,
        status: "AVAILABLE",
        archivedAt: null,
      }),
    ];

    const outbox: OutboxRecord[] = [
      makeOutboxStub({ entityId: t1, status: "pending", localSequence: 1 }),
      makeOutboxStub({
        opId: conflictOpId,
        entityId: t1,
        status: "conflict",
        reason: "Tenant modified on another device",
        localSequence: 2,
      }),
    ];

    const res = buildTenantsOverviewFromRecords({ projections, outbox });
    expect(res.overview.tenants).toHaveLength(1);
    expect(res.overview.tenants[0]?.derivedBalance).toBe("2750.00");
    expect(res.overview.tenants[0]?.activeAssignment?.roomNumber).toBe("101");
    expect(res.overview.tenants[0]?.tenantNotes).toHaveLength(1);
    expect(res.overview.assignableBeds).toHaveLength(1);
    expect(res.overview.assignableBeds[0]?.roomId).toBe(rBoarding);
    expect(res.syncBadges[t1]).toMatchObject({
      status: "conflict",
      opId: conflictOpId,
    });
  });

  it("overlays pending local creations and updates over online server overview while preserving conflicted server rows", () => {
    const existingId = randomUUID();
    const conflictId = randomUUID();
    const localNewId = randomUUID();

    const baseOverview: TenantsOverviewDto = {
      tenants: [
        {
          id: existingId,
          version: 1,
          fullName: "Server Old Name",
          phone: "09170000001",
          email: null,
          address: null,
          emergencyContact: null,
          notes: null,
          archivedAt: null,
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
          activeAssignment: null,
          tenantNotes: [],
          derivedBalance: "100.00",
        },
        {
          id: conflictId,
          version: 2,
          fullName: "Authoritative Server Name",
          phone: "09170000002",
          email: null,
          address: null,
          emergencyContact: null,
          notes: null,
          archivedAt: null,
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
          activeAssignment: null,
          tenantNotes: [],
          derivedBalance: "0.00",
        },
      ],
      assignableBeds: [],
    };

    const projections: DecryptedEntityView[] = [
      makeView(
        "tenant",
        existingId,
        { fullName: "Local Updated Name", phone: "09179998888" },
        { isPendingLocal: true, pendingOpCount: 1 },
      ),
      makeView(
        "tenant",
        conflictId,
        { fullName: "Conflicted Local Draft" },
        { hasConflict: true, pendingOpCount: 1 },
      ),
      makeView(
        "tenant",
        localNewId,
        {
          fullName: "Offline Added Boarder",
          phone: "09175551234",
          archivedAt: null,
        },
        { isPendingLocal: true, pendingOpCount: 1 },
      ),
    ];

    const outbox: OutboxRecord[] = [
      makeOutboxStub({ entityId: existingId, status: "pending" }),
      makeOutboxStub({
        entityId: conflictId,
        status: "conflict",
        reason: "Version conflict",
      }),
      makeOutboxStub({
        entityId: localNewId,
        type: "tenant.create",
        status: "pending",
      }),
    ];

    const merged = mergeTenantsOverviewWithVaultOverlay({
      baseOverview,
      projections,
      outbox,
    });

    expect(merged.overview.tenants).toHaveLength(3);
    expect(merged.overview.tenants[0]?.fullName).toBe("Offline Added Boarder");
    expect(
      merged.overview.tenants.find((t) => t.id === existingId)?.fullName,
    ).toBe("Local Updated Name");
    expect(
      merged.overview.tenants.find((t) => t.id === conflictId)?.fullName,
    ).toBe("Authoritative Server Name");
    expect(merged.syncBadges[conflictId]?.status).toBe("conflict");
    expect(merged.syncBadges[localNewId]?.status).toBe("pending");
  });

  describe("Dexie round-trip loader", () => {
    let db: DaisyOfflineDatabase;
    let key: CryptoKey;

    beforeEach(async () => {
      db = new DaisyOfflineDatabase({
        name: `daisy-selector-${randomUUID()}`,
        indexedDB: new IDBFactory(),
        IDBKeyRange,
      });
      const init = await initializeVaultKeyMetadata(
        "test-passphrase-123",
        10_000,
      );
      key = init.key;
    });

    afterEach(async () => {
      await db.delete();
    });

    it("loads synced snapshots combined with queued offline tenant creations", async () => {
      const syncedId = randomUUID();
      const queuedId = randomUUID();

      await applySyncChangesAtomic(db, key, {
        changes: [
          {
            sequence: "1",
            entityType: "tenant",
            entityId: syncedId,
            version: 1,
            operation: "upsert",
            payload: {
              id: syncedId,
              fullName: "Synced Tenant",
              phone: "09171112222",
              archivedAt: null,
            },
            occurredAt: "2026-11-16T05:00:00.000Z",
          },
        ],
        watermark: "1",
        nextSyncCursor: "cur-1",
      });

      await enqueueOfflineOperationAtomic(db, key, {
        opId: randomUUID(),
        deviceId: randomUUID(),
        type: "tenant.create",
        entityId: queuedId,
        baseVersion: 0,
        payload: { fullName: "Queued Tenant", phone: "09173334444" },
        projectionPayload: {
          fullName: "Queued Tenant",
          phone: "09173334444",
          archivedAt: null,
        },
      });

      const loaded = await loadTenantsOverviewFromVault(db, key);
      expect(loaded.overview.tenants).toHaveLength(2);
      expect(loaded.syncBadges[queuedId]?.status).toBe("pending");
      expect(loaded.lastSyncedAt).not.toBeNull();
    });

    it("reconstructs payments, open invoices, and maintenance tickets/details across offline vault round-trips", async () => {
      const tenantId = randomUUID();
      const invoiceId = randomUUID();
      const queuedPaymentId = randomUUID();
      const roomId = randomUUID();
      const bedId = randomUUID();
      const maintId = randomUUID();

      await db.vaultMeta.put({
        key: "policies",
        policiesComplete: true,
        receiptPrefix: "OR",
        overpaymentPolicy: "CREDIT_NEXT_INVOICE",
        proofMaxBytes: 5 * 1024 * 1024,
        proofMaxFilesPerRecord: 5,
        proofMaxMb: 5,
        missingPolicyLabels: [],
      });

      await applySyncChangesAtomic(db, key, {
        changes: [
          {
            sequence: "1",
            entityType: "tenant",
            entityId: tenantId,
            version: 1,
            operation: "upsert",
            payload: {
              id: tenantId,
              fullName: "Carlos Mendoza",
              archivedAt: null,
            },
            occurredAt: "2026-11-16T05:00:00.000Z",
          },
          {
            sequence: "2",
            entityType: "invoice",
            entityId: invoiceId,
            version: 1,
            operation: "upsert",
            payload: {
              id: invoiceId,
              tenantId,
              snapshotTenantName: "Carlos Mendoza",
              invoiceNumber: "INV-2026-0001",
              billingPeriod: "2026-11",
              dueDateManila: "2026-11-05",
              status: "ISSUED",
              totalAmount: "4500.00",
              paidAmount: "0.00",
            },
            occurredAt: "2026-11-16T05:01:00.000Z",
          },
          {
            sequence: "3",
            entityType: "room",
            entityId: roomId,
            version: 1,
            operation: "upsert",
            payload: {
              id: roomId,
              building: "BOARDING",
              number: "102",
              floor: "1st",
              archivedAt: null,
            },
            occurredAt: "2026-11-16T05:02:00.000Z",
          },
          {
            sequence: "4",
            entityType: "bed",
            entityId: bedId,
            version: 1,
            operation: "upsert",
            payload: {
              id: bedId,
              roomId,
              number: "1",
              status: "AVAILABLE",
              archivedAt: null,
            },
            occurredAt: "2026-11-16T05:03:00.000Z",
          },
        ],
        watermark: "4",
        nextSyncCursor: "cur-4",
      });

      await enqueueOfflineOperationAtomic(db, key, {
        opId: randomUUID(),
        deviceId: randomUUID(),
        type: "payment.record",
        entityId: queuedPaymentId,
        baseVersion: 0,
        payload: {
          tenantId,
          transientGuestId: null,
          amount: "2000.00",
          method: "GCASH",
          paidDateManila: "2026-11-16",
          allocations: [{ invoiceId, amount: "2000.00" }],
          proofIntentIds: [],
        },
        projectionPayload: {
          id: queuedPaymentId,
          payerKind: "TENANT",
          tenantId,
          transientGuestId: null,
          tenantName: "Carlos Mendoza",
          receiptNumber: null,
          status: "POSTED",
          method: "GCASH",
          amount: "2000.00",
          allocatedAmount: "2000.00",
          unallocatedAmount: "0.00",
          paidDateManila: "2026-11-16",
          allocations: [{ invoiceId, amount: "2000.00" }],
          proofs: [],
        },
      });

      await enqueueOfflineOperationAtomic(db, key, {
        opId: randomUUID(),
        deviceId: randomUUID(),
        type: "maintenance.create",
        entityId: maintId,
        baseVersion: 0,
        payload: {
          roomId,
          bedId: null,
          title: "Broken doorknob",
          description: "Front latch stuck",
          category: "SECURITY",
          priority: "URGENT",
          attachmentIntentIds: [],
        },
        projectionPayload: {
          id: maintId,
          roomId,
          roomNumber: "102",
          title: "Broken doorknob",
          description: "Front latch stuck",
          category: "SECURITY",
          priority: "URGENT",
          status: "OPEN",
          archivedAt: null,
          updates: [],
          attachments: [],
          activeHolds: [],
        },
      });

      const paymentsLoaded = await loadPaymentsOverviewFromVault(db, key);
      expect(paymentsLoaded.overview.overpaymentPolicy).toBe(
        "CREDIT_NEXT_INVOICE",
      );
      expect(paymentsLoaded.overview.openInvoices).toHaveLength(1);
      expect(paymentsLoaded.overview.payments).toHaveLength(1);
      expect(paymentsLoaded.overview.payments[0]?.receiptNumber).toBeNull();
      expect(paymentsLoaded.syncBadges[queuedPaymentId]?.status).toBe(
        "pending",
      );

      const maintLoaded = await loadMaintenanceOverviewFromVault(db, key);
      expect(maintLoaded.overview.rooms).toHaveLength(1);
      expect(maintLoaded.overview.totals.openCount).toBe(1);
      expect(maintLoaded.overview.totals.urgentOpenCount).toBe(1);
      expect(maintLoaded.syncBadges[maintId]?.status).toBe("pending");

      const maintDetail = await loadMaintenanceDetailFromVault(
        db,
        key,
        maintId,
      );
      expect(maintDetail.detail?.request.title).toBe("Broken doorknob");
      expect(maintDetail.syncBadge?.status).toBe("pending");
    });
  });

  it("computes payment summary totals, open overdue invoices, and maintenance room counts purely", () => {
    const tId = randomUUID();
    const pId = randomUUID();
    const invId = randomUUID();
    const rId = randomUUID();
    const mId = randomUUID();

    const payRes = buildPaymentsOverviewFromRecords({
      todayManila: "2026-11-16",
      projections: [
        makeView("tenant", tId, {
          id: tId,
          fullName: "Mila Santos",
          archivedAt: null,
        }),
        makeView("invoice", invId, {
          id: invId,
          tenantId: tId,
          status: "ISSUED",
          dueDateManila: "2026-11-01",
          totalAmount: "4500.00",
          paidAmount: "500.00",
        }),
        makeView("payment", pId, {
          id: pId,
          tenantId: tId,
          tenantName: "Mila Santos",
          status: "POSTED",
          method: "CASH",
          amount: "1000.00",
          unallocatedAmount: "500.00",
          paidDateManila: "2026-11-10",
          allocations: [],
          proofs: [],
        }),
      ],
      outbox: [],
    });

    expect(payRes.overview.totals.collectedMonthAmount).toBe("1000.00");
    expect(payRes.overview.totals.unallocatedCreditAmount).toBe("500.00");
    expect(payRes.overview.openInvoices[0]?.isOverdue).toBe(true);
    expect(payRes.overview.openInvoices[0]?.balanceAmount).toBe("4000.00");

    const overlaidPay = mergePaymentsOverviewWithVaultOverlay({
      baseOverview: payRes.overview,
      projections: [],
      outbox: [
        makeOutboxStub({
          entityType: "payment",
          entityId: pId,
          status: "rejected",
          reason: "Overpayment rejected",
        }),
      ],
    });
    expect(overlaidPay.syncBadges[pId]?.status).toBe("rejected");

    const maintRes = buildMaintenanceOverviewFromRecords({
      projections: [
        makeView("room", rId, {
          id: rId,
          building: "BOARDING",
          number: "101",
          archivedAt: null,
        }),
        makeView("maintenance_request", mId, {
          id: mId,
          roomId: rId,
          title: "Roof leak",
          category: "STRUCTURAL",
          priority: "URGENT",
          status: "WAITING_PARTS",
          archivedAt: null,
          activeHolds: [{ id: randomUUID(), status: "ACTIVE" }],
        }),
      ],
      outbox: [],
    });
    expect(maintRes.overview.totals.waitingPartsCount).toBe(1);
    expect(maintRes.overview.totals.urgentOpenCount).toBe(1);
    expect(maintRes.overview.totals.activeHoldsCount).toBe(1);
  });

  it("reconstructs transients, rooms, billing, notices, and dashboard snapshots offline cleanly", async () => {
    const tId = randomUUID();
    const gId = randomUUID();
    const rBoardId = randomUUID();
    const bBoardId = randomUUID();
    const rTransId = randomUUID();
    const stayId = randomUUID();
    const invId = randomUUID();
    const payId = randomUUID();
    const noticeId = randomUUID();

    const projections: DecryptedEntityView[] = [
      makeView("tenant", tId, {
        id: tId,
        fullName: "Elena Cruz",
        archivedAt: null,
      }),
      makeView("transient_guest", gId, {
        id: gId,
        fullName: "Marco Reyes",
        phone: "09171234567",
        archivedAt: null,
      }),
      makeView("room", rBoardId, {
        id: rBoardId,
        building: "BOARDING",
        number: "101",
        capacity: 1,
        baseMonthlyRate: "4500.00",
        archivedAt: null,
      }),
      makeView("bed", bBoardId, {
        id: bBoardId,
        roomId: rBoardId,
        number: "1",
        status: "OCCUPIED",
        archivedAt: null,
      }),
      makeView("room", rTransId, {
        id: rTransId,
        building: "TRANSIENT",
        number: "202",
        capacity: 2,
        transientDailyRate: "1250.00",
        isTransientPublished: true,
        archivedAt: null,
      }),
      makeView("transient_reservation", stayId, {
        id: stayId,
        guestId: gId,
        roomId: rTransId,
        scope: "WHOLE_ROOM",
        checkInDateManila: "2026-11-16",
        checkOutDateManila: "2026-11-18",
        nights: 2,
        partySize: 2,
        dailyRate: "1250.00",
        totalAmount: "2500.00",
        status: "TENTATIVE",
      }),
      makeView("invoice", invId, {
        id: invId,
        tenantId: tId,
        snapshotTenantName: "Elena Cruz",
        invoiceNumber: "INV-2026-0005",
        billingPeriod: "2026-11",
        dueDateManila: "2026-11-10",
        status: "ISSUED",
        totalAmount: "4500.00",
        paidAmount: "0.00",
      }),
      makeView("payment", payId, {
        id: payId,
        tenantId: tId,
        tenantName: "Elena Cruz",
        status: "POSTED",
        method: "GCASH",
        amount: "3000.00",
        unallocatedAmount: "0.00",
        paidDateManila: "2026-10-15",
      }),
      makeView("notice", noticeId, {
        id: noticeId,
        audience: "EVERYONE",
        title: "Water maintenance",
        body: "Short shutdown at noon.",
        startDateManila: "2026-11-15",
        endDateManila: "2026-11-20",
        archivedAt: null,
      }),
    ];

    const transRes = buildTransientsOverviewFromRecords({
      projections,
      outbox: [
        makeOutboxStub({
          entityType: "transient_reservation",
          entityId: stayId,
          status: "pending",
        }),
      ],
    });
    expect(transRes.overview.totals.tentativeReservations).toBe(1);
    expect(transRes.overview.totals.publishedRooms).toBe(1);
    expect(transRes.syncBadges[stayId]?.status).toBe("pending");

    const overlaidTrans = mergeTransientsOverviewWithVaultOverlay({
      baseOverview: transRes.overview,
      projections: [],
      outbox: [
        makeOutboxStub({
          entityType: "transient_reservation",
          entityId: stayId,
          status: "conflict",
          reason: "Overlapping allocation",
        }),
      ],
    });
    expect(overlaidTrans.syncBadges[stayId]?.status).toBe("conflict");

    const roomsRes = buildRoomsOverviewFromRecords({
      projections,
      building: "BOARDING",
    });
    expect(roomsRes.summary.occupiedBeds).toBe(1);

    const billingRes = buildBillingOverviewFromRecords({
      projections,
      todayManila: "2026-11-16",
    });
    expect(billingRes.summary.overdueCount).toBe(1);
    expect(billingRes.summary.openReceivablesAmount).toBe("4500.00");

    const noticesRes = buildNoticesOverviewFromRecords({
      projections,
      todayManila: "2026-11-16",
    });
    expect(noticesRes.totals.activeCount).toBe(1);

    const dash = buildDashboardSnapshotFromRecords({
      projections,
      todayManila: "2026-11-16",
    });
    expect(dash.occupancy.boarding.occupancyPercent).toBe(100);
    expect(dash.billing.previousMonthKey).toBe("2026-10");
    expect(dash.billing.collectedPreviousMonth).toBe("3000.00");
    expect(dash.staysToday.checkInsTodayCount).toBe(1);
    expect(dash.notices.activeCount).toBe(1);

    const db = new DaisyOfflineDatabase({
      name: `daisy-dash-${randomUUID()}`,
      indexedDB: new IDBFactory(),
      IDBKeyRange,
    });
    try {
      const init = await initializeVaultKeyMetadata(
        "test-passphrase-123",
        10_000,
      );
      await applySyncChangesAtomic(db, init.key, {
        changes: [
          {
            sequence: "1",
            entityType: "room",
            entityId: rTransId,
            version: 1,
            operation: "upsert",
            payload: projections[4]!.data,
            occurredAt: "2026-11-16T00:00:00.000Z",
          },
        ],
        watermark: "1",
        nextSyncCursor: "cur-1",
      });
      const loadedTrans = await loadTransientsOverviewFromVault(db, init.key);
      expect(loadedTrans.overview.rooms).toHaveLength(1);
      const loadedDash = await loadDashboardSnapshotFromVault(db, init.key);
      expect(loadedDash.snapshot.occupancy.transient.totalRooms).toBe(1);
    } finally {
      await db.delete();
    }
  });
});
