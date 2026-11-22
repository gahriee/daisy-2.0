import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ReportsWorkspace } from "@/components/features/reports/reports-workspace";
import { getReportsOverview } from "@/features/reports/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function ReportsPage() {
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

  const overview = await getReportsOverview(ownerUserId);

  return <ReportsWorkspace initialOverview={overview} />;
}
