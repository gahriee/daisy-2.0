import type {
  AllocationScopeValue,
  GuestSexValue,
  PublicPublishedRoomDto,
} from "@/features/transients/schemas";
import { isValidManilaDate } from "@/lib/dates";
import { parseMoneyDecimal } from "@/lib/money";

export type GallerySlide = {
  id: string;
  url: string;
  caption: string | null;
};

export type RoomAvailabilityStatus = {
  available: boolean;
  label: string;
  detail: string;
  tone: "success" | "neutral" | "warning";
};

export type PublicAvailabilityFilter = "ALL" | "AVAILABLE";

export type PublicSortOption =
  "RECOMMENDED" | "PRICE_ASC" | "PRICE_DESC" | "CAPACITY_DESC";

export type PublicStaySelection = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
};

/**
 * Builds the ordered photo list for a published room, placing its preview cover
 * image first (when distinct from gallery entries) followed by gallery shots.
 */
export function buildRoomGallerySlides(
  room: PublicPublishedRoomDto,
): GallerySlide[] {
  const slides: GallerySlide[] = [];
  const seenUrls = new Set<string>();

  if (room.previewImageUrl) {
    seenUrls.add(room.previewImageUrl);
    slides.push({
      id: `${room.roomId}-preview`,
      url: room.previewImageUrl,
      caption: null,
    });
  }

  for (const image of room.galleryImages) {
    if (seenUrls.has(image.url)) continue;
    seenUrls.add(image.url);
    slides.push(image);
  }

  return slides;
}

/**
 * Formats an `HH:mm` stay schedule time into 12-hour guest-facing display copy.
 */
