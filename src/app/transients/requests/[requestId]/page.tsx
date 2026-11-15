import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { BookingRequestDetail } from "@/components/features/transients/booking-request-detail";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getBookingRequestDetail } from "@/features/transients/service";
import { NotFoundError } from "@/lib/errors";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function BookingRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
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

  const { requestId } = await params;
  if (!z.string().uuid().safeParse(requestId).success) {
    notFound();
  }

  const profile = await getOwnerWorkspaceProfile(ownerUserId);

  let detail;
  try {
    detail = await getBookingRequestDetail(ownerUserId, requestId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <WorkspaceShell
      title={`Booking request ${detail.request.referenceCode}`}
      profile={profile}
    >
      <BookingRequestDetail detail={detail} />
    </WorkspaceShell>
  );
}
