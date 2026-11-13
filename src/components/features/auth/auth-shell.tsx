import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { DaisyBrand } from "@/components/layout/daisy-brand";

type AuthShellProps = {
  backHref?: string;
  backLabel?: string;
  statement?: string;
  children: ReactNode;
};

/**
 * Asymmetric 7:5 auth layout pairing a crisp white entry pane with a warm stone
 * right-hand illustration panel and a single closing statement.
 */
export function AuthShell({
  backHref,
  backLabel,
  statement = "Every room, boarder, and guest stay kept clear in one place.",
  children,
}: AuthShellProps) {
  return (
    <div className="min-h-svh w-full bg-surface text-foreground lg:grid lg:grid-cols-12">
      <a
        href="#auth-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-control focus:bg-foreground focus:px-4 focus:text-sm focus:font-medium focus:text-surface"
      >
        Skip to content
      </a>

      <div className="flex min-h-svh flex-col justify-between bg-surface lg:col-span-7">
        <header className="flex items-center justify-between border-b border-border px-4 py-2 sm:px-8 lg:border-b-0 lg:px-12 lg:pt-8">
          <DaisyBrand href="/auth/sign-in" />
          {backHref && backLabel && (
            <Link
              href={backHref}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-3 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted hover:text-foreground"
            >
              {backLabel}
            </Link>
          )}
        </header>

        <main
          id="auth-main"
          tabIndex={-1}
          className="flex flex-1 flex-col items-center justify-center px-5 py-8 outline-none sm:px-8 lg:px-12"
        >
          <div className="w-full max-w-[400px]">{children}</div>
        </main>

        <footer className="flex items-center justify-between border-t border-border/70 px-5 py-4 text-xs text-muted-foreground sm:px-8 lg:px-12">
          <span>Daisy</span>
          <span>Boarding house &amp; transient stays</span>
        </footer>
      </div>

      <aside
        aria-label="Daisy boarding house illustration"
        className="hidden border-l border-border bg-background lg:col-span-5 lg:flex lg:min-h-svh lg:flex-col lg:justify-between lg:p-10 xl:p-14"
      >
        <div className="flex flex-1 items-center justify-center py-8">
          <Image
            src="/illustrations/sweet-home.svg"
            alt=""
            width={960}
            height={749}
            unoptimized
            aria-hidden="true"
            className="h-auto w-full max-w-[460px] select-none"
          />
        </div>

        <div className="border-t border-border pt-6">
          <p className="max-w-[26ch] text-xl font-semibold tracking-tight leading-snug text-foreground xl:text-2xl">
            {statement}
          </p>
        </div>
      </aside>
    </div>
  );
}
