import { redirect } from "next/navigation";
import { connection } from "next/server";
import { RoomsWorkspace } from "@/components/features/rooms/rooms-workspace";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { listInventoryOverview } from "@/features/rooms/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function RoomsPage() {
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

  const [profile, initialOverview] = await Promise.all([
    getOwnerWorkspaceProfile(ownerUserId),
    listInventoryOverview(ownerUserId),
  ]);

  return (
    <WorkspaceShell title="Rooms & beds" profile={profile}>
      <RoomsWorkspace initialOverview={initialOverview} />
    </WorkspaceShell>
  );
}
