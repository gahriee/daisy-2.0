import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { TenantContractDetail } from "@/components/features/tenants/tenant-contract-detail";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getTenantContractDetail } from "@/features/tenants/contracts";
import { getTenantDetail } from "@/features/tenants/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function TenantContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; contractId: string }>;
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

  const [{ tenantId, contractId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  if (
    !z.string().uuid().safeParse(tenantId).success ||
    !z.string().uuid().safeParse(contractId).success
  ) {
    notFound();
  }

  const [profile, detail, contract] = await Promise.all([
    getOwnerWorkspaceProfile(ownerUserId),
    getTenantDetail(ownerUserId, tenantId),
    getTenantContractDetail(ownerUserId, tenantId, contractId),
  ]);

  if (!detail || !contract) {
    notFound();
  }

  return (
    <WorkspaceShell title={contract.title} profile={profile}>
      <TenantContractDetail
        tenant={detail.tenant}
        contract={contract}
        justCreated={resolvedSearchParams.created === "1"}
      />
    </WorkspaceShell>
  );
}
