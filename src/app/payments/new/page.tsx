import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { PaymentCreateForm } from "@/components/features/payments/payment-create-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getPaymentCreateContext } from "@/features/payments/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{
    invoiceId?: string;
    recordInvoiceId?: string;
    tenantId?: string;
  }>;
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
    getPaymentCreateContext(ownerUserId),
    searchParams,
  ]);

  const parsedInvoiceId = z
    .string()
    .uuid()
    .safeParse(rawSearch.invoiceId ?? rawSearch.recordInvoiceId);
  const parsedTenantId = z.string().uuid().safeParse(rawSearch.tenantId);

  return (
    <WorkspaceShell title="Record payment" profile={profile}>
      <PaymentCreateForm
        tenants={context.tenants}
        transientGuests={context.transientGuests}
        openInvoices={context.openInvoices}
        initialInvoiceId={parsedInvoiceId.success ? parsedInvoiceId.data : null}
        initialTenantId={parsedTenantId.success ? parsedTenantId.data : null}
        policiesComplete={context.policiesComplete}
        missingPolicyLabels={context.missingPolicyLabels}
        overpaymentPolicy={context.overpaymentPolicy}
        proofMaxBytes={context.proofMaxBytes}
        proofMaxFilesPerRecord={context.proofMaxFilesPerRecord}
      />
    </WorkspaceShell>
  );
}
