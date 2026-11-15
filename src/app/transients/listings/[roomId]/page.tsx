import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { TransientListingForm } from "@/components/features/transients/transient-listing-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getTransientRoomListingDetail } from "@/features/transients/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function TransientRoomListingPage({
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

  const [profile, room] = await Promise.all([
    getOwnerWorkspaceProfile(ownerUserId),
    getTransientRoomListingDetail(ownerUserId, roomId),
  ]);

  if (!room) {
    notFound();
  }

  return (
    <WorkspaceShell
      title={`Public listing: Room ${room.number}`}
      profile={profile}
    >
      <TransientListingForm room={room} />
    </WorkspaceShell>
  );
}
