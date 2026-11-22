import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { PaymentDetailView } from "@/components/features/payments/payment-detail-view";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getPaymentDetail } from "@/features/payments/service";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
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

  const { paymentId } = await params;
  if (!z.string().uuid().safeParse(paymentId).success) {
    notFound();
  }

  const [profile, payment] = await Promise.all([
    getOwnerWorkspaceProfile(ownerUserId),
    getPaymentDetail(ownerUserId, paymentId),
  ]);

  if (!payment) {
    notFound();
  }

  return (
    <WorkspaceShell
      title={
        payment.receiptNumber
          ? `Receipt ${payment.receiptNumber}`
          : "Reversal entry"
      }
      profile={profile}
    >
      <PaymentDetailView payment={payment} />
    </WorkspaceShell>
  );
}
