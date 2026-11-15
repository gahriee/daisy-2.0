import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { PaymentsWorkspace } from "@/components/features/payments/payments-workspace";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getPaymentsOverview } from "@/features/payments/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    paymentId?: string;
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

  const rawSearch = await searchParams;
  const parsedPaymentId = z.string().uuid().safeParse(rawSearch.paymentId);
  if (parsedPaymentId.success) {
    redirect(`/payments/${parsedPaymentId.data}`);
  }
  const parsedRecordInvoiceId = z
    .string()
    .uuid()
    .safeParse(rawSearch.recordInvoiceId);
  if (parsedRecordInvoiceId.success) {
    redirect(`/payments/new?invoiceId=${parsedRecordInvoiceId.data}`);
  }
  const parsedTenantId = z.string().uuid().safeParse(rawSearch.tenantId);
  if (parsedTenantId.success) {
    redirect(`/payments/new?tenantId=${parsedTenantId.data}`);
  }

  const [profile, initialOverview] = await Promise.all([
    getOwnerWorkspaceProfile(ownerUserId),
    getPaymentsOverview(ownerUserId),
  ]);

  return (
    <WorkspaceShell title="Payments" profile={profile}>
      <PaymentsWorkspace initialOverview={initialOverview} />
    </WorkspaceShell>
  );
}
