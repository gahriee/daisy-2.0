import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { MaintenanceCreateForm } from "@/components/features/maintenance/maintenance-create-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getMaintenanceCreateContext } from "@/features/maintenance/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function NewMaintenanceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ roomId?: string }>;
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

  const [profile, context, rawSearch] = await Promise.all([
    getOwnerWorkspaceProfile(ownerUserId),
    getMaintenanceCreateContext(ownerUserId),
    searchParams,
  ]);

  const parsedRoomId = z.string().uuid().safeParse(rawSearch.roomId);

  return (
    <WorkspaceShell title="Log maintenance request" profile={profile}>
      <MaintenanceCreateForm
        rooms={context.rooms}
        proofMaxMb={context.proofMaxMb}
        proofMaxFilesPerRecord={context.proofMaxFilesPerRecord}
        initialRoomId={parsedRoomId.success ? parsedRoomId.data : null}
      />
    </WorkspaceShell>
  );
}
