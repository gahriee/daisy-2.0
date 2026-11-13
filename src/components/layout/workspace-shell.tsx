"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DaisyBrand } from "@/components/layout/daisy-brand";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarLink,
  SidebarNav,
  SidebarNavDisclosure,
  SidebarSubLink,
} from "@/components/ui/sidebar";
import {
  Topbar,
  TopbarActions,
  TopbarLeft,
  TopbarMenuButton,
  TopbarTitle,
} from "@/components/ui/topbar";
import { cn } from "@/lib/cn";
import { formatManilaDateTime } from "@/lib/dates";
import type { OwnerWorkspaceProfile } from "@/server/auth/workspace-profile";
import type { OwnerNotification } from "@/server/notifications/service";

const SIDEBAR_STORAGE_KEY = "daisy:sidebar-collapsed";
const sidebarListeners = new Set<() => void>();

function subscribeSidebarCollapsed(callback: () => void) {
  sidebarListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    sidebarListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSidebarCollapsedSnapshot(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getSidebarCollapsedServerSnapshot(): boolean {
  return false;
}

const ROOMS_SECTIONS = [
  { href: "/rooms", label: "Rooms & beds" },
  { href: "/rooms/types", label: "Room types" },
] as const;

const SETTINGS_SECTIONS = [
  { tab: "profile", label: "Property profile" },
  { tab: "policies", label: "Billing & policies" },
  { tab: "operations", label: "Stays & limits" },
  { tab: "devices", label: "Trusted devices" },
] as const;

function getInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DY";
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? "DY").toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function DashboardIcon() {
  return (
    <svg
      aria-hidden="true"
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

function RoomsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4.5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 16V6.5a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5V16" />
      <path d="M3.5 11.5h13" />
      <path d="M6.5 9.25h2.75" />
      <path d="M10.75 9.25h2.75" />
      <path d="M3.5 16h13" />
    </svg>
  );
}

function TenantsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4.5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="7" r="2.75" />
      <path d="M3.5 16c.5-2.6 2.2-4 4.5-4s4 1.4 4.5 4" />
      <path d="M13.5 5.25a2.25 2.25 0 0 1 0 4.5" />
      <path d="M16.5 16c-.35-1.85-1.4-3.1-3-3.65" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4.5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 3.5h10a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V5A1.5 1.5 0 0 1 5 3.5Z" />
      <path d="M6.5 7.5h7" />
      <path d="M6.5 10.5h7" />
      <path d="M6.5 13.5h4.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4.5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="2.75" />
      <path d="M10 2.75v1.5M10 15.75v1.5M4.87 4.87l1.06 1.06M14.07 14.07l1.06 1.06M2.75 10h1.5M15.75 10h1.5M4.87 15.13l1.06-1.06M14.07 5.93l1.06-1.06" />
    </svg>
  );
}

function TokensIcon() {
  return (
    <svg
      aria-hidden="true"
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

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4.5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3a4.5 4.5 0 0 0-4.5 4.5v2.9L4 12.75a.75.75 0 0 0 .64 1.15h10.72a.75.75 0 0 0 .64-1.15L14.5 10.4V7.5A4.5 4.5 0 0 0 10 3Z" />
      <path d="M8.25 14a1.75 1.75 0 0 0 3.5 0" />
    </svg>
  );
}

function SettingsSubLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab =
    pathname === "/settings" ? (searchParams.get("tab") ?? "profile") : "";

  return (
    <>
      {SETTINGS_SECTIONS.map((item) => (
        <SidebarSubLink
          key={item.tab}
          href={`/settings?tab=${item.tab}`}
          active={activeTab === item.tab}
          onClick={onNavigate}
        >
          {item.label}
        </SidebarSubLink>
      ))}
    </>
  );
}

