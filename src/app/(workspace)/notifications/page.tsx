import { redirect } from "next/navigation";
import { connection } from "next/server";
import { NotificationsWorkspace } from "@/components/features/notifications/notifications-workspace";
import { isOwner } from "@/server/auth/owner";
import { listOwnerNotifications } from "@/server/notifications/service";

export const instant = false;

export default async function NotificationsPage() {
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

  const notifications = await listOwnerNotifications(ownerUserId);

  return <NotificationsWorkspace initialNotifications={notifications} />;
}
