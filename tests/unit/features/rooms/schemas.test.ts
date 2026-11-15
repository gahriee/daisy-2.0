import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CreateBedSchema,
  CreateRoomPhotoIntentSchema,
  CreateRoomSchema,
  CreateRoomTypeSchema,
  parseRoomPhotosManifestJsonField,
  RoomPhotoManifestSchema,
  UpdateBedSchema,
  UpdateRoomSchema,
  UpdateRoomTypeSchema,
} from "@/features/rooms/schemas";

describe("rooms, room types & beds schemas", () => {
  it("validates building-specific room type inputs and normalizes peso pricing", () => {
    const boarding = CreateRoomTypeSchema.parse({
      building: "BOARDING",
      name: "  Single Aircon  ",
      monthlyRate: "4500",
      description: "  Includes private CR  ",
    });

    expect(boarding.building).toBe("BOARDING");
    expect(boarding.name).toBe("Single Aircon");
    expect(boarding.monthlyRate).toBe("4500.00");
    expect(boarding.dailyRate).toBeNull();
    expect(boarding.description).toBe("Includes private CR");

    const transient = CreateRoomTypeSchema.parse({
      building: "TRANSIENT",
      name: "  Transient Suite  ",
      dailyRate: "650.5",
    });
    expect(transient.building).toBe("TRANSIENT");
    expect(transient.dailyRate).toBe("650.50");
    expect(transient.monthlyRate).toBeNull();

    // Rejects cross-building rate leakage on room types
    expect(
      CreateRoomTypeSchema.safeParse({
        building: "BOARDING",
        name: "Single Aircon",
        monthlyRate: "4500",
        dailyRate: "650",
      }).success,
    ).toBe(false);

    expect(
      CreateRoomTypeSchema.safeParse({
        building: "TRANSIENT",
        name: "Transient Suite",
        monthlyRate: "4500",
        dailyRate: "650",
      }).success,
    ).toBe(false);

    expect(
      CreateRoomTypeSchema.safeParse({
        name: "   ",
        monthlyRate: "4500",
      }).success,
    ).toBe(false);

    expect(
      UpdateRoomTypeSchema.safeParse({
        roomTypeId: randomUUID(),
        expectedVersion: 0,
        name: "Single Fan",
        monthlyRate: "3200",
      }).success,
    ).toBe(false);
  });

  it("normalizes non-negative peso amounts per building and allows omitted create rate for room-type inheritance", () => {
    const roomTypeId = randomUUID();
    const parsedBoarding = CreateRoomSchema.parse({
      building: "BOARDING",
      number: " 101 ",
      floor: "2nd ",
      roomTypeId,
      capacity: "2",
      baseMonthlyRate: "4500",
      notes: "  Corner room  ",
    });

    expect(parsedBoarding.building).toBe("BOARDING");
    expect(parsedBoarding.number).toBe("101");
    expect(parsedBoarding.floor).toBe("2nd");
    expect(parsedBoarding.roomTypeId).toBe(roomTypeId);
    expect(parsedBoarding.capacity).toBe(2);
    expect(parsedBoarding.baseMonthlyRate).toBe("4500.00");
    expect(parsedBoarding.transientDailyRate).toBeNull();
    expect(parsedBoarding.notes).toBe("Corner room");

    const parsedTransient = CreateRoomSchema.parse({
      building: "TRANSIENT",
      number: "202",
      roomTypeId,
      capacity: 1,
      transientDailyRate: "650.5",
    });
    expect(parsedTransient.baseMonthlyRate).toBeNull();
    expect(parsedTransient.transientDailyRate).toBe("650.50");

    expect(
      CreateRoomSchema.safeParse({
        building: "BOARDING",
        number: "101",
        roomTypeId,
        capacity: 1,
        baseMonthlyRate: "4500",
        transientDailyRate: "650",
      }).success,
    ).toBe(false);

    const inherited = CreateRoomSchema.parse({
      number: "102",
      roomTypeId,
      capacity: 1,
    });
    expect(inherited.baseMonthlyRate).toBeNull();
    expect(inherited.transientDailyRate).toBeNull();
  });

  it("rejects negative rates, invalid roomTypeId, and out-of-range capacities", () => {
    const roomTypeId = randomUUID();

    expect(
      CreateRoomSchema.safeParse({
        number: "102",
        roomTypeId: "not-a-uuid",
        capacity: 1,
      }).success,
    ).toBe(false);

    expect(
      CreateRoomSchema.safeParse({
        number: "102",
        roomTypeId,
        capacity: 0,
        baseMonthlyRate: "3000",
      }).success,
    ).toBe(false);

    expect(
      CreateRoomSchema.safeParse({
        number: "102",
        roomTypeId,
        capacity: 1,
        baseMonthlyRate: "-100",
      }).success,
    ).toBe(false);

    expect(
      UpdateRoomSchema.safeParse({
        roomId: randomUUID(),
        expectedVersion: 0,
        number: "102",
        roomTypeId,
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

  it("allows omitted rate fields on UpdateRoomSchema so rooms use configured room type rates", () => {
    const parsed = UpdateRoomSchema.parse({
      roomId: randomUUID(),
      expectedVersion: 2,
      number: "202",
      roomTypeId: randomUUID(),
      capacity: 1,
    });
    expect(parsed.baseMonthlyRate).toBeNull();
    expect(parsed.transientDailyRate).toBeNull();
  });

  it("validates room photo upload intents, captions, max gallery shots, and FormData parsing", () => {
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

    expect(
      RoomPhotoManifestSchema.safeParse({
        preview: null,
        gallery: Array.from({ length: 9 }, () => ({
          kind: "intent" as const,
          intentId: randomUUID(),
          caption: null,
        })),
      }).success,
    ).toBe(false);

    const formData = new FormData();
    formData.set("roomPhotosJson", JSON.stringify(manifest));
    expect(parseRoomPhotosManifestJsonField(formData)).toEqual(manifest);
  });
});
