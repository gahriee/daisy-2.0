import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PublicRoomDetailClient } from "@/components/features/transients/public-room-detail-client";
import { parsePublicStaySearchParams } from "@/features/transients/public-booking-view";
import {
  getDefaultPublicStayDates,
  getPublicPublishedRoomAvailability,
  resolvePublicOwnerUserId,
} from "@/features/transients/public-service";

export const instant = false;

type RoomPageProps = {
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
        title: `${match.room.title} | ${match.availability.propertyName}`,
        description:
          match.room.description ??
          `View photos, room setup, nightly rate, and open dates for ${match.room.title}.`,
      };
    }
  } catch {
    // Fall back to generic metadata when database or owner lookup is unavailable.
  }

  return {
    title: "Room photos & details | Daisy",
    description:
      "View room photos, captions, nightly rates, and open dates for short stays.",
  };
}

export default async function PublicRoomDetailPage({
  params,
  searchParams,
}: RoomPageProps) {
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
    <PublicRoomDetailClient
      initialAvailability={match.availability}
      initialRoom={match.room}
      initialAdults={selection.adults}
      initialChildren={selection.children}
    />
  );
}
