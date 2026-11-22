import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { MaintenanceCreateForm } from "@/components/features/maintenance/maintenance-create-form";
import { getMaintenanceCreateContext } from "@/features/maintenance/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function NewMaintenanceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ roomId?: string }>;
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
    getMaintenanceCreateContext(ownerUserId),
    searchParams,
  ]);

  const parsedRoomId = z.string().uuid().safeParse(rawSearch.roomId);

  return (
    <MaintenanceCreateForm
      rooms={context.rooms}
      proofMaxMb={context.proofMaxMb}
      proofMaxFilesPerRecord={context.proofMaxFilesPerRecord}
      initialRoomId={parsedRoomId.success ? parsedRoomId.data : null}
    />
  );
}
