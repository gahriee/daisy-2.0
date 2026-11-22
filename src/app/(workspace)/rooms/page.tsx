import { redirect } from "next/navigation";
import { connection } from "next/server";
import { RoomsWorkspace } from "@/components/features/rooms/rooms-workspace";
import { listInventoryOverview } from "@/features/rooms/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function RoomsPage() {
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

  const initialOverview = await listInventoryOverview(ownerUserId, {
    building: "BOARDING",
  });

  return <RoomsWorkspace initialOverview={initialOverview} />;
}
