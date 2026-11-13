import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CreateTenantAssignmentSchema,
  CreateTenantSchema,
  MoveOutTenantAssignmentSchema,
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
});