function TopbarBreadcrumb({ title }: { title: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  let parentCrumb: { label: string; href: string } | null = null;
  let sectionTitle: string | null = null;
  if (pathname === "/settings") {
    const tab = searchParams.get("tab") ?? "profile";
    const found = SETTINGS_SECTIONS.find((s) => s.tab === tab);
    parentCrumb = { label: title, href: "/settings" };
    sectionTitle = found ? found.label : "Property profile";
  } else if (
    pathname === "/rooms/types" ||
    pathname.startsWith("/rooms/types/")
  ) {
    parentCrumb = { label: "Rooms & beds", href: "/rooms" };
    sectionTitle = title;
  } else if (pathname.startsWith("/tenants/") && pathname !== "/tenants") {
    parentCrumb = { label: "Tenants", href: "/tenants" };
    sectionTitle = title;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
      {parentCrumb && sectionTitle ? (
        <>
          <Link
            href={parentCrumb.href}
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            {parentCrumb.label}
          </Link>
          <span
            aria-hidden="true"
            className="hidden text-sm text-border sm:inline"
          >
            &gt;
          </span>
          <TopbarTitle>{sectionTitle}</TopbarTitle>
        </>
      ) : (
        <TopbarTitle>{title}</TopbarTitle>
      )}
    </nav>
  );
}

function TopbarOwnerControls({ profile }: { profile: OwnerWorkspaceProfile }) {
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<OwnerNotification[]>([]);
  const [notifLoaded, setNotifLoaded] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/notifications", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          notifications?: OwnerNotification[];
        };
        if (active && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
          setNotifLoaded(true);
        }
      })
      .catch(() => {
        // Ignore unauthenticated/offline failures cleanly on public/static pages.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!notifOpen && !profileOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [notifOpen, profileOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markAllRead() {
    const unreadKeys = notifications.filter((n) => !n.read).map((n) => n.key);
    if (unreadKeys.length === 0 || markingRead) return;
    setMarkingRead(true);
    try {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: unreadKeys }),
        cache: "no-store",
      });
      if (response.ok) {
        const nowIso = new Date().toISOString();
        setNotifications((prev) =>
          prev.map((item) => ({
            ...item,
            read: true,
            readAt: item.readAt ?? nowIso,
          })),
        );
      }
    } finally {
      setMarkingRead(false);
    }
  }

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
      setProfileOpen(false);
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
    <div
      ref={containerRef}
      className="relative flex items-center gap-1.5 sm:gap-2"
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setProfileOpen(false);
            setNotifOpen((open) => !open);
          }}
          aria-expanded={notifOpen}
          aria-haspopup="dialog"
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
          className="relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted hover:text-foreground"
        >
          <BellIcon />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1 inline-flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">
              {unreadCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div
            role="dialog"
            aria-label="Owner notifications"
            className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-panel border border-border bg-surface p-3 shadow-[0_12px_28px_-16px_rgb(34_34_34/0.18)]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border pb-2.5">
              <span className="text-sm font-semibold text-foreground">
                Notifications
              </span>
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={markingRead}
                  onClick={markAllRead}
                >
                  Mark read
                </Button>
              )}
            </div>

            <div className="mt-2.5 grid max-h-72 gap-2 overflow-y-auto">
              {!notifLoaded || notifications.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No active alerts right now.
                </p>
              ) : (
                notifications.map((item) => (
                  <Link
                    key={item.key}
                    href={item.destination}
                    onClick={() => setNotifOpen(false)}
                    className={cn(
                      "grid gap-1 rounded-control border p-2.5 text-left transition-colors hover:bg-background",
                      item.read
                        ? "border-border bg-surface"
                        : "border-warning-border bg-warning-surface/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {item.title}
                      </span>
                      {!item.read && <Badge tone="warning">Unread</Badge>}
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {item.message}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setNotifOpen(false);
            setProfileOpen((open) => !open);
          }}
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-xs font-semibold text-foreground"
          >
            {getInitials(profile.ownerName)}
          </span>
          <span className="hidden max-w-36 truncate text-sm font-medium text-foreground sm:inline">
            {profile.ownerName}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-(--duration-control) ease-(--ease-control)",
              profileOpen && "rotate-180",
            )}
          >
            <path d="M4.25 6.25 8 10l3.75-3.75" />
          </svg>
        </button>

        {profileOpen && (
          <div
            role="menu"
            aria-label="Owner account menu"
            className="absolute right-0 z-50 mt-2 w-60 rounded-panel border border-border bg-surface p-2 shadow-[0_12px_28px_-16px_rgb(34_34_34/0.18)]"
          >
            <div className="grid gap-0.5 border-b border-border px-2.5 py-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {profile.ownerName}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {profile.businessName}
              </span>
            </div>

            <div className="grid gap-0.5 py-1.5">
              <Link
                role="menuitem"
                href="/settings?tab=profile"
                onClick={() => setProfileOpen(false)}
                className="flex min-h-10 items-center rounded-control px-2.5 text-sm text-foreground transition-colors hover:bg-surface-muted"
              >
                Property profile
              </Link>
              <Link
                role="menuitem"
                href="/settings?tab=devices"
                onClick={() => setProfileOpen(false)}
                className="flex min-h-10 items-center rounded-control px-2.5 text-sm text-foreground transition-colors hover:bg-surface-muted"
              >
                Trusted devices
              </Link>
              <Link
                role="menuitem"
                href="/audit"
                onClick={() => setProfileOpen(false)}
                className="flex min-h-10 items-center rounded-control px-2.5 text-sm text-foreground transition-colors hover:bg-surface-muted"
              >
                Audit log
              </Link>
            </div>

            <div className="grid gap-1.5 border-t border-border pt-1.5">
              {signOutError && (
                <Alert tone="danger" role="alert" className="text-xs">
                  {signOutError}
                </Alert>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={signingOut}
                onClick={handleSignOut}
                className="flex min-h-10 w-full cursor-pointer items-center justify-between rounded-control px-2.5 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-surface disabled:opacity-50"
              >
                <span>{signingOut ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ManilaDateTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const syncClock = () => setNow(new Date());
    const initial = window.setTimeout(syncClock, 0);
    const interval = window.setInterval(syncClock, 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="grid px-1">
      <span className="text-[11px] leading-4 text-muted-foreground">
        Asia/Manila
      </span>
      <time
        dateTime={now ? now.toISOString() : undefined}
        className="truncate text-xs font-semibold text-foreground tabular-nums"
      >
        {now ? formatManilaDateTime(now) : "—"}
      </time>
    </div>
  );
}

type WorkspaceShellProps = {
  title: string;
  profile?: OwnerWorkspaceProfile;
  primaryAction?: {
    label: string;
    href: string;
  };
  children: ReactNode;
};

/**
 * Sticky, collapsible desktop navigation rail + mobile slide-over drawer +
 * sticky opaque topbar with breadcrumbs, notifications, and Owner profile menu.
 */
export function WorkspaceShell({
  title,
  profile = {
    ownerName: "Property Owner",
    businessName: "Daisy Workspace",
  },
  primaryAction,
  children,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarCollapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getSidebarCollapsedSnapshot,
    getSidebarCollapsedServerSnapshot,
  );
  const [roomsNavExpanded, setRoomsNavExpanded] = useState(() =>
    pathname.startsWith("/rooms"),
  );
  const [settingsNavExpanded, setSettingsNavExpanded] = useState(
    () => pathname === "/settings",
  );

  function toggleSidebarCollapse() {
    const next = !getSidebarCollapsedSnapshot();
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage write errors.
    }
    for (const listener of sidebarListeners) {
      listener();
    }
  }

  function handleRoomsDisclosureToggle() {
    if (sidebarCollapsed) {
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "0");
      } catch {
        // Ignore storage write errors.
      }
      for (const listener of sidebarListeners) {
        listener();
      }
      setRoomsNavExpanded(true);
      return;
    }
    setRoomsNavExpanded((open) => !open);
  }

  function handleSettingsDisclosureToggle() {
    if (sidebarCollapsed) {
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "0");
      } catch {
        // Ignore storage write errors.
      }
      for (const listener of sidebarListeners) {
        listener();
      }
      setSettingsNavExpanded(true);
      return;
    }
    setSettingsNavExpanded((open) => !open);
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
        collapsed={sidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
      >
        <SidebarHeader onClose={() => setSidebarOpen(false)}>
          <DaisyBrand show="lockup" className="lg:hidden" />
          <DaisyBrand
            show={sidebarCollapsed ? "icon" : "lockup"}
            className="hidden lg:inline-flex"
          />
        </SidebarHeader>

        <SidebarContent className="gap-3 py-3">
          <SidebarGroup>
            <SidebarNav aria-label="Primary navigation">
              <SidebarLink
                href="/"
                active={pathname === "/"}
                icon={<DashboardIcon />}
                {...(sidebarCollapsed ? { title: "Dashboard" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Dashboard
              </SidebarLink>
              <SidebarNavDisclosure
                label="Rooms & beds"
                icon={<RoomsIcon />}
                active={pathname.startsWith("/rooms")}
                expanded={roomsNavExpanded}
                onToggle={handleRoomsDisclosureToggle}
              >
                {ROOMS_SECTIONS.map((item) => {
                  const isItemActive =
                    item.href === "/rooms"
                      ? pathname === "/rooms"
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);

                  return (
                    <SidebarSubLink
                      key={item.href}
                      href={item.href}
                      active={isItemActive}
                      onClick={() => setSidebarOpen(false)}
                    >
                      {item.label}
                    </SidebarSubLink>
                  );
                })}
              </SidebarNavDisclosure>
              <SidebarLink
                href="/tenants"
                active={pathname.startsWith("/tenants")}
                icon={<TenantsIcon />}
                {...(sidebarCollapsed ? { title: "Tenants" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Tenants
              </SidebarLink>
              <SidebarLink
                href="/audit"
                active={pathname === "/audit"}
                icon={<AuditIcon />}
                {...(sidebarCollapsed ? { title: "Audit log" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Audit log
              </SidebarLink>
              <SidebarNavDisclosure
                label="Settings"
                icon={<SettingsIcon />}
                active={pathname === "/settings"}
                expanded={settingsNavExpanded}
                onToggle={handleSettingsDisclosureToggle}
              >
                <Suspense fallback={null}>
                  <SettingsSubLinks onNavigate={() => setSidebarOpen(false)} />
                </Suspense>
              </SidebarNavDisclosure>
            </SidebarNav>
          </SidebarGroup>

          <SidebarGroup className="border-t border-border pt-3">
            <SidebarNav aria-label="System references">
              <SidebarLink
                href="/design-system"
                active={pathname === "/design-system"}
                icon={<TokensIcon />}
                {...(sidebarCollapsed ? { title: "Design system" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Design system
              </SidebarLink>
            </SidebarNav>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter onToggleCollapse={toggleSidebarCollapse}>
          <ManilaDateTime />
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
            <Suspense fallback={<TopbarTitle>{title}</TopbarTitle>}>
              <TopbarBreadcrumb title={title} />
            </Suspense>
          </TopbarLeft>

          <TopbarActions>
            {primaryAction && (
              <Link
                href={primaryAction.href}
                className={buttonClasses({ size: "sm" })}
              >
                {primaryAction.label}
              </Link>
            )}
            <TopbarOwnerControls profile={profile} />
          </TopbarActions>
        </Topbar>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-4 outline-none sm:px-5 sm:py-5 lg:px-6 lg:py-6"
        >
          <div className="grid w-full gap-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
