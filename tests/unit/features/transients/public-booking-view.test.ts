import { describe, expect, it } from "vitest";
import {
  buildOsmAreaSearchUrl,
  buildPublicStayQueryString,
  buildRoomGallerySlides,
  filterAndSortPublicRooms,
  formatGuestsSummary,
  formatStayTime,
  getGuestSexLabel,
  getRoomAvailabilityStatus,
  getScopeLabel,
  parsePublicStaySearchParams,
} from "../../../../src/features/transients/public-booking-view";
import type { PublicPublishedRoomDto } from "../../../../src/features/transients/schemas";

function makeRoom(
  overrides: Partial<PublicPublishedRoomDto> = {},
): PublicPublishedRoomDto {
  return {
    roomId: "11111111-1111-4111-8111-111111111111",
    title: "Room 201",
    description: "Bright corner room",
    roomTypeName: "Standard Studio",
    scope: "WHOLE_ROOM",
    capacity: 3,
    availableUnitsForRange: 1,
    isAvailableForRequestedStay: true,
    dailyRate: "1500.00",
    indicativeTotalAmount: "3000.00",
    previewImageUrl: "/api/public/room-photos/preview-1",
    galleryImages: [
      {
        id: "gal-1",
        url: "/api/public/room-photos/gal-1",
        caption: "Queen bed view",
      },
      {
        id: "gal-dup",
        url: "/api/public/room-photos/preview-1",
        caption: "Duplicate cover URL",
      },
    ],
    ...overrides,
  };
}

