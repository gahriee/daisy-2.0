import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/features/auth/auth-shell";
import { SignInPanel } from "@/components/features/auth/sign-in-panel";
import type { AuthSessionState } from "@/features/auth/sign-in/schemas";
import { isOwner } from "@/server/auth/owner";

// Sign-in inspects fresh request authority and must not enter prerender caches.
export const instant = false;

export const metadata = {
  title: "Sign in · Daisy",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  await connection();
  let authenticated = false;
  let initialSession: AuthSessionState = "unauthenticated";
  try {
    authenticated = await isOwner();
  } catch {
    initialSession = "unavailable";
  }

  if (authenticated) {
    redirect("/");
  }

  return (
    <AuthShell>
      <SignInPanel initialSession={initialSession} />
    </AuthShell>
  );
}
