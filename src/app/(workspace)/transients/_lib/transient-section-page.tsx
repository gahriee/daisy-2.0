import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  TransientsWorkspace,
  type TransientWorkspaceSection,
} from "@/components/features/transients/transients-workspace";
import { getTransientsOverview } from "@/features/transients/service";
import { isOwner } from "@/server/auth/owner";

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

  const initialOverview = await getTransientsOverview(ownerUserId);

  return (
    <TransientsWorkspace section={section} initialOverview={initialOverview} />
  );
}
