import type { Metadata } from "next";
import { connection } from "next/server";
import { PublicBookingClient } from "@/components/features/transients/public-booking-client";
import { parsePublicStaySearchParams } from "@/features/transients/public-booking-view";
import {
  getDefaultPublicStayDates,
  getPublicPublishedAvailability,
  resolvePublicOwnerUserId,
} from "@/features/transients/public-service";
import type { PublicAvailabilityDto } from "@/features/transients/schemas";

export const metadata: Metadata = {
  title: "Short stays & room availability | Daisy",
  description:
    "Browse short-stay rooms, check open dates and nightly rates, view room photos, and send a booking request.",
};

export const instant = false;

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

export default async function PublicBookPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  await connection();
  const defaults = getDefaultPublicStayDates();
  const rawSearch = await searchParams;
  const selection = parsePublicStaySearchParams(rawSearch, defaults);
  const totalGuests = selection.adults + selection.children;

  let initialAvailability: PublicAvailabilityDto = {
    propertyName: "Daisy Residences",
    propertyAddress: null,
    contactPhone: null,
    checkInTimeManila: "",
    checkOutTimeManila: "",
    transientPolicyNote: null,
    checkInDateManila: selection.checkIn,
    checkOutDateManila: selection.checkOut,
    nights: 1,
    guests: totalGuests,
    rooms: [],
  };

  try {
    const ownerUserId = resolvePublicOwnerUserId();
    initialAvailability = await getPublicPublishedAvailability(ownerUserId, {
      checkInDateManila: selection.checkIn,
      checkOutDateManila: selection.checkOut,
      guests: totalGuests,
    });
  } catch {
    // Unconfigured owner or unavailable database degrades safely to empty rooms.
  }

  return (
    <PublicBookingClient
      initialAvailability={initialAvailability}
      initialAdults={selection.adults}
      initialChildren={selection.children}
    />
  );
}
