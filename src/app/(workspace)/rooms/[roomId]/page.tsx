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

  const detail = await getRoomDetail(ownerUserId, roomId, "BOARDING");

  if (!detail) {
    notFound();
  }

  return (
    <>
      <WorkspacePageTitle title={`Room ${detail.room.number}`} />
      <RoomForm mode="edit" roomTypes={detail.roomTypes} room={detail.room} />
    </>
  );
}
