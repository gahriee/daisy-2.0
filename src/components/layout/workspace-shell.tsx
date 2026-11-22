"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DaisyBrand } from "@/components/layout/daisy-brand";
import { NotificationCard } from "@/components/features/notifications/notification-card";
import { OfflineStatusBar } from "@/components/features/offline/offline-status-bar";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "@/components/ui/toaster";
import {
  chunkNotificationKeys,
  NOTIFICATIONS_UPDATED_EVENT,
  sortOwnerNotifications,
  type OwnerNotification,
} from "@/features/notifications/schemas";
import { cn } from "@/lib/cn";
import { formatManilaDateTime } from "@/lib/dates";
import type { OwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

const SIDEBAR_STORAGE_KEY = "daisy:sidebar-collapsed";
const SIDEBAR_ROOMS_STORAGE_KEY = "daisy:sidebar-nav:rooms";
const SIDEBAR_TRANSIENTS_STORAGE_KEY = "daisy:sidebar-nav:transients";
const SIDEBAR_TRANSIENT_ROOMS_STORAGE_KEY = "daisy:sidebar-nav:transient-rooms";
const SIDEBAR_SETTINGS_STORAGE_KEY = "daisy:sidebar-nav:settings";
const sidebarListeners = new Set<() => void>();

function subscribeSidebarState(callback: () => void) {
  sidebarListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    sidebarListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readSidebarFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeSidebarFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Ignore storage write errors.
  }
  for (const listener of sidebarListeners) {
    listener();
  }
}

const ROOMS_SECTIONS = [
  { href: "/rooms", label: "Rooms" },
  { href: "/rooms/types", label: "Room types" },
] as const;

const TRANSIENTS_SECTIONS = [
  { href: "/transients/stays", label: "Stays & reservations" },
  { href: "/transients/requests", label: "Booking requests" },
] as const;

const TRANSIENT_ROOMS_SECTIONS = [
  { href: "/transients/rooms", label: "Rooms" },
  { href: "/transients/rooms/types", label: "Room types" },
] as const;

const SETTINGS_SECTIONS = [
  { href: "/settings/policies", label: "Billing & policies" },
  { href: "/settings/operations", label: "Stays & limits" },
  { href: "/settings/sms", label: "Overdue SMS" },
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

function ReportsIcon() {
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
      <path d="M4 16.5h12" />
      <path d="M6 16.5v-5" />
      <path d="M10 16.5v-9" />
      <path d="M14 16.5V5.5" />
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

function BillingIcon() {
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
      <path d="M5.5 3.25h9a1.25 1.25 0 0 1 1.25 1.25v12.25l-2.25-1.4-2.25 1.4-2.25-1.4-2.25 1.4-2.5-1.4V4.5A1.25 1.25 0 0 1 5.5 3.25Z" />
      <path d="M7.5 7.25h5" />
      <path d="M7.5 10.25h5" />
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

function PaymentsIcon() {
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
      <rect x="2.75" y="4.5" width="14.5" height="11" rx="1.75" />
      <path d="M2.75 8.25h14.5" />
      <path d="M6 12.25h3.5" />
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

function TransientsIcon() {
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
      <rect x="3" y="4.5" width="14" height="12.5" rx="1.75" />
      <path d="M6.5 2.75v3M13.5 2.75v3M3 8.25h14" />
      <path d="m7.75 12.5 1.75 1.75 3.25-3.25" />
    </svg>
  );
}

function MaintenanceIcon() {
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
      <path d="M12.5 3.75a3.75 3.75 0 0 0-4.95 4.95L4.1 12.15a1.5 1.5 0 1 0 2.12 2.12l3.45-3.45a3.75 3.75 0 0 0 4.95-4.95l-2.05 2.05-1.95-.42-.42-1.95 2.3-1.8Z" />
      <path d="m11.5 12 4.25 4.25" />
    </svg>
  );
}

function NoticesIcon() {
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
      <path d="M4.25 8.5v3a1.5 1.5 0 0 0 1.5 1.5h2l4.75 2.75V4.25L7.75 7h-2a1.5 1.5 0 0 0-1.5 1.5Z" />
      <path d="M15 7.5a3.5 3.5 0 0 1 0 5" />
      <path d="M6.5 13v2.75" />
    </svg>
  );
}

function SettingsSubLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {SETTINGS_SECTIONS.map((item) => (
        <SidebarSubLink
          key={item.href}
          href={item.href}
          active={pathname === item.href}
          onClick={onNavigate}
        >
          {item.label}
        </SidebarSubLink>
      ))}
    </>
  );
}