describe("public booking presentation helpers", () => {
  it("builds deduplicated gallery slides with preview first", () => {
    const slides = buildRoomGallerySlides(makeRoom());
    expect(slides).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111-preview",
        url: "/api/public/room-photos/preview-1",
        caption: null,
      },
      {
        id: "gal-1",
        url: "/api/public/room-photos/gal-1",
        caption: "Queen bed view",
      },
    ]);
  });

  it("formats 24h stay times and room/guest copy cleanly", () => {
    expect(formatStayTime("14:00")).toBe("2:00 PM");
    expect(formatStayTime("12:00")).toBe("12:00 PM");
    expect(formatStayTime("00:30")).toBe("12:30 AM");
    expect(formatStayTime("invalid")).toBe("");

    expect(getScopeLabel("WHOLE_ROOM")).toBe("Private room");
    expect(getScopeLabel("BED")).toBe("Shared room (1 guest per bed)");
    expect(getGuestSexLabel("MALE")).toBe("Male");
    expect(getGuestSexLabel("FEMALE")).toBe("Female");

    expect(formatGuestsSummary(1, 0)).toBe("1 adult");
    expect(formatGuestsSummary(2, 1)).toBe("2 adults, 1 child");
    expect(formatGuestsSummary(2, 3)).toBe("2 adults, 3 children");
  });

  it("parses and encodes When & Who search params safely", () => {
    const defaults = {
      checkInDateManila: "2026-12-01",
      checkOutDateManila: "2026-12-02",
    };

    expect(
      parsePublicStaySearchParams(
        {
          checkIn: "2026-12-10",
          checkOut: "2026-12-12",
          adults: "2",
          children: "1",
        },
        defaults,
      ),
    ).toEqual({
      checkIn: "2026-12-10",
      checkOut: "2026-12-12",
      adults: 2,
      children: 1,
    });

    expect(
      parsePublicStaySearchParams(
        {
          checkIn: "2026-12-15",
          checkOut: "2026-12-10",
          adults: "18",
          children: "5",
        },
        defaults,
      ),
    ).toEqual({
      checkIn: "2026-12-01",
      checkOut: "2026-12-02",
      adults: 18,
      children: 2,
    });

    expect(parsePublicStaySearchParams({ guests: "4" }, defaults)).toEqual({
      checkIn: "2026-12-01",
      checkOut: "2026-12-02",
      adults: 4,
      children: 0,
    });

    expect(
      buildPublicStayQueryString({
        checkIn: "2026-12-10",
        checkOut: "2026-12-12",
        adults: 2,
        children: 1,
      }),
    ).toBe("checkIn=2026-12-10&checkOut=2026-12-12&adults=2&children=1");
  });

  it("derives plain availability status without technical terms", () => {
    expect(getRoomAvailabilityStatus(makeRoom(), 2)).toEqual({
      available: true,
      label: "Available",
      detail: "Open for these dates",
      tone: "success",
    });

    expect(
      getRoomAvailabilityStatus(
        makeRoom({ scope: "BED", capacity: 1, availableUnitsForRange: 2 }),
        1,
      ),
    ).toEqual({
      available: true,
      label: "Available",
      detail: "2 beds open",
      tone: "success",
    });

    expect(getRoomAvailabilityStatus(makeRoom({ capacity: 2 }), 3)).toEqual({
      available: false,
      label: "Fits up to 2 guests",
      detail: "Choose 2 or fewer guests to book this room.",
      tone: "warning",
    });

    expect(getRoomAvailabilityStatus(makeRoom({ scope: "BED" }), 2)).toEqual({
      available: false,
      label: "1 guest per bed",
      detail: "Shared bed spaces accept 1 guest per booking request.",
      tone: "warning",
    });

    expect(
      getRoomAvailabilityStatus(
        makeRoom({
          availableUnitsForRange: 0,
          isAvailableForRequestedStay: false,
        }),
        1,
      ),
    ).toEqual({
      available: false,
      label: "Booked for dates",
      detail: "This room is not open on your chosen dates.",
      tone: "neutral",
    });
  });

  it("filters and sorts rooms cleanly using BigInt monetary values and requestedGuests", () => {
    const rooms = [
      makeRoom({
        roomId: "r-booked",
        title: "Booked Suite",
        roomTypeName: "Suite",
        dailyRate: "2200.00",
        capacity: 4,
        availableUnitsForRange: 0,
        isAvailableForRequestedStay: false,
      }),
      makeRoom({
        roomId: "r-cheap",
        title: "Budget Bed",
        roomTypeName: "Dorm",
        scope: "BED",
        dailyRate: "650.00",
        capacity: 1,
        availableUnitsForRange: 3,
      }),
      makeRoom({
        roomId: "r-mid",
        title: "Standard 102",
        roomTypeName: "Suite",
        dailyRate: "1500.00",
        capacity: 2,
        availableUnitsForRange: 1,
      }),
    ];

    expect(
      filterAndSortPublicRooms(rooms, {
        roomTypeFilter: "ALL",
        availabilityFilter: "ALL",
        sortBy: "RECOMMENDED",
        requestedGuests: 2,
      }).map((r) => r.roomId),
    ).toEqual(["r-mid", "r-booked", "r-cheap"]);

    expect(
      filterAndSortPublicRooms(rooms, {
        roomTypeFilter: "Suite",
        availabilityFilter: "AVAILABLE",
        sortBy: "PRICE_ASC",
        requestedGuests: 2,
      }).map((r) => r.roomId),
    ).toEqual(["r-mid"]);

    expect(
      filterAndSortPublicRooms(rooms, {
        roomTypeFilter: "ALL",
        availabilityFilter: "ALL",
        sortBy: "PRICE_DESC",
      }).map((r) => r.roomId),
    ).toEqual(["r-booked", "r-mid", "r-cheap"]);

    expect(
      filterAndSortPublicRooms(rooms, {
        roomTypeFilter: "ALL",
        availabilityFilter: "ALL",
        sortBy: "CAPACITY_DESC",
      }).map((r) => r.roomId),
    ).toEqual(["r-booked", "r-mid", "r-cheap"]);
  });

  it("builds an encoded OpenStreetMap search URL", () => {
    expect(buildOsmAreaSearchUrl("Session Road, Baguio City")).toBe(
      "https://www.openstreetmap.org/search?query=Session%20Road%2C%20Baguio%20City",
    );
  });
});
