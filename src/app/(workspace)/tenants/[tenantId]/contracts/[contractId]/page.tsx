import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { TenantContractDetail } from "@/components/features/tenants/tenant-contract-detail";
import { WorkspacePageTitle } from "@/components/layout/workspace-shell";
import { getTenantContractDetail } from "@/features/tenants/contracts";
import { getTenantDetail } from "@/features/tenants/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function TenantContractDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string; contractId: string }>;
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

  const { tenantId, contractId } = await params;
  if (
    !z.string().uuid().safeParse(tenantId).success ||
    !z.string().uuid().safeParse(contractId).success
  ) {
    notFound();
  }

  const [detail, contract] = await Promise.all([
    getTenantDetail(ownerUserId, tenantId),
    getTenantContractDetail(ownerUserId, tenantId, contractId),
  ]);

  if (!detail || !contract) {
    notFound();
  }

  return (
    <>
      <WorkspacePageTitle title={contract.title} />
      <TenantContractDetail tenant={detail.tenant} contract={contract} />
    </>
  );
}