const SUBROUTE_PARENT_CRUMBS: ReadonlyArray<{
  prefix: string;
  label: string;
  href: string;
}> = [
  { prefix: "/rooms/types", label: "Boarding rooms", href: "/rooms" },
  { prefix: "/rooms/", label: "Boarding rooms", href: "/rooms" },
  { prefix: "/tenants/", label: "Tenants", href: "/tenants" },
  {
    prefix: "/transients/rooms/types",
    label: "Transient rooms",
    href: "/transients/rooms",
  },
  {
    prefix: "/transients/rooms/",
    label: "Transient rooms",
    href: "/transients/rooms",
  },
  {
    prefix: "/transients/requests/",
    label: "Booking requests",
    href: "/transients/requests",
  },
  {
    prefix: "/transients/",
    label: "Stays & requests",
    href: "/transients/stays",
  },
  { prefix: "/billing/", label: "Billing", href: "/billing" },
  { prefix: "/payments/", label: "Payments", href: "/payments" },
  { prefix: "/maintenance/", label: "Maintenance", href: "/maintenance" },
];

function TopbarBreadcrumb({ title }: { title: string }) {
  const pathname = usePathname();

  let parentCrumb: { label: string; href: string } | null = null;
  let sectionTitle: string | null = null;
  if (pathname.startsWith("/settings")) {
    const found = SETTINGS_SECTIONS.find((s) => s.href === pathname);
    if (found) {
      parentCrumb = { label: "Settings", href: "/settings/policies" };
      sectionTitle = found.label;
    }
  } else {
    const matched = SUBROUTE_PARENT_CRUMBS.find((entry) =>
      pathname.startsWith(entry.prefix),
    );
    if (matched) {
      parentCrumb = { label: matched.label, href: matched.href };
      sectionTitle = title;
    }
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

    function handleNotificationsUpdated(event: Event) {
      const customEvent = event as CustomEvent<{
        notifications?: OwnerNotification[];
      }>;
      if (Array.isArray(customEvent.detail?.notifications)) {
        setNotifications(customEvent.detail.notifications);
        setNotifLoaded(true);
      }
    }

    window.addEventListener(
      NOTIFICATIONS_UPDATED_EVENT,
      handleNotificationsUpdated,
    );
    return () => {
      active = false;
      window.removeEventListener(
        NOTIFICATIONS_UPDATED_EVENT,
        handleNotificationsUpdated,
      );
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

  const [markReadConfirmOpen, setMarkReadConfirmOpen] = useState(false);
  const [markReadError, setMarkReadError] = useState<string | null>(null);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);

  const sortedNotifications = sortOwnerNotifications(notifications);
  const previewNotifications = sortedNotifications.slice(0, 5);
  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markAllRead() {
    const unreadKeys = notifications.filter((n) => !n.read).map((n) => n.key);
    const batches = chunkNotificationKeys(unreadKeys, 50);
    if (batches.length === 0 || markingRead) return;
    setMarkReadError(null);
    setMarkingRead(true);
    try {
      for (const batch of batches) {
        const response = await fetch("/api/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: batch }),
          cache: "no-store",
        });
        if (!response.ok) {
          setMarkReadError("Could not mark notifications as read right now.");
          return;
        }
      }

      const nowIso = new Date().toISOString();
      const updated = notifications.map((item) => ({
        ...item,
        read: true,
        readAt: item.readAt ?? nowIso,
      }));
      setNotifications(updated);
      window.dispatchEvent(
        new CustomEvent(NOTIFICATIONS_UPDATED_EVENT, {
          detail: { notifications: updated },
        }),
      );
      setMarkReadConfirmOpen(false);
      toast.success(
        `Marked ${unreadKeys.length} ${unreadKeys.length === 1 ? "notification" : "notifications"} as read.`,
      );
    } catch {
      setMarkReadError("Connection interrupted while marking notifications.");
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
      setSignOutConfirmOpen(false);
      toast.success("Signed out.");
      window.location.replace("/auth/sign-in");
      return;
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
            aria-label="Notifications"
            className="fixed inset-x-3 top-[calc(4.25rem+env(safe-area-inset-top))] z-50 rounded-panel border border-border bg-surface p-3 shadow-[0_14px_32px_-16px_rgb(34_34_34/0.18)] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[24rem] sm:max-w-[calc(100vw-1.5rem)]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border pb-2.5">
              <div className="grid gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  Notifications
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {unreadCount > 0
                    ? `${unreadCount} unread`
                    : notifLoaded
                      ? "All caught up"
                      : "Loading alerts"}
                </span>
              </div>
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={markingRead}
                  onClick={() => {
                    setNotifOpen(false);
                    setMarkReadError(null);
                    setMarkReadConfirmOpen(true);
                  }}
                >
                  Mark read
                </Button>
              )}
            </div>

            <div className="mt-1 grid max-h-[min(65dvh,30rem)] divide-y divide-border overflow-y-auto overscroll-contain">
              {!notifLoaded ? (
                <div
                  className="grid gap-3 py-3"
                  role="status"
                  aria-busy="true"
                  aria-label="Loading notifications"
                >
                  <span className="sr-only">Loading notifications…</span>
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="grid gap-1.5 px-1">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))}
                </div>
              ) : previewNotifications.length === 0 ? (
                <p className="py-5 text-center text-xs text-muted-foreground">
                  No active alerts right now.
                </p>
              ) : (
                previewNotifications.map((item) => (
                  <NotificationCard
                    key={item.key}
                    notification={item}
                    density="compact"
                    onNavigate={() => setNotifOpen(false)}
                  />
                ))
              )}
            </div>

            <div className="mt-2.5 border-t border-border pt-2">
              <Link
                href="/notifications"
                onClick={() => setNotifOpen(false)}
                className="group flex min-h-11 items-center justify-between gap-2 rounded-control px-2.5 text-sm font-medium text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted"
              >
                <span>See all</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                  {notifications.length > 5 && (
                    <span>5 of {notifications.length}</span>
                  )}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5 text-muted-foreground transition-transform duration-(--duration-control) ease-(--ease-control) group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transform-none"
                  >
                    <path d="M3.5 8h9m-3.5-3.5L12.5 8 9 11.5" />
                  </svg>
                </span>
              </Link>
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
            aria-label="Account menu"
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
                href="/settings/profile"
                onClick={() => setProfileOpen(false)}
                className="flex min-h-9 items-center rounded-control px-2.5 py-1.5 text-sm leading-5 text-foreground transition-colors hover:bg-surface-muted"
              >
                Property profile
              </Link>
              <Link
                role="menuitem"
                href="/settings/devices"
                onClick={() => setProfileOpen(false)}
                className="flex min-h-9 items-center rounded-control px-2.5 py-1.5 text-sm leading-5 text-foreground transition-colors hover:bg-surface-muted"
              >
                Trusted devices
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
                onClick={() => {
                  setProfileOpen(false);
                  setSignOutConfirmOpen(true);
                }}
                className="flex min-h-9 w-full cursor-pointer items-center justify-between rounded-control px-2.5 py-1.5 text-left text-sm leading-5 text-danger transition-colors hover:bg-surface-muted disabled:opacity-50"
              >
                <span>{signingOut ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={markReadConfirmOpen}
        onClose={() => {
          if (!markingRead) {
            setMarkReadError(null);
            setMarkReadConfirmOpen(false);
          }
        }}
        onConfirm={() => void markAllRead()}
        title="Mark all notifications as read?"
        description={`This clears ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"} from your header badge.`}
        errorMessage={markReadError}
        confirmLabel="Mark all read"
        confirmVariant="primary"
        loading={markingRead}
      />

      <ConfirmDialog
        open={signOutConfirmOpen}
        onClose={() => {
          if (!signingOut) setSignOutConfirmOpen(false);
        }}
        onConfirm={() => void handleSignOut()}
        title="Sign out of Daisy?"
        description="You will be signed out on this browser and returned to the sign-in screen."
        errorMessage={signOutError}
        confirmLabel="Sign out"
        confirmVariant="danger"
        loading={signingOut}
      />
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
        Local time
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

type WorkspaceTitleOverride = {
  pathname: string;
  title: string;
} | null;

const WorkspaceTitleContext = createContext<
  ((override: WorkspaceTitleOverride) => void) | null
>(null);

function resolveWorkspaceTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/reports") return "Reports";
  if (pathname === "/rooms") return "Rooms";
  if (pathname === "/rooms/new") return "Add room";
  if (pathname === "/rooms/types") return "Room types";
  if (pathname.startsWith("/rooms/")) return "Room details";
  if (pathname === "/tenants") return "Tenants";
  if (pathname.endsWith("/contracts/new")) return "Add signed contract";
  if (pathname.includes("/contracts/")) return "Signed contract";
  if (pathname.startsWith("/tenants/")) return "Tenant profile";
  if (pathname === "/transients" || pathname === "/transients/stays") {
    return "Stays & reservations";
  }
  if (pathname === "/transients/requests") return "Booking requests";
  if (pathname.startsWith("/transients/requests/")) return "Booking request";
  if (pathname === "/transients/rooms") return "Transient rooms";
  if (pathname === "/transients/rooms/new") return "Add transient room";
  if (pathname === "/transients/rooms/types") return "Transient room types";
  if (pathname.startsWith("/transients/rooms/")) return "Transient room";
  if (pathname === "/billing") return "Billing";
  if (pathname === "/billing/new") return "Create invoice";
  if (pathname.startsWith("/billing/")) return "Invoice details";
  if (pathname === "/payments") return "Payments";
  if (pathname === "/payments/new") return "Record payment";
  if (pathname.startsWith("/payments/")) return "Payment details";
  if (pathname === "/maintenance") return "Maintenance";
  if (pathname === "/maintenance/new") return "Log maintenance request";
  if (pathname.startsWith("/maintenance/")) return "Maintenance request";
  if (pathname === "/notices") return "Notices";
  if (pathname === "/notifications") return "Notifications";
  if (pathname === "/audit") return "Activity history";
  if (pathname === "/settings/profile") return "Property profile";
  if (pathname === "/settings/policies") return "Billing & policies";
  if (pathname === "/settings/operations") return "Stays & limits";
  if (pathname === "/settings/sms") return "Overdue SMS";
  if (pathname === "/settings/devices") return "Trusted devices";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Daisy Workspace";
}

