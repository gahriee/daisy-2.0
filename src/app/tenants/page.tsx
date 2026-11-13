import { redirect } from "next/navigation";
import { connection } from "next/server";
import { TenantsWorkspace } from "@/components/features/tenants/tenants-workspace";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { listTenantsOverview } from "@/features/tenants/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function TenantsPage() {
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
    listTenantsOverview(ownerUserId),
  ]);

  return (
    <WorkspaceShell title="Tenants" profile={profile}>
      <TenantsWorkspace initialOverview={initialOverview} />
    </WorkspaceShell>
  );
}
