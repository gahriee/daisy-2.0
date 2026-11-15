import { redirect } from "next/navigation";
import { connection } from "next/server";
import { RoomsWorkspace } from "@/components/features/rooms/rooms-workspace";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { listInventoryOverview } from "@/features/rooms/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function TransientRoomsPage() {
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

  const [profile, overview] = await Promise.all([
    getOwnerWorkspaceProfile(ownerUserId),
    listInventoryOverview(ownerUserId, { building: "TRANSIENT" }),
  ]);

  return (
    <WorkspaceShell title="Transient rooms" profile={profile}>
      <RoomsWorkspace building="TRANSIENT" initialOverview={overview} />
    </WorkspaceShell>
  );
}
