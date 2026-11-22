import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { InvoiceDetailView } from "@/components/features/billing/invoice-detail-view";
import { WorkspacePageTitle } from "@/components/layout/workspace-shell";
import { getInvoiceDetail } from "@/features/billing/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
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

  const { invoiceId } = await params;
  if (!z.string().uuid().safeParse(invoiceId).success) {
    notFound();
  }

  const detail = await getInvoiceDetail(ownerUserId, invoiceId);

  if (!detail) {
    notFound();
  }

  return (
    <>
      <WorkspacePageTitle
        title={detail.invoice.invoiceNumber ?? "Draft invoice"}
      />
      <InvoiceDetailView
        invoice={detail.invoice}
        hasInvoicePrefix={detail.hasInvoicePrefix}
      />
    </>
  );
}
