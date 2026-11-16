import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DashboardWorkspace } from "@/components/features/dashboard/dashboard-workspace";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getDashboardSnapshot } from "@/features/dashboard/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

// Dashboard inspects fresh request authority and must not enter prerender caches.
export const instant = false;

export default async function Home() {
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

  const [snapshot, profile] = await Promise.all([
    getDashboardSnapshot(ownerUserId),
    getOwnerWorkspaceProfile(ownerUserId),
  ]);

  return (
    <WorkspaceShell title="Dashboard" profile={profile}>
      <DashboardWorkspace initialSnapshot={snapshot} />
    </WorkspaceShell>
  );
}
