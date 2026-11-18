import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PublicBookingRequestClient } from "@/components/features/transients/public-booking-request-client";
import { parsePublicStaySearchParams } from "@/features/transients/public-booking-view";
import {
  getDefaultPublicStayDates,
  getPublicPublishedRoomAvailability,
  resolvePublicOwnerUserId,
} from "@/features/transients/public-service";

export const instant = false;

type RequestPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ roomId: string }>;
}): Promise<Metadata> {
  await connection();
  const { roomId } = await params;
  const defaults = getDefaultPublicStayDates();

  try {
    const ownerUserId = resolvePublicOwnerUserId();
    const match = await getPublicPublishedRoomAvailability(
      ownerUserId,
      roomId,
      {
        checkInDateManila: defaults.checkInDateManila,
        checkOutDateManila: defaults.checkOutDateManila,
        guests: 1,
      },
    );
    if (match) {
      return {
        title: `Request ${match.room.title} | ${match.availability.propertyName}`,
        description: `Send your guest details and stay request for ${match.room.title}.`,
      };
    }
  } catch {
    // Fall back to generic metadata when database or owner lookup is unavailable.
  }

  return {
    title: "Request booking | Daisy",
    description: "Enter your stay dates and guest details to request a room.",
  };
}

export default async function PublicBookingRequestPage({
  params,
  searchParams,
}: RequestPageProps) {
  await connection();
  const { roomId } = await params;
  const rawSearch = await searchParams;
  const defaults = getDefaultPublicStayDates();
  const selection = parsePublicStaySearchParams(rawSearch, defaults);
  const totalGuests = selection.adults + selection.children;

  let match = null;
  try {
    const ownerUserId = resolvePublicOwnerUserId();
    match = await getPublicPublishedRoomAvailability(ownerUserId, roomId, {
      checkInDateManila: selection.checkIn,
      checkOutDateManila: selection.checkOut,
      guests: totalGuests,
    });
  } catch {
    notFound();
  }

  if (!match) {
    notFound();
  }

  return (
    <PublicBookingRequestClient
      initialAvailability={match.availability}
      initialRoom={match.room}
      initialAdults={selection.adults}
      initialChildren={selection.children}
    />
  );
}
