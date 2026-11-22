import { redirect } from "next/navigation";
import { connection } from "next/server";
import { TenantsWorkspace } from "@/components/features/tenants/tenants-workspace";
import { listTenantsOverview } from "@/features/tenants/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function TenantsPage() {
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

  const initialOverview = await listTenantsOverview(ownerUserId);

  return <TenantsWorkspace initialOverview={initialOverview} />;
}
