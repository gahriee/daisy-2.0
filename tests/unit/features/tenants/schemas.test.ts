import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CONTRACT_MAX_FILE_BYTES,
  CONTRACT_MAX_PAGES,
  CreateTenantAssignmentSchema,
  CreateTenantContractIntentSchema,
  CreateTenantContractSchema,
  CreateTenantNoteSchema,
  CreateTenantSchema,
  DeleteTenantNoteSchema,
  MoveOutTenantAssignmentSchema,
  UpdateTenantSchema,
} from "@/features/tenants/schemas";
import {
  canonicalizeSyncJson,
  TenantSyncOperationSchema,
  TENANT_SYNC_PROTOCOL_VERSION,
} from "@/features/tenants/sync-contracts";

describe("tenants, assignments, and sync contract schemas", () => {
  it("supports optional client-generated UUID and optional contact details", () => {
    const id = randomUUID();
    const parsed = CreateTenantSchema.parse({
      id,
      fullName: " Maria Santos ",
      phone: "",
      email: "maria@example.com",
      address: "Quezon City",
      emergencyContact: "",
      notes: "",
    });

    expect(parsed.id).toBe(id);
    expect(parsed.fullName).toBe("Maria Santos");
    expect(parsed.phone).toBeNull();
    expect(parsed.email).toBe("maria@example.com");
    expect(parsed.emergencyContact).toBeNull();
  });

  it("enforces startDateManila < endDateManila for tenant assignments", () => {
    const bad = CreateTenantAssignmentSchema.safeParse({
      tenantId: randomUUID(),
      bedId: randomUUID(),
      startDateManila: "2026-12-01",
      endDateManila: "2026-12-01",
      monthlyRate: "4500",
      securityDeposit: "4500",
    });
    expect(bad.success).toBe(false);

    const good = CreateTenantAssignmentSchema.parse({
      tenantId: randomUUID(),
      bedId: randomUUID(),
      startDateManila: "2026-12-01",
      endDateManila: "2027-06-01",
      monthlyRate: "4500",
      securityDeposit: "0",
    });
    expect(good.monthlyRate).toBe("4500.00");
    expect(good.securityDeposit).toBe("0.00");
  });

  it("validates move-out completion vs pre-start cancellation", () => {
    expect(
      MoveOutTenantAssignmentSchema.safeParse({
        assignmentId: randomUUID(),
        expectedVersion: 1,
        mode: "complete",
        actualMoveOutDateManila: "",
      }).success,
    ).toBe(false);

    expect(
      MoveOutTenantAssignmentSchema.safeParse({
        assignmentId: randomUUID(),
        expectedVersion: 1,
        mode: "cancel",
        actualMoveOutDateManila: "",
      }).success,
    ).toBe(true);
  });

  it("canonicalizes sync operation fingerprints independently of object key order", () => {
    const a = canonicalizeSyncJson({ b: 2, a: { d: 4, c: 3 } });
    const b = canonicalizeSyncJson({ a: { c: 3, d: 4 }, b: 2 });
    expect(a).toBe(b);

    const parsedOp = TenantSyncOperationSchema.parse({
      protocolVersion: TENANT_SYNC_PROTOCOL_VERSION,
      opId: randomUUID(),
      deviceId: randomUUID(),
      localSequence: 1,
      type: "tenant.create",
      entityId: randomUUID(),
      baseVersion: 0,
      dependsOn: [],
      occurredAt: "2026-11-13T12:00:00.000Z",
      payload: {
        fullName: "Juan Cruz",
      },
    });
    expect(parsedOp.type).toBe("tenant.create");
  });

  it("validates separate tenant note schemas and optional omitted notes on tenant profile updates", () => {
    const tenantId = randomUUID();
    const noteId = randomUUID();

    expect(
      CreateTenantNoteSchema.safeParse({
        tenantId,
        content: "   ",
      }).success,
    ).toBe(false);

    expect(
      CreateTenantNoteSchema.safeParse({
        tenantId,
        content: "x".repeat(1001),
      }).success,
    ).toBe(false);

    const validNote = CreateTenantNoteSchema.parse({
      tenantId,
      content: "  Submitted clearance and ID  ",
    });
    expect(validNote).toEqual({
      tenantId,
      content: "Submitted clearance and ID",
    });

    const validDelete = DeleteTenantNoteSchema.parse({ tenantId, noteId });
    expect(validDelete).toEqual({ tenantId, noteId });

    const createdWithoutNotes = CreateTenantSchema.parse({
      fullName: "Ana Gomez",
    });
    expect(createdWithoutNotes.notes).toBeNull();

    const updatedWithoutNotes = UpdateTenantSchema.parse({
      tenantId,
      expectedVersion: 1,
      fullName: "Ana Gomez",
    });
    expect(updatedWithoutNotes.notes).toBeUndefined();
  });

  it("validates signed contract upload intents and multi-page contract payloads", () => {
    const tenantId = randomUUID();
    const sha256 = "a".repeat(64);

    expect(
      CreateTenantContractIntentSchema.safeParse({
        tenantId,
        fileName: "contract-page-1.jpg",
        mimeType: "image/jpeg",
        byteSize: 1024,
        sha256,
      }).success,
    ).toBe(true);

    expect(
      CreateTenantContractIntentSchema.safeParse({
        tenantId,
        fileName: "signed-lease.pdf",
        mimeType: "application/pdf",
        byteSize: CONTRACT_MAX_FILE_BYTES + 1,
        sha256,
      }).success,
    ).toBe(false);

    const intentId = randomUUID();
    const parsedContract = CreateTenantContractSchema.parse({
      tenantId,
      title: "  Signed Room 101 Lease  ",
      signedDateManila: "2026-11-14",
      notes: "  Signed in person  ",
      pages: [
        {
          intentId,
          filterMode: "MAGIC_WHITE",
          label: "  Page 1  ",
        },
      ],
    });
    expect(parsedContract.title).toBe("Signed Room 101 Lease");
    expect(parsedContract.assignmentId).toBeNull();
    expect(parsedContract.pages[0]?.label).toBe("Page 1");

    // Duplicate intentId or exceeding max pages fails validation
    expect(
      CreateTenantContractSchema.safeParse({
        tenantId,
        title: "Contract",
        pages: [
          { intentId, filterMode: "MAGIC_WHITE" },
          { intentId, filterMode: "BW_SCAN" },
        ],
      }).success,
    ).toBe(false);

    expect(
      CreateTenantContractSchema.safeParse({
        tenantId,
        title: "Too many pages",
        pages: Array.from({ length: CONTRACT_MAX_PAGES + 1 }, () => ({
          intentId: randomUUID(),
          filterMode: "ORIGINAL" as const,
        })),
      }).success,
    ).toBe(false);
  });
});
