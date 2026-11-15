import { connection } from "next/server";
import { PublicBookingClient } from "@/components/features/transients/public-booking-client";
import {
  getDefaultPublicStayDates,
  getPublicPublishedAvailability,
  resolvePublicOwnerUserId,
} from "@/features/transients/public-service";
import type { PublicAvailabilityDto } from "@/features/transients/schemas";

export const instant = false;

export default async function PublicBookPage() {
  await connection();
  const defaults = getDefaultPublicStayDates();

  let initialAvailability: PublicAvailabilityDto = {
    propertyName: "Daisy Residences",
    propertyAddress: null,
    contactPhone: null,
    checkInTimeManila: "",
    checkOutTimeManila: "",
    transientPolicyNote: null,
    checkInDateManila: defaults.checkInDateManila,
    checkOutDateManila: defaults.checkOutDateManila,
    nights: 1,
    guests: 1,
    rooms: [],
  };

  try {
    const ownerUserId = resolvePublicOwnerUserId();
    initialAvailability = await getPublicPublishedAvailability(ownerUserId, {
      checkInDateManila: defaults.checkInDateManila,
      checkOutDateManila: defaults.checkOutDateManila,
      guests: 1,
    });
  } catch {
    // Unconfigured owner or unavailable database degrades safely to empty listings.
  }

  return <PublicBookingClient initialAvailability={initialAvailability} />;
}
