import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  TransientsWorkspace,
  type TransientWorkspaceSection,
} from "@/components/features/transients/transients-workspace";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getTransientsOverview } from "@/features/transients/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

const SECTION_TITLES: Record<TransientWorkspaceSection, string> = {
  stays: "Stays & reservations",
  requests: "Booking requests",
};

/**
 * Shared authenticated Server Component loader for the dedicated Transient
 * workspace section pages (`/transients/stays`, `/transients/requests`).
 */
export async function renderTransientSectionPage(
  section: TransientWorkspaceSection,
) {
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
    <WorkspaceShell title={SECTION_TITLES[section]} profile={profile}>
      <TransientsWorkspace
        section={section}
        initialOverview={initialOverview}
      />
    </WorkspaceShell>
  );
}
