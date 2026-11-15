import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { MaintenanceDetailView } from "@/components/features/maintenance/maintenance-detail-view";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getMaintenanceRequestDetail } from "@/features/maintenance/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function MaintenanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ created?: string }>;
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

  const [{ requestId }, rawSearch] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(requestId).success) {
    notFound();
  }

  const [profile, detail] = await Promise.all([
    getOwnerWorkspaceProfile(ownerUserId),
    getMaintenanceRequestDetail(ownerUserId, requestId),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <WorkspaceShell title={detail.request.title} profile={profile}>
      <MaintenanceDetailView
        request={detail.request}
        proofMaxMb={detail.proofMaxMb}
        proofMaxFilesPerRecord={detail.proofMaxFilesPerRecord}
        justCreated={rawSearch.created === "1"}
      />
    </WorkspaceShell>
  );
}
