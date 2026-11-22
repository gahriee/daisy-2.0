import { describe, expect, it } from "vitest";
import {
  CreateNoticeSchema,
  formatNoticeSmsText,
  SendNoticeSmsSchema,
  UpdateNoticeSchema,
} from "../../../../src/features/notices/schemas";

const ROOM_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const NOTICE_ID = "33333333-3333-4333-8333-333333333333";

describe("notices Zod schemas", () => {
  it("enforces audience target mutual exclusion for EVERYONE, ROOM, and TENANT", () => {
    const everyoneWithRoom = CreateNoticeSchema.safeParse({
      audience: "EVERYONE",
      roomId: ROOM_ID,
      tenantId: null,
      title: "Water cutoff",
      body: "Maintenance from 9am to 11am.",
      startDateManila: "2026-11-15",
      endDateManila: "2026-11-15",
    });
    expect(everyoneWithRoom.success).toBe(false);

    const roomWithoutId = CreateNoticeSchema.safeParse({
      audience: "ROOM",
      roomId: "",
      tenantId: null,
      title: "Room inspection",
      body: "Aircon filter cleaning.",
      startDateManila: "2026-11-15",
      endDateManila: "2026-11-16",
    });
    expect(roomWithoutId.success).toBe(false);

    const tenantWithRoom = CreateNoticeSchema.safeParse({
      audience: "TENANT",
      roomId: ROOM_ID,
      tenantId: TENANT_ID,
      title: "Parcel arrival",
      body: "Claim at the front desk.",
      startDateManila: "2026-11-15",
      endDateManila: "2026-11-16",
    });
    expect(tenantWithRoom.success).toBe(false);

    const validSingleDay = CreateNoticeSchema.parse({
      audience: "EVERYONE",
      roomId: "",
      tenantId: "",
      title: "  Water cutoff  ",
      body: "  Maintenance from 9am to 11am. ",
      startDateManila: "2026-11-15",
      endDateManila: "2026-11-15",
    });
    expect(validSingleDay.roomId).toBeNull();
    expect(validSingleDay.tenantId).toBeNull();
    expect(validSingleDay.title).toBe("Water cutoff");
  });

  it("rejects endDateManila earlier than startDateManila on create and update", () => {
    const badUpdate = UpdateNoticeSchema.safeParse({
      noticeId: NOTICE_ID,
      expectedVersion: 1,
      audience: "TENANT",
      roomId: null,
      tenantId: TENANT_ID,
      title: "Reminder",
      body: "Update emergency contact.",
      startDateManila: "2026-11-20",
      endDateManila: "2026-11-19",
    });
    expect(badUpdate.success).toBe(false);
  });

  it("validates SendNoticeSmsSchema and formats SMS notice text cleanly", () => {
    expect(SendNoticeSmsSchema.safeParse({ noticeId: NOTICE_ID }).success).toBe(
      true,
    );
    expect(SendNoticeSmsSchema.safeParse({ noticeId: "bad-id" }).success).toBe(
      false,
    );

    const formatted = formatNoticeSmsText({
      title: "  Water tank cleaning ",
      body: "Water will be paused 9-11 AM.  ",
      businessName: "Delings Boarding Haus",
    });
    expect(formatted).toBe(
      "Water tank cleaning: Water will be paused 9-11 AM. - Delings Boarding Haus",
    );

    const clipped = formatNoticeSmsText({
      title: "Long notice",
      body: "A".repeat(1200),
      businessName: "Daisy",
    });
    expect(clipped.length).toBeLessThanOrEqual(900);
    expect(clipped.endsWith("… - Daisy")).toBe(true);
  });
});
