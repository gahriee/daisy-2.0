import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
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

  const profile = await getOwnerWorkspaceProfile(ownerUserId);

  return <WorkspaceShell profile={profile}>{children}</WorkspaceShell>;
}
