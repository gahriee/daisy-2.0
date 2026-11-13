import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/features/auth/auth-shell";
import { ResetPasswordForm } from "@/components/features/auth/reset-password-form";
import { isOwner } from "@/server/auth/owner";

// Recovery is intentionally request-rendered and must not enter prerender caches.
export const instant = false;

export const metadata = {
  title: "Reset password · Daisy",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  await connection();
  let authenticated = false;
  try {
    authenticated = await isOwner();
  } catch {
    authenticated = false;
  }

  if (authenticated) {
    redirect("/");
  }

  return (
    <AuthShell
      backHref="/auth/sign-in"
      backLabel="Sign in"
      statement="Set a new password and get back to your rooms and guests."
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
