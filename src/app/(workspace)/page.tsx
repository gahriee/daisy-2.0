import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DashboardWorkspace } from "@/components/features/dashboard/dashboard-workspace";
import { getDashboardSnapshot } from "@/features/dashboard/service";
import { isOwner } from "@/server/auth/owner";

// Dashboard inspects fresh request authority and must not enter prerender caches.
export const instant = false;

export default async function Home() {
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

  const snapshot = await getDashboardSnapshot(ownerUserId);

  return <DashboardWorkspace initialSnapshot={snapshot} />;
}
