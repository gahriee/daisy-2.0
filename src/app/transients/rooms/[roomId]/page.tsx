import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { RoomForm } from "@/components/features/rooms/room-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getRoomDetail } from "@/features/rooms/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function TransientRoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ created?: string }>;
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

  const [{ roomId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const [profile, detail] = await Promise.all([
    getOwnerWorkspaceProfile(ownerUserId),
    getRoomDetail(ownerUserId, roomId, "TRANSIENT"),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <WorkspaceShell
      title={`Transient Room ${detail.room.number}`}
      profile={profile}
    >
      <RoomForm
        mode="edit"
        building="TRANSIENT"
        room={detail.room}
        roomTypes={detail.roomTypes}
        justCreated={resolvedSearchParams.created === "1"}
      />
    </WorkspaceShell>
  );
}
