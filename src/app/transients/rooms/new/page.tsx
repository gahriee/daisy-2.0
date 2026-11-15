import { redirect } from "next/navigation";
import { connection } from "next/server";
import { RoomForm } from "@/components/features/rooms/room-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getRoomCreateContext } from "@/features/rooms/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function NewTransientRoomPage() {
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

  const [profile, context] = await Promise.all([
    getOwnerWorkspaceProfile(ownerUserId),
    getRoomCreateContext(ownerUserId, "TRANSIENT"),
  ]);

  return (
    <WorkspaceShell title="Add transient room" profile={profile}>
      <RoomForm
        mode="create"
        building="TRANSIENT"
        roomTypes={context.activeRoomTypes}
      />
    </WorkspaceShell>
  );
}
