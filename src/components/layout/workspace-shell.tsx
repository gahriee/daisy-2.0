"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DaisyBrand } from "@/components/layout/daisy-brand";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarLink,
  SidebarNav,
} from "@/components/ui/sidebar";
import {
  Topbar,
  TopbarActions,
  TopbarLeft,
  TopbarMenuButton,
  TopbarTitle,
} from "@/components/ui/topbar";

function DashboardIcon() {
  return (
    <svg
      className="size-4.5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="6" height="6" rx="1.25" />
      <rect x="11" y="3" width="6" height="6" rx="1.25" />
      <rect x="3" y="11" width="6" height="6" rx="1.25" />
      <rect x="11" y="11" width="6" height="6" rx="1.25" />
    </svg>
  );
}

function TokensIcon() {
  return (
    <svg
      className="size-4.5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="14" height="5" rx="1.25" />
      <rect x="3" y="11" width="6" height="5" rx="1.25" />
      <rect x="11" y="11" width="6" height="5" rx="1.25" />
    </svg>
  );
}

type WorkspaceShellProps = {
  title: string;
  primaryAction?: {
    label: string;
    href: string;
  };
  children: ReactNode;
};

/**
 * Desktop persistent sidebar + mobile slide-over drawer + sticky opaque topbar
 * enclosing Daisy's workspace content, including session sign-out.
 */
export function WorkspaceShell({
  title,
  primaryAction,
  children,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function handleSignOut() {
    if (signingOut) return;
    setSignOutError("");
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        setSignOutError(
          response.status >= 500
            ? "Could not reach the sign-out service. Try again."
            : "Sign-out could not be confirmed. Reload and try again.",
        );
        return;
      }
      setSidebarOpen(false);
      router.replace("/auth/sign-in");
      router.refresh();
    } catch {
      setSignOutError(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "Connect to the internet to sign out."
          : "Connection interrupted before sign-out finished.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-svh w-full bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-control focus:bg-foreground focus:px-4 focus:text-sm focus:font-medium focus:text-surface"
      >
        Skip to content
      </a>

      <Sidebar
        id="workspace-sidebar"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      >
        <SidebarHeader onClose={() => setSidebarOpen(false)}>
          <DaisyBrand />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup aria-labelledby="nav-workspace-heading">
            <SidebarGroupLabel id="nav-workspace-heading">
              Workspace
            </SidebarGroupLabel>
            <SidebarNav aria-label="Workspace navigation">
              <SidebarLink
                href="/"
                active={pathname === "/"}
                icon={<DashboardIcon />}
                onClick={() => setSidebarOpen(false)}
              >
                Dashboard
              </SidebarLink>
            </SidebarNav>
          </SidebarGroup>

          <SidebarGroup aria-labelledby="nav-system-heading">
            <SidebarGroupLabel id="nav-system-heading">
              System
            </SidebarGroupLabel>
            <SidebarNav aria-label="System references">
              <SidebarLink
                href="/design-system"
                active={pathname === "/design-system"}
                icon={<TokensIcon />}
                onClick={() => setSidebarOpen(false)}
              >
                Design system
              </SidebarLink>
            </SidebarNav>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="grid gap-2">
            {signOutError && (
              <Alert tone="danger" role="alert">
                {signOutError}
              </Alert>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={signingOut}
              disabled={signingOut}
              onClick={handleSignOut}
              className="w-full"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar>
          <TopbarLeft>
            <TopbarMenuButton
              expanded={sidebarOpen}
              controls="workspace-sidebar"
              onClick={() => setSidebarOpen((open) => !open)}
            />
            <TopbarTitle>{title}</TopbarTitle>
          </TopbarLeft>

          {primaryAction && (
            <TopbarActions>
              <Link href={primaryAction.href} className={buttonClasses()}>
                {primaryAction.label}
              </Link>
            </TopbarActions>
          )}
        </Topbar>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8"
        >
          <div className="mx-auto grid w-full max-w-5xl gap-6 sm:gap-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
