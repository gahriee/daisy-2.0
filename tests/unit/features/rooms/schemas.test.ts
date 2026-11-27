import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CreateBedSchema,
  CreateRoomPhotoIntentSchema,
  CreateRoomSchema,
  parseRoomPhotosManifestJsonField,
  ROOM_PHOTO_ASPECT_RATIO,
  ROOM_PHOTO_OUTPUT_HEIGHT,
  ROOM_PHOTO_OUTPUT_WIDTH,
  RoomPhotoManifestSchema,
  UpdateBedSchema,
  UpdateRoomSchema,
} from "@/features/rooms/schemas";

describe("rooms & beds schemas", () => {
  it("normalizes non-negative peso amounts per building and requires direct room pricing", () => {
    const parsedBoarding = CreateRoomSchema.parse({
      building: "BOARDING",
      number: " 101 ",
      floor: "2nd ",
      capacity: "2",
      baseMonthlyRate: "4500",
      notes: "  Corner room  ",
    });

    expect(parsedBoarding.building).toBe("BOARDING");
    expect(parsedBoarding.number).toBe("101");
    expect(parsedBoarding.floor).toBe("2nd");
    expect(parsedBoarding.capacity).toBe(2);
    expect(parsedBoarding.baseMonthlyRate).toBe("4500.00");
    expect(parsedBoarding.transientDailyRate).toBeNull();
    expect(parsedBoarding.notes).toBe("Corner room");

    const parsedTransient = CreateRoomSchema.parse({
      building: "TRANSIENT",
      number: "202",
      capacity: 1,
      transientDailyRate: "650.5",
    });
    expect(parsedTransient.baseMonthlyRate).toBeNull();
    expect(parsedTransient.transientDailyRate).toBe("650.50");

    // Rejects cross-building rate leakage
    expect(
      CreateRoomSchema.safeParse({
        building: "BOARDING",
        number: "101",
        capacity: 1,
        baseMonthlyRate: "4500",
        transientDailyRate: "650",
      }).success,
    ).toBe(false);

    expect(
      CreateRoomSchema.safeParse({
        building: "TRANSIENT",
        number: "202",
        capacity: 1,
        baseMonthlyRate: "4500",
        transientDailyRate: "650",
      }).success,
    ).toBe(false);

    // Rejects missing required rates per building
    expect(
      CreateRoomSchema.safeParse({
        building: "BOARDING",
        number: "102",
        capacity: 1,
      }).success,
    ).toBe(false);

    expect(
      CreateRoomSchema.safeParse({
        building: "TRANSIENT",
        number: "203",
        capacity: 1,
      }).success,
    ).toBe(false);
  });

  it("rejects negative rates, invalid versions, and out-of-range capacities", () => {
    expect(
      CreateRoomSchema.safeParse({
        number: "102",
        capacity: 0,
        baseMonthlyRate: "3000",
      }).success,
    ).toBe(false);

    expect(
      CreateRoomSchema.safeParse({
        number: "102",
        capacity: 1,
        baseMonthlyRate: "-100",
      }).success,
    ).toBe(false);

    expect(
      UpdateRoomSchema.safeParse({
        roomId: randomUUID(),
        expectedVersion: 0,
        number: "102",
        capacity: 1,
        baseMonthlyRate: "3000",
      }).success,
    ).toBe(false);
  });

  it("validates bed creation and editable status choices", () => {
    const bed = CreateBedSchema.parse({
      roomId: randomUUID(),
      number: "A",
      label: "Lower bunk",
      monthlyRate: "2500.00",
      dailyRate: "",
    });
    expect(bed.monthlyRate).toBe("2500.00");
    expect(bed.dailyRate).toBeNull();

    expect(
      UpdateBedSchema.safeParse({
        bedId: randomUUID(),
        expectedVersion: 1,
        number: "A",
        monthlyRate: "2500.00",
        status: "OCCUPIED",
      }).success,
    ).toBe(false);
  });

  it("validates UpdateRoomSchema rates against building when provided", () => {
    const updatedBoarding = UpdateRoomSchema.parse({
      roomId: randomUUID(),
      expectedVersion: 2,
      building: "BOARDING",
      number: "101",
      capacity: 2,
      baseMonthlyRate: "5000",
    });
    expect(updatedBoarding.baseMonthlyRate).toBe("5000.00");
    expect(updatedBoarding.transientDailyRate).toBeNull();

    expect(
      UpdateRoomSchema.safeParse({
        roomId: randomUUID(),
        expectedVersion: 2,
        building: "BOARDING",
        number: "101",
        capacity: 2,
      }).success,
    ).toBe(false);

    expect(
      UpdateRoomSchema.safeParse({
        roomId: randomUUID(),
        expectedVersion: 2,
        building: "TRANSIENT",
        number: "202",
        capacity: 2,
      }).success,
    ).toBe(false);
  });

  it("validates room photo upload intents, captions, unlimited gallery shots, boarding rejection, and FormData parsing", () => {
    expect(ROOM_PHOTO_OUTPUT_WIDTH).toBe(1200);
    expect(ROOM_PHOTO_OUTPUT_HEIGHT).toBe(900);
    expect(ROOM_PHOTO_ASPECT_RATIO).toBeCloseTo(4 / 3, 6);

    const validSha = "a".repeat(64);
    expect(
      CreateRoomPhotoIntentSchema.safeParse({
        fileName: "room-preview.jpg",
        mimeType: "image/jpeg",
        byteSize: 2048,
        sha256: validSha,
      }).success,
    ).toBe(true);

    expect(
      CreateRoomPhotoIntentSchema.safeParse({
        fileName: "vector.svg",
        mimeType: "image/svg+xml",
        byteSize: 512,
        sha256: validSha,
      }).success,
    ).toBe(false);

    const manifest = RoomPhotoManifestSchema.parse({
      preview: { kind: "intent", intentId: randomUUID(), caption: null },
      gallery: [
        {
          kind: "existing",
          photoId: randomUUID(),
          caption: "  Study desk by south window  ",
        },
      ],
    });
    expect(manifest.gallery[0]?.caption).toBe("Study desk by south window");

    // Transient room photo gallery accepts more than 8 shots without an artificial cap.
    const largeManifest = RoomPhotoManifestSchema.safeParse({
      preview: null,
      gallery: Array.from({ length: 12 }, (_, idx) => ({
        kind: "intent" as const,
        intentId: randomUUID(),
        caption: `Shot ${idx + 1}`,
      })),
    });
    expect(largeManifest.success).toBe(true);

    const formData = new FormData();
    formData.set("roomPhotosJson", JSON.stringify(manifest));
    expect(parseRoomPhotosManifestJsonField(formData)).toEqual(manifest);

    // Boarding House rooms reject public room photos on create and update.
    expect(
      CreateRoomSchema.safeParse({
        building: "BOARDING",
        number: "101",
        capacity: 1,
        baseMonthlyRate: "4500",
        photos: manifest,
      }).success,
    ).toBe(false);

    expect(
      UpdateRoomSchema.safeParse({
        roomId: randomUUID(),
        expectedVersion: 1,
        building: "BOARDING",
        number: "101",
        capacity: 1,
        baseMonthlyRate: "4500",
        photos: {
          preview: { kind: "intent", intentId: randomUUID(), caption: null },
          gallery: [],
        },
      }).success,
    ).toBe(false);

    expect(
      CreateRoomSchema.safeParse({
        building: "BOARDING",
        number: "101",
        capacity: 1,
        baseMonthlyRate: "4500",
        photos: { preview: null, gallery: [] },
      }).success,
    ).toBe(true);
  });

  it("validates public /book listing options on transient rooms and rejects them on boarding rooms", () => {
    const createdTransient = CreateRoomSchema.parse({
      building: "TRANSIENT",
      number: "205",
      capacity: 1,
      transientDailyRate: "850",
      isTransientPublished: true,
      transientTitle: "  Corner Queen Suite  ",
      transientDescription: "  Quiet street view with workspace.  ",
    });
    expect(createdTransient.isTransientPublished).toBe(true);
    expect(createdTransient.transientTitle).toBe("Corner Queen Suite");
    expect(createdTransient.transientDescription).toBe(
      "Quiet street view with workspace.",
    );

    expect(
      CreateRoomSchema.safeParse({
        building: "BOARDING",
        number: "101",
        capacity: 1,
        baseMonthlyRate: "4500",
        isTransientPublished: true,
      }).success,
    ).toBe(false);

    expect(
      CreateRoomSchema.safeParse({
        building: "BOARDING",
        number: "101",
        capacity: 1,
        baseMonthlyRate: "4500",
        transientTitle: "Public suite",
      }).success,
    ).toBe(false);

    // Partial programmatic updates preserve undefined listing fields instead of clearing them.
    const partialUpdate = UpdateRoomSchema.parse({
      roomId: randomUUID(),
      expectedVersion: 1,
      number: "205",
      capacity: 1,
      transientDailyRate: "850",
    });
    expect(partialUpdate.isTransientPublished).toBeUndefined();
    expect(partialUpdate.transientTitle).toBeUndefined();
    expect(partialUpdate.transientDescription).toBeUndefined();

    // Explicit blank strings clear optional listing text.
    const clearedUpdate = UpdateRoomSchema.parse({
      roomId: randomUUID(),
      expectedVersion: 2,
      building: "TRANSIENT",
      number: "205",
      capacity: 1,
      transientDailyRate: "850",
      isTransientPublished: false,
      transientTitle: "   ",
      transientDescription: "",
    });
    expect(clearedUpdate.isTransientPublished).toBe(false);
    expect(clearedUpdate.transientTitle).toBeNull();
    expect(clearedUpdate.transientDescription).toBeNull();
  });
});
