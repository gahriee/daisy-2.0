import { redirect } from "next/navigation";
import { connection } from "next/server";
import { RoomForm } from "@/components/features/rooms/room-form";
import { getRoomCreateContext } from "@/features/rooms/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function NewRoomPage() {
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

  const context = await getRoomCreateContext(ownerUserId, "BOARDING");

  return <RoomForm mode="create" roomTypes={context.activeRoomTypes} />;
}
