import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { MaintenanceDetailView } from "@/components/features/maintenance/maintenance-detail-view";
import { WorkspacePageTitle } from "@/components/layout/workspace-shell";
import { getMaintenanceRequestDetail } from "@/features/maintenance/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
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

  const { requestId } = await params;
  if (!z.string().uuid().safeParse(requestId).success) {
    notFound();
  }

  const detail = await getMaintenanceRequestDetail(ownerUserId, requestId);

  if (!detail) {
    notFound();
  }

  return (
    <>
      <WorkspacePageTitle title={detail.request.title} />
      <MaintenanceDetailView
        request={detail.request}
        proofMaxMb={detail.proofMaxMb}
        proofMaxFilesPerRecord={detail.proofMaxFilesPerRecord}
      />
    </>
  );
}
