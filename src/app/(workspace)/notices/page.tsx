import { redirect } from "next/navigation";
import { connection } from "next/server";
import { NoticesWorkspace } from "@/components/features/notices/notices-workspace";
import { getNoticesOverview } from "@/features/notices/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function NoticesPage() {
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

  const initialOverview = await getNoticesOverview(ownerUserId);

  return <NoticesWorkspace initialOverview={initialOverview} />;
}
