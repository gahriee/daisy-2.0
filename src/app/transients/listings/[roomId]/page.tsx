import { notFound, redirect } from "next/navigation";
import { z } from "zod";

export const instant = false;

export default async function TransientRoomListingPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  if (!z.string().uuid().safeParse(roomId).success) {
    notFound();
  }
  redirect(`/transients/rooms/${roomId}`);
}
