import { describe, expect, it } from "vitest";
import {
  CreateTransientGuestSchema,
  CreateTransientReservationSchema,
  SubmitPublicBookingRequestSchema,
} from "../../../../src/features/transients/schemas";
import {
  computeTransientSyncFingerprint,
  TransientSyncOperationSchema,
} from "../../../../src/features/transients/sync-contracts";

const GUEST_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const BED_ID = "33333333-3333-4333-8333-333333333333";
const DEVICE_ID = "44444444-4444-4444-8444-444444444444";
const OP_ID = "55555555-5555-4555-8555-555555555555";

describe("transients Zod schemas and sync contracts", () => {
  it("requires phone or email and normalizes optional guest contact info", () => {
    const missingContact = CreateTransientGuestSchema.safeParse({
      fullName: "Marco Santos",
      phone: "",
      email: "",
      notes: "",
    });
    expect(missingContact.success).toBe(false);

    const parsed = CreateTransientGuestSchema.parse({
      fullName: "  Marco Santos  ",
      phone: " +63 917 555 0101 ",
      email: "  MARCO@EXAMPLE.COM ",
      notes: "",
    });
    expect(parsed).toEqual({
      fullName: "Marco Santos",
      phone: "+63 917 555 0101",
      email: "marco@example.com",
      notes: null,
    });
  });

  it("enforces BED vs WHOLE_ROOM scope and check-out ordering on reservations", () => {
    const missingBed = CreateTransientReservationSchema.safeParse({
      guestId: GUEST_ID,
      roomId: ROOM_ID,
      bedId: null,
      scope: "BED",
      checkInDateManila: "2026-11-15",
      checkOutDateManila: "2026-11-17",
      partySize: 1,
    });
    expect(missingBed.success).toBe(false);

    const bedWithWholeRoom = CreateTransientReservationSchema.safeParse({
      guestId: GUEST_ID,
      roomId: ROOM_ID,
      bedId: BED_ID,
      scope: "WHOLE_ROOM",
      checkInDateManila: "2026-11-15",
      checkOutDateManila: "2026-11-17",
      partySize: 2,
    });
    expect(bedWithWholeRoom.success).toBe(false);

    const validWholeRoom = CreateTransientReservationSchema.parse({
      guestId: GUEST_ID,
      roomId: ROOM_ID,
      bedId: "",
      scope: "WHOLE_ROOM",
      checkInDateManila: "2026-11-15",
      checkOutDateManila: "2026-11-17",
      partySize: 2,
      dailyRateOverride: "1200",
      tentative: true,
    });
    expect(validWholeRoom.bedId).toBeNull();
    expect(validWholeRoom.dailyRateOverride).toBe("1200.00");
    expect(validWholeRoom.tentative).toBe(true);
  });

  it("requires privacy consent and valid idempotency token on public booking requests", () => {
    const noConsent = SubmitPublicBookingRequestSchema.safeParse({
      idempotencyKey: "req-token-1234567890",
      roomId: ROOM_ID,
      scope: "BED",
      checkInDateManila: "2026-11-15",
      checkOutDateManila: "2026-11-18",
      partySize: 1,
      guestName: "Liza Reyes",
      guestPhone: "09171234567",
      guestEmail: null,
      notes: "Late arrival",
      privacyConsentAccepted: false,
    });
    expect(noConsent.success).toBe(false);

    const ok = SubmitPublicBookingRequestSchema.parse({
      idempotencyKey: "req-token-1234567890",
      roomId: ROOM_ID,
      scope: "BED",
      checkInDateManila: "2026-11-15",
      checkOutDateManila: "2026-11-18",
      partySize: 1,
      guestName: "Liza Reyes",
      guestPhone: "09171234567",
      guestEmail: null,
      notes: "Late arrival",
      privacyConsentAccepted: true,
    });
    expect(ok.guestEmail).toBeNull();
  });

  it("produces deterministic sync fingerprints across payload key ordering", () => {
    const opA = TransientSyncOperationSchema.parse({
      protocolVersion: 1,
      opId: OP_ID,
      deviceId: DEVICE_ID,
      localSequence: 1,
      type: "transient_guest.create",
      entityId: GUEST_ID,
      baseVersion: 0,
      dependsOn: [],
      occurredAt: "2026-11-14T00:00:00.000Z",
      payload: {
        fullName: "Marco Santos",
        phone: "09175550101",
        email: null,
        notes: "Walk-in",
      },
    });
    const opB = TransientSyncOperationSchema.parse({
      protocolVersion: 1,
      opId: OP_ID,
      deviceId: DEVICE_ID,
      localSequence: 1,
      type: "transient_guest.create",
      entityId: GUEST_ID,
      baseVersion: 0,
      dependsOn: [],
      occurredAt: "2026-11-14T00:05:00.000Z",
      payload: {
        notes: "Walk-in",
        email: null,
        phone: "09175550101",
        fullName: "Marco Santos",
      },
    });

    expect(computeTransientSyncFingerprint(opA)).toBe(
      computeTransientSyncFingerprint(opB),
    );
  });
});
