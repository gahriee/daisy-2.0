"use client";

import { useEffect, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  id?: string;
  label?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Responsive navigation rail: persistent 256 px hairline column on lg+ viewports
 * and a focusable, Escape-dismissible overlay drawer on narrower screens.
 */
export function Sidebar({
  open,
  onClose,
  id = "workspace-sidebar",
  label = "Workspace navigation",
  children,
  className,
}: SidebarProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-foreground/25 lg:hidden"
        />
      )}
      <aside
        id={id}
        aria-label={label}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 max-w-[calc(100vw-3rem)] shrink-0 flex-col border-r border-border bg-surface transition-transform duration-(--duration-control) ease-(--ease-control) motion-reduce:transition-none lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0",
          open
            ? "translate-x-0"
            : "-translate-x-full pointer-events-none lg:pointer-events-auto",
          className,
        )}
      >
        {children}
      </aside>
    </>
  );
}

type SidebarHeaderProps = ComponentProps<"div"> & {
  onClose?: () => void;
};

export function SidebarHeader({
  className,
  children,
  onClose,
  ...props
}: SidebarHeaderProps) {
  return (
    <div
      {...props}
      className={cn(
        "flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted hover:text-foreground lg:hidden"
        >
          <svg
            aria-hidden="true"
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5",
        className,
      )}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: ComponentProps<"section">) {
  return <section {...props} className={cn("grid gap-1.5", className)} />;
}

export function SidebarGroupLabel({
  className,
  ...props
}: ComponentProps<"h2">) {
  return (
    <h2
      {...props}
      className={cn(
        "px-3 text-[13px] font-medium leading-5 text-muted-foreground",
        className,
      )}
    />
  );
}

export function SidebarNav({ className, ...props }: ComponentProps<"nav">) {
  return <nav {...props} className={cn("grid gap-1", className)} />;
}

type SidebarLinkProps = ComponentProps<typeof Link> & {
  active?: boolean;
  icon?: ReactNode;
};

export function SidebarLink({
  active = false,
  icon,
  className,
  children,
  ...props
}: SidebarLinkProps) {
  return (
    <Link
      {...props}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 min-w-0 items-center gap-3 rounded-control px-3 py-2 text-sm leading-5 transition-colors duration-(--duration-control) ease-(--ease-control)",
        active
          ? "bg-surface-muted font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
          : "text-muted-foreground hover:bg-surface-muted/70 hover:text-foreground",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center",
            active ? "text-primary" : "text-current",
          )}
        >
          {icon}
        </span>
      )}
      <span className="truncate">{children}</span>
    </Link>
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn("mt-auto grid gap-1 border-t border-border p-3", className)}
    />
  );
}
