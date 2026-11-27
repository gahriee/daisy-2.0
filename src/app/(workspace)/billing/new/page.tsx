import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { InvoiceCreateForm } from "@/components/features/billing/invoice-create-form";
import { getBillingCreateContext } from "@/features/billing/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string; transientGuestId?: string }>;
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

  const [context, rawSearch] = await Promise.all([
    getBillingCreateContext(ownerUserId),
    searchParams,
  ]);

  const parsedTenantId = z.string().uuid().safeParse(rawSearch.tenantId);
  const parsedTransientGuestId = z
    .string()
    .uuid()
    .safeParse(rawSearch.transientGuestId);

  return (
    <InvoiceCreateForm
      tenants={context.tenants}
      transientGuests={context.transientGuests}
      hasInvoicePrefix={context.hasInvoicePrefix}
      initialTenantId={parsedTenantId.success ? parsedTenantId.data : null}
      initialTransientGuestId={
        parsedTransientGuestId.success ? parsedTransientGuestId.data : null
      }
    />
  );
}
