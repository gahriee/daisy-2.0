import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { RoomForm } from "@/components/features/rooms/room-form";
import { WorkspacePageTitle } from "@/components/layout/workspace-shell";
import { getRoomDetail } from "@/features/rooms/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  await connection();
  let authenticated = false;
  try {
    authenticated = await isOwner();
  } catch {
    authenticated = false;
  }

  const ownerUserId = process.env.OWNER_USER_ID;
  if (!authenticated || !ownerUserId) {
    redirect("/auth/sign-in");
  }

  const { roomId } = await params;
  if (!z.string().uuid().safeParse(roomId).success) {
    notFound();
  }

  const room = await getRoomDetail(ownerUserId, roomId, "BOARDING");

  if (!room) {
    notFound();
  }

  return (
    <>
      <WorkspacePageTitle title={`Room ${room.number}`} />
      <RoomForm mode="edit" room={room} />
    </>
  );
}
