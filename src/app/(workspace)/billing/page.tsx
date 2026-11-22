import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { BillingWorkspace } from "@/components/features/billing/billing-workspace";
import { getBillingOverview } from "@/features/billing/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string }>;
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
  const parsedInvoiceId = z.string().uuid().safeParse(rawSearch.invoiceId);
  if (parsedInvoiceId.success) {
    redirect(`/billing/${parsedInvoiceId.data}`);
  }

  const initialOverview = await getBillingOverview(ownerUserId);

  return <BillingWorkspace initialOverview={initialOverview} />;
}
