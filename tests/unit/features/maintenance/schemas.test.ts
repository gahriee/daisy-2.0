import { describe, expect, it } from "vitest";
import {
  AddMaintenanceUpdateSchema,
  CreateMaintenanceAttachmentIntentSchema,
  CreateMaintenanceRequestSchema,
  PlaceMaintenanceHoldSchema,
} from "../../../../src/features/maintenance/schemas";
import {
  computeMaintenanceSyncFingerprint,
  MAINTENANCE_SYNC_PROTOCOL_VERSION,
  MaintenanceSyncOperationSchema,
} from "../../../../src/features/maintenance/sync-contracts";

const ROOM_ID = "11111111-1111-4111-8111-111111111111";
const BED_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const DEVICE_ID = "44444444-4444-4444-8444-444444444444";
const OP_ID = "55555555-5555-4555-8555-555555555555";
const INTENT_ID = "66666666-6666-4666-8666-666666666666";

describe("maintenance Zod schemas and sync contracts", () => {
  it("normalizes create request fields and rejects duplicate attachment intent IDs", () => {
    const duplicateIntents = CreateMaintenanceRequestSchema.safeParse({
      roomId: ROOM_ID,
      bedId: "",
      title: "Leaking shower valve",
      description: "Water drips continuously overnight.",
      category: "PLUMBING",
      priority: "HIGH",
      attachmentIntentIds: [INTENT_ID, INTENT_ID],
    });
    expect(duplicateIntents.success).toBe(false);

    const parsed = CreateMaintenanceRequestSchema.parse({
      roomId: ROOM_ID,
      bedId: "",
      title: "  Leaking shower valve  ",
      description: "  Water drips continuously overnight. ",
      category: "PLUMBING",
      priority: "URGENT",
      attachmentIntentIds: [INTENT_ID],
    });
    expect(parsed.bedId).toBeNull();
    expect(parsed.title).toBe("Leaking shower valve");
    expect(parsed.priority).toBe("URGENT");
    expect(parsed.attachmentIntentIds).toEqual([INTENT_ID]);
  });

  it("requires either a progress note or status change on updates", () => {
    const emptyUpdate = AddMaintenanceUpdateSchema.safeParse({
      requestId: REQUEST_ID,
      expectedVersion: 1,
      statusTo: "",
      note: "   ",
      attachmentIntentIds: [],
    });
    expect(emptyUpdate.success).toBe(false);

    const noteOnly = AddMaintenanceUpdateSchema.parse({
      requestId: REQUEST_ID,
      expectedVersion: 1,
      statusTo: "",
      note: "Plumber scheduled for tomorrow morning.",
      attachmentIntentIds: [],
    });
    expect(noteOnly.statusTo).toBeNull();
    expect(noteOnly.note).toBe("Plumber scheduled for tomorrow morning.");
  });

  it("validates BED vs WHOLE_ROOM maintenance hold rules and date ordering", () => {
    const badRange = PlaceMaintenanceHoldSchema.safeParse({
      requestId: REQUEST_ID,
      expectedVersion: 1,
      scope: "WHOLE_ROOM",
      bedId: null,
      startDateManila: "2026-11-20",
      endDateManila: "2026-11-20",
      notes: "",
    });
    expect(badRange.success).toBe(false);

    const missingBed = PlaceMaintenanceHoldSchema.safeParse({
      requestId: REQUEST_ID,
      expectedVersion: 1,
      scope: "BED",
      bedId: "",
      startDateManila: "2026-11-20",
      endDateManila: "2026-11-22",
    });
    expect(missingBed.success).toBe(false);

    const bedOnWholeRoom = PlaceMaintenanceHoldSchema.safeParse({
      requestId: REQUEST_ID,
      expectedVersion: 1,
      scope: "WHOLE_ROOM",
      bedId: BED_ID,
      startDateManila: "2026-11-20",
      endDateManila: "2026-11-22",
    });
    expect(bedOnWholeRoom.success).toBe(false);
  });

  it("validates SHA-256 format and paired sync intent keys on attachment intents", () => {
    const pairedHalf = CreateMaintenanceAttachmentIntentSchema.safeParse({
      fileName: "leak.jpg",
      mimeType: "image/jpeg",
      byteSize: 1024,
      sha256: "a".repeat(64),
      opId: OP_ID,
    });
    expect(pairedHalf.success).toBe(false);

    const valid = CreateMaintenanceAttachmentIntentSchema.parse({
      fileName: "leak.jpg",
      mimeType: "image/jpeg",
      byteSize: 1024,
      sha256: "A".repeat(64),
      opId: OP_ID,
      clientFileId: "file-1",
    });
    expect(valid.sha256).toBe("a".repeat(64));
  });

  it("computes deterministic sync operation fingerprints independent of key order", () => {
    const opA = MaintenanceSyncOperationSchema.parse({
      protocolVersion: MAINTENANCE_SYNC_PROTOCOL_VERSION,
      opId: OP_ID,
      deviceId: DEVICE_ID,
      localSequence: 1,
      type: "maintenance.create",
      entityId: REQUEST_ID,
      baseVersion: 0,
      dependsOn: [],
      occurredAt: "2026-11-14T01:00:00.000Z",
      payload: {
        roomId: ROOM_ID,
        bedId: BED_ID,
        title: "Broken outlet",
        description: "Bedroom duplex outlet sparking.",
        category: "ELECTRICAL",
        priority: "URGENT",
        attachmentIntentIds: [],
      },
    });

    const opB = MaintenanceSyncOperationSchema.parse({
      occurredAt: "2026-11-14T01:00:00.000Z",
      type: "maintenance.create",
      opId: OP_ID,
      protocolVersion: MAINTENANCE_SYNC_PROTOCOL_VERSION,
      entityId: REQUEST_ID,
      baseVersion: 0,
      deviceId: DEVICE_ID,
      localSequence: 1,
      payload: {
        priority: "URGENT",
        category: "ELECTRICAL",
        attachmentIntentIds: [],
        description: "Bedroom duplex outlet sparking.",
        title: "Broken outlet",
        bedId: BED_ID,
        roomId: ROOM_ID,
      },
    });

    expect(computeMaintenanceSyncFingerprint(opA)).toBe(
      computeMaintenanceSyncFingerprint(opB),
    );
  });
});
