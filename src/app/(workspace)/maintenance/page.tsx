import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { MaintenanceWorkspace } from "@/components/features/maintenance/maintenance-workspace";
import { getMaintenanceOverview } from "@/features/maintenance/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string }>;
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
  const parsedRequestId = z.string().uuid().safeParse(rawSearch.requestId);
  if (parsedRequestId.success) {
    redirect(`/maintenance/${parsedRequestId.data}`);
  }

  const initialOverview = await getMaintenanceOverview(ownerUserId);

  return <MaintenanceWorkspace initialOverview={initialOverview} />;
}