/**
 * Sets a record-specific topbar title (e.g., room number, invoice number)
 * inside the persistent WorkspaceShell without remounting the sidebar/topbar.
 */
export function WorkspacePageTitle({ title }: { title: string }) {
  const pathname = usePathname();
  const setOverride = useContext(WorkspaceTitleContext);

  useEffect(() => {
    if (!setOverride) return;
    setOverride({ pathname, title });
    return () => {
      setOverride(null);
    };
  }, [pathname, setOverride, title]);

  return null;
}

type WorkspaceShellProps = {
  title?: string;
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
    ownerName: "Property Manager",
    businessName: "Daisy Workspace",
  },
  primaryAction,
  children,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const [titleOverride, setTitleOverride] =
    useState<WorkspaceTitleOverride>(null);
  const resolvedTitle =
    title ??
    (titleOverride?.pathname === pathname ? titleOverride.title : null) ??
    resolveWorkspaceTitle(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const defaultRoomsExpanded = pathname.startsWith("/rooms");
  const defaultTransientsExpanded =
    pathname.startsWith("/transients") &&
    !pathname.startsWith("/transients/rooms");
  const defaultTransientRoomsExpanded =
    pathname.startsWith("/transients/rooms");
  const isSettingsNavActive = SETTINGS_SECTIONS.some(
    (item) => pathname === item.href,
  );
  const defaultSettingsExpanded = isSettingsNavActive;

  const sidebarCollapsed = useSyncExternalStore(
    subscribeSidebarState,
    () => readSidebarFlag(SIDEBAR_STORAGE_KEY, false),
    () => false,
  );
  const roomsNavExpanded = useSyncExternalStore(
    subscribeSidebarState,
    () => readSidebarFlag(SIDEBAR_ROOMS_STORAGE_KEY, defaultRoomsExpanded),
    () => defaultRoomsExpanded,
  );
  const transientsNavExpanded = useSyncExternalStore(
    subscribeSidebarState,
    () =>
      readSidebarFlag(
        SIDEBAR_TRANSIENTS_STORAGE_KEY,
        defaultTransientsExpanded,
      ),
    () => defaultTransientsExpanded,
  );
  const transientRoomsNavExpanded = useSyncExternalStore(
    subscribeSidebarState,
    () =>
      readSidebarFlag(
        SIDEBAR_TRANSIENT_ROOMS_STORAGE_KEY,
        defaultTransientRoomsExpanded,
      ),
    () => defaultTransientRoomsExpanded,
  );
  const settingsNavExpanded = useSyncExternalStore(
    subscribeSidebarState,
    () =>
      readSidebarFlag(SIDEBAR_SETTINGS_STORAGE_KEY, defaultSettingsExpanded),
    () => defaultSettingsExpanded,
  );

  function toggleSidebarCollapse() {
    writeSidebarFlag(
      SIDEBAR_STORAGE_KEY,
      !readSidebarFlag(SIDEBAR_STORAGE_KEY, false),
    );
  }

  function toggleDisclosureSection(key: string, fallback: boolean) {
    if (sidebarCollapsed) {
      writeSidebarFlag(SIDEBAR_STORAGE_KEY, false);
      writeSidebarFlag(key, true);
      return;
    }
    writeSidebarFlag(key, !readSidebarFlag(key, fallback));
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

        <SidebarContent className="gap-2.5 py-3">
          <SidebarNav aria-label="Primary navigation" className="gap-2.5">
            <SidebarGroup label="Overview">
              <SidebarLink
                href="/"
                active={pathname === "/"}
                icon={<DashboardIcon />}
                {...(sidebarCollapsed ? { title: "Dashboard" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Dashboard
              </SidebarLink>
              <SidebarLink
                href="/reports"
                active={pathname.startsWith("/reports")}
                icon={<ReportsIcon />}
                {...(sidebarCollapsed ? { title: "Reports" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Reports
              </SidebarLink>
            </SidebarGroup>

            <Separator />

            <SidebarGroup label="Boarding House">
              <SidebarNavDisclosure
                label="Rooms"
                icon={<RoomsIcon />}
                active={pathname.startsWith("/rooms")}
                expanded={roomsNavExpanded}
                onToggle={() =>
                  toggleDisclosureSection(
                    SIDEBAR_ROOMS_STORAGE_KEY,
                    defaultRoomsExpanded,
                  )
                }
              >
                {ROOMS_SECTIONS.map((item) => {
                  const isItemActive =
                    item.href === "/rooms"
                      ? pathname === "/rooms" ||
                        (pathname.startsWith("/rooms/") &&
                          !pathname.startsWith("/rooms/types"))
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
            </SidebarGroup>

            <Separator />

            <SidebarGroup label="Transient">
              <SidebarNavDisclosure
                label="Stays & requests"
                icon={<TransientsIcon />}
                active={
                  pathname.startsWith("/transients") &&
                  !pathname.startsWith("/transients/rooms")
                }
                expanded={transientsNavExpanded}
                onToggle={() =>
                  toggleDisclosureSection(
                    SIDEBAR_TRANSIENTS_STORAGE_KEY,
                    defaultTransientsExpanded,
                  )
                }
              >
                {TRANSIENTS_SECTIONS.map((item) => {
                  const isItemActive =
                    item.href === "/transients/stays"
                      ? pathname === "/transients" ||
                        pathname === "/transients/stays" ||
                        pathname.startsWith("/transients/stays/") ||
                        pathname === "/transients/guests"
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
              <SidebarNavDisclosure
                label="Transient rooms"
                icon={<RoomsIcon />}
                active={pathname.startsWith("/transients/rooms")}
                expanded={transientRoomsNavExpanded}
                onToggle={() =>
                  toggleDisclosureSection(
                    SIDEBAR_TRANSIENT_ROOMS_STORAGE_KEY,
                    defaultTransientRoomsExpanded,
                  )
                }
              >
                {TRANSIENT_ROOMS_SECTIONS.map((item) => {
                  const isItemActive =
                    item.href === "/transients/rooms"
                      ? pathname === "/transients/rooms" ||
                        (pathname.startsWith("/transients/rooms/") &&
                          !pathname.startsWith("/transients/rooms/types"))
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
            </SidebarGroup>

            <Separator />

            <SidebarGroup label="Finance & Facility">
              <SidebarLink
                href="/billing"
                active={pathname.startsWith("/billing")}
                icon={<BillingIcon />}
                {...(sidebarCollapsed ? { title: "Billing" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Billing
              </SidebarLink>
              <SidebarLink
                href="/payments"
                active={pathname.startsWith("/payments")}
                icon={<PaymentsIcon />}
                {...(sidebarCollapsed ? { title: "Payments" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Payments
              </SidebarLink>
              <SidebarLink
                href="/maintenance"
                active={pathname.startsWith("/maintenance")}
                icon={<MaintenanceIcon />}
                {...(sidebarCollapsed ? { title: "Maintenance" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Maintenance
              </SidebarLink>
              <SidebarLink
                href="/notices"
                active={pathname.startsWith("/notices")}
                icon={<NoticesIcon />}
                {...(sidebarCollapsed ? { title: "Notices" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Notices
              </SidebarLink>
            </SidebarGroup>

            <Separator />

            <SidebarGroup label="System">
              <SidebarLink
                href="/audit"
                active={pathname === "/audit"}
                icon={<AuditIcon />}
                {...(sidebarCollapsed ? { title: "Activity history" } : {})}
                onClick={() => setSidebarOpen(false)}
              >
                Activity history
              </SidebarLink>
              <SidebarNavDisclosure
                label="Settings"
                icon={<SettingsIcon />}
                active={isSettingsNavActive}
                expanded={settingsNavExpanded}
                onToggle={() =>
                  toggleDisclosureSection(
                    SIDEBAR_SETTINGS_STORAGE_KEY,
                    defaultSettingsExpanded,
                  )
                }
              >
                <SettingsSubLinks onNavigate={() => setSidebarOpen(false)} />
              </SidebarNavDisclosure>
            </SidebarGroup>
          </SidebarNav>
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
            <TopbarBreadcrumb title={resolvedTitle} />
          </TopbarLeft>

          <TopbarActions>
            <OfflineStatusBar />
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
          className="flex-1 px-4 py-5 outline-none sm:px-6 sm:py-6 lg:px-10 lg:py-8 xl:px-14"
        >
          <WorkspaceTitleContext.Provider value={setTitleOverride}>
            <div className="mx-auto grid w-full max-w-7xl gap-6">
              {children}
            </div>
          </WorkspaceTitleContext.Provider>
        </main>
      </div>
    </div>
  );
}
