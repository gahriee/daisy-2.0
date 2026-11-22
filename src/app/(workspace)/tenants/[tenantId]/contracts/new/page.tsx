import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { TenantContractForm } from "@/components/features/tenants/tenant-contract-form";
import { getTenantDetail } from "@/features/tenants/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function NewTenantContractPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
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

  const { tenantId } = await params;
  if (!z.string().uuid().safeParse(tenantId).success) {
    notFound();
  }

  const detail = await getTenantDetail(ownerUserId, tenantId);

  if (!detail) {
    notFound();
  }

  return (
    <TenantContractForm
      tenant={detail.tenant}
      assignments={detail.assignments}
    />
  );
}