export function formatStayTime(hhmm: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!match) return "";
  const hour24 = Number(match[1]);
  const minute = match[2];
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${period}`;
}

export function getScopeLabel(scope: AllocationScopeValue): string {
  return scope === "WHOLE_ROOM"
    ? "Private room"
    : "Shared room (1 guest per bed)";
}

export function getGuestSexLabel(sex: GuestSexValue): string {
  return sex === "MALE" ? "Male" : "Female";
}

export function formatGuestsSummary(adults: number, children: number): string {
  const adultPart = `${adults} ${adults === 1 ? "adult" : "adults"}`;
  if (children <= 0) {
    return adultPart;
  }
  const childPart = `${children} ${children === 1 ? "child" : "children"}`;
  return `${adultPart}, ${childPart}`;
}

/**
 * Parses URL search parameters into a safe, bounded When/Who selection,
 * falling back to default tomorrow stay dates when invalid or missing.
 */
export function parsePublicStaySearchParams(
  raw: Record<string, string | string[] | undefined>,
  defaults: { checkInDateManila: string; checkOutDateManila: string },
): PublicStaySelection {
  const readOne = (key: string): string | undefined => {
    const val = raw[key];
    return Array.isArray(val) ? val[0] : val;
  };

  const rawIn = readOne("checkIn")?.trim() ?? "";
  const rawOut = readOne("checkOut")?.trim() ?? "";
  const validDates =
    isValidManilaDate(rawIn) && isValidManilaDate(rawOut) && rawOut > rawIn;

  const checkIn = validDates ? rawIn : defaults.checkInDateManila;
  const checkOut = validDates ? rawOut : defaults.checkOutDateManila;

  const parsedAdults = Number.parseInt(readOne("adults") ?? "", 10);
  const parsedChildren = Number.parseInt(readOne("children") ?? "", 10);
  const parsedLegacyGuests = Number.parseInt(readOne("guests") ?? "", 10);

  let adults = Number.isFinite(parsedAdults)
    ? Math.min(20, Math.max(1, parsedAdults))
    : Number.isFinite(parsedLegacyGuests)
      ? Math.min(20, Math.max(1, parsedLegacyGuests))
      : 1;
  let children = Number.isFinite(parsedChildren)
    ? Math.min(20, Math.max(0, parsedChildren))
    : 0;

  if (adults + children > 20) {
    children = Math.max(0, 20 - adults);
  }
  if (adults < 1) {
    adults = 1;
  }

  return { checkIn, checkOut, adults, children };
}

/**
 * Encodes the current When & Who selection into a clean URL query string for
 * navigating between `/book`, `/book/[roomId]`, and `/book/[roomId]/request`.
 */
export function buildPublicStayQueryString(
  selection: PublicStaySelection,
): string {
  const params = new URLSearchParams({
    checkIn: selection.checkIn,
    checkOut: selection.checkOut,
    adults: String(selection.adults),
    children: String(selection.children),
  });
  return params.toString();
}

/**
 * Derives clear visitor-facing availability status and plain reason copy for a
 * room based on remaining range capacity and requested guest count.
 */
export function getRoomAvailabilityStatus(
  room: PublicPublishedRoomDto,
  requestedGuests: number,
): RoomAvailabilityStatus {
  const hasUnits =
    room.scope === "WHOLE_ROOM"
      ? room.availableUnitsForRange === 1
      : room.availableUnitsForRange >= 1;

  if (!hasUnits) {
    return {
      available: false,
      label: "Booked for dates",
      detail: "This room is not open on your chosen dates.",
      tone: "neutral",
    };
  }

  if (room.scope === "WHOLE_ROOM" && requestedGuests > room.capacity) {
    const unit = room.capacity === 1 ? "guest" : "guests";
    return {
      available: false,
      label: `Fits up to ${room.capacity} ${unit}`,
      detail: `Choose ${room.capacity} or fewer guests to book this room.`,
      tone: "warning",
    };
  }

  if (room.scope === "BED" && requestedGuests > 1) {
    return {
      available: false,
      label: "1 guest per bed",
      detail: "Shared bed spaces accept 1 guest per booking request.",
      tone: "warning",
    };
  }

  return {
    available: true,
    label: "Available",
    detail:
      room.scope === "BED"
        ? `${room.availableUnitsForRange} ${room.availableUnitsForRange === 1 ? "bed" : "beds"} open`
        : "Open for these dates",
    tone: "success",
  };
}

/**
 * Filters and sorts published rooms using exact BigInt monetary comparisons and
 * optional availability-first ordering.
 */
export function filterAndSortPublicRooms(
  rooms: ReadonlyArray<PublicPublishedRoomDto>,
  options: {
    roomTypeFilter: string;
    availabilityFilter: PublicAvailabilityFilter;
    sortBy: PublicSortOption;
    requestedGuests?: number;
  },
): PublicPublishedRoomDto[] {
  const guests = options.requestedGuests;

  const isAvailable = (room: PublicPublishedRoomDto) =>
    guests !== undefined
      ? getRoomAvailabilityStatus(room, guests).available
      : room.isAvailableForRequestedStay;

  const filtered = rooms.filter((room) => {
    if (
      options.roomTypeFilter !== "ALL" &&
      room.roomTypeName !== options.roomTypeFilter
    ) {
      return false;
    }
    if (options.availabilityFilter === "AVAILABLE" && !isAvailable(room)) {
      return false;
    }
    return true;
  });

  if (options.sortBy === "RECOMMENDED") {
    return [...filtered].sort((a, b) => {
      const aAvail = isAvailable(a);
      const bAvail = isAvailable(b);
      if (aAvail !== bAvail) {
        return aAvail ? -1 : 1;
      }
      return 0;
    });
  }

  if (options.sortBy === "PRICE_ASC") {
    return [...filtered].sort((a, b) => {
      const diff =
        parseMoneyDecimal(a.dailyRate) - parseMoneyDecimal(b.dailyRate);
      return diff < BigInt(0) ? -1 : diff > BigInt(0) ? 1 : 0;
    });
  }

  if (options.sortBy === "PRICE_DESC") {
    return [...filtered].sort((a, b) => {
      const diff =
        parseMoneyDecimal(b.dailyRate) - parseMoneyDecimal(a.dailyRate);
      return diff < BigInt(0) ? -1 : diff > BigInt(0) ? 1 : 0;
    });
  }

  return [...filtered].sort((a, b) => b.capacity - a.capacity);
}

export function buildOsmAreaSearchUrl(address: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address.trim())}`;
}
