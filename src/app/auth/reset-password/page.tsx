import { connection } from "next/server";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/features/auth/reset-password-form";

// Recovery is intentionally request-rendered and must not enter prerender caches.
export const instant = false;

export const metadata = {
  title: "Reset password · Daisy",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  await connection();
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-8 px-5 py-12 sm:px-8">
      <header className="grid gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 w-fit items-center text-lg font-semibold text-primary"
          aria-label="Daisy home"
        >
          Daisy
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Get an email code to set your first password or replace one you’ve
          forgotten.
        </p>
      </header>
      <ResetPasswordForm />
    </main>
  );
}
