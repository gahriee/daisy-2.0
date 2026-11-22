import { redirect } from "next/navigation";
import { connection } from "next/server";
import { RoomsWorkspace } from "@/components/features/rooms/rooms-workspace";
import { listInventoryOverview } from "@/features/rooms/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function TransientRoomsPage() {
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

  const overview = await listInventoryOverview(ownerUserId, {
    building: "TRANSIENT",
  });

  return <RoomsWorkspace building="TRANSIENT" initialOverview={overview} />;
}
