import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CreateBedSchema,
  CreateRoomSchema,
  CreateRoomTypeSchema,
  UpdateBedSchema,
  UpdateRoomSchema,
  UpdateRoomTypeSchema,
} from "@/features/rooms/schemas";

describe("rooms, room types & beds schemas", () => {
  it("validates room type inputs and normalizes peso pricing", () => {
    const parsed = CreateRoomTypeSchema.parse({
      name: "  Single Aircon  ",
      monthlyRate: "4500",
      dailyRate: "650.5",
      description: "  Includes private CR  ",
    });

    expect(parsed.name).toBe("Single Aircon");
    expect(parsed.monthlyRate).toBe("4500.00");
    expect(parsed.dailyRate).toBe("650.50");
    expect(parsed.description).toBe("Includes private CR");

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

  it("normalizes non-negative peso amounts and allows omitted create rate for room-type inheritance", () => {
    const roomTypeId = randomUUID();
    const parsed = CreateRoomSchema.parse({
      number: " 101 ",
      floor: "2nd ",
      roomTypeId,
      capacity: "2",
      baseMonthlyRate: "4500",
      transientDailyRate: "650.5",
      notes: "  Corner room  ",
    });

    expect(parsed.number).toBe("101");
    expect(parsed.floor).toBe("2nd");
    expect(parsed.roomTypeId).toBe(roomTypeId);
    expect(parsed.capacity).toBe(2);
    expect(parsed.baseMonthlyRate).toBe("4500.00");
    expect(parsed.transientDailyRate).toBe("650.50");
    expect(parsed.notes).toBe("Corner room");

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
});
