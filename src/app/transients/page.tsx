import { redirect } from "next/navigation";
import { connection } from "next/server";
import { TransientsWorkspace } from "@/components/features/transients/transients-workspace";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getTransientsOverview } from "@/features/transients/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function TransientsPage() {
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
    getTransientsOverview(ownerUserId),
  ]);

  return (
    <WorkspaceShell title="Transients" profile={profile}>
      <TransientsWorkspace initialOverview={initialOverview} />
    </WorkspaceShell>
  );
}
