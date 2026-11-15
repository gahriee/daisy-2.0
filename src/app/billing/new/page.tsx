import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { InvoiceCreateForm } from "@/components/features/billing/invoice-create-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getBillingCreateContext } from "@/features/billing/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
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
    getBillingCreateContext(ownerUserId),
    searchParams,
  ]);

  const parsedTenantId = z.string().uuid().safeParse(rawSearch.tenantId);

  return (
    <WorkspaceShell title="Create invoice" profile={profile}>
      <InvoiceCreateForm
        tenants={context.tenants}
        defaultPeriod={context.currentBillingPeriod}
        hasInvoicePrefix={context.hasInvoicePrefix}
        initialTenantId={parsedTenantId.success ? parsedTenantId.data : null}
      />
    </WorkspaceShell>
  );
}
