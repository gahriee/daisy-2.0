"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type SidebarContextValue = {
  collapsed: boolean;
};

const SidebarContext = createContext<SidebarContextValue>({ collapsed: false });

export function useSidebarState() {
  return useContext(SidebarContext);
}

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  collapsed?: boolean;
  id?: string;
  label?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Responsive navigation rail: sticky full-height collapsible column on lg+
 * viewports (256 px expanded / 76 px icon rail) and an Escape-dismissible overlay
 * drawer on narrower screens.
 */
export function Sidebar({
  open,
  onClose,
  collapsed = false,
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
    <SidebarContext.Provider value={{ collapsed }}>
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
        data-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 max-w-[calc(100vw-3rem)] shrink-0 flex-col border-r border-border bg-surface transition-[transform,width] duration-(--duration-control) ease-(--ease-control) motion-reduce:transition-none lg:sticky lg:top-0 lg:z-auto lg:h-svh lg:max-w-none lg:translate-x-0",
          collapsed ? "lg:w-[76px]" : "lg:w-64",
          open
            ? "translate-x-0"
            : "-translate-x-full pointer-events-none lg:pointer-events-auto",
          className,
        )}
      >
        {children}
      </aside>
    </SidebarContext.Provider>
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
  const { collapsed } = useSidebarState();

  return (
    <div
      {...props}
      className={cn(
        "flex min-h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4",
        collapsed && "lg:justify-center lg:gap-0 lg:px-2.5",
        className,
      )}
    >
      <div
        className={cn(
          "min-w-0 flex-1",
          collapsed && "lg:flex lg:flex-none lg:justify-center",
        )}
      >
        {children}
      </div>

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
  const { collapsed } = useSidebarState();

  return (
    <div
      {...props}
      className={cn(
        "flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4",
        collapsed && "lg:px-2.5",
        className,
      )}
    />
  );
}

type SidebarGroupProps = ComponentProps<"section"> & {
  label?: string;
  labelId?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SidebarGroup({
  label,
  labelId,
  collapsible = false,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  className,
  children,
  ...props
}: SidebarGroupProps) {
  const { collapsed } = useSidebarState();
  const contentId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen =
    controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;

  function toggle() {
    const next = !isOpen;
    if (controlledOpen === undefined) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  }

  return (
    <section
      {...props}
      className={cn("grid gap-1.5", collapsed && "lg:gap-1", className)}
    >
      {label &&
        (collapsible ? (
          <button
            type="button"
            id={labelId}
            aria-expanded={isOpen}
            aria-controls={contentId}
            onClick={toggle}
            className={cn(
              "flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-control px-3 py-1.5 text-left text-[13px] font-medium leading-5 text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted/60 hover:text-foreground",
              collapsed && "lg:sr-only",
            )}
          >
            <span>{label}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-(--duration-control) ease-(--ease-control)",
                isOpen ? "rotate-0" : "-rotate-90",
              )}
            >
              <path d="M4.25 6.25 8 10l3.75-3.75" />
            </svg>
          </button>
        ) : (
          <SidebarGroupLabel
            id={labelId}
            className={cn(collapsed && "lg:sr-only")}
          >
            {label}
          </SidebarGroupLabel>
        ))}

      {(!collapsible || isOpen || collapsed) && (
        <div id={contentId} className="grid gap-1">
          {children}
        </div>
      )}
    </section>
  );
}

export function SidebarGroupLabel({
  className,
  ...props
}: ComponentProps<"h2">) {
  const { collapsed } = useSidebarState();

  return (
    <h2
      {...props}
      className={cn(
        "px-3 text-[13px] font-medium leading-5 text-muted-foreground",
        collapsed && "lg:sr-only",
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
  badge?: ReactNode;
};

export function SidebarLink({
  active = false,
  icon,
  badge,
  className,
  children,
  ...props
}: SidebarLinkProps) {
  const { collapsed } = useSidebarState();

  return (
    <Link
      {...props}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 min-w-0 items-center gap-3 rounded-control px-3 py-2 text-sm leading-5 transition-colors duration-(--duration-control) ease-(--ease-control)",
        collapsed && "lg:justify-center lg:px-0",
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
      <span
        className={cn("min-w-0 flex-1 truncate", collapsed && "lg:sr-only")}
      >
        {children}
      </span>
      {badge !== undefined && badge !== null && (
        <span className={cn("shrink-0", collapsed && "lg:hidden")}>
          {badge}
        </span>
      )}
    </Link>
  );
}

type SidebarNavDisclosureProps = {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/**
 * Full-width clickable collapsible sidebar row revealing indented sub-links
 * cleanly underneath without a separate floating chevron button.
 */
export function SidebarNavDisclosure({
  label,
  icon,
  active = false,
  expanded,
  onToggle,
  children,
}: SidebarNavDisclosureProps) {
  const { collapsed } = useSidebarState();
  const submenuId = useId();

  return (
    <div className="grid gap-1">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={submenuId}
        onClick={onToggle}
        {...(collapsed ? { title: label } : {})}
        className={cn(
          "relative flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-left text-sm leading-5 transition-colors duration-(--duration-control) ease-(--ease-control)",
          collapsed && "lg:justify-center lg:px-0",
          active
            ? "bg-surface-muted font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
            : "text-muted-foreground hover:bg-surface-muted/70 hover:text-foreground",
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
        <span
          className={cn("min-w-0 flex-1 truncate", collapsed && "lg:sr-only")}
        >
          {label}
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
            "size-4 shrink-0 transition-transform duration-(--duration-control) ease-(--ease-control)",
            expanded ? "rotate-180" : "rotate-0",
            collapsed && "lg:hidden",
          )}
        >
          <path d="M4.25 6.25 8 10l3.75-3.75" />
        </svg>
      </button>

      {expanded && (
        <div
          id={submenuId}
          className={cn(
            "ml-5 grid gap-0.5 border-l border-border pl-3",
            collapsed && "lg:hidden",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

type SidebarSubLinkProps = ComponentProps<typeof Link> & {
  active?: boolean;
};

export function SidebarSubLink({
  active = false,
  className,
  children,
  ...props
}: SidebarSubLinkProps) {
  return (
    <Link
      {...props}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center rounded-control px-2.5 py-1.5 text-[13px] leading-5 transition-colors duration-(--duration-control) ease-(--ease-control)",
        active
          ? "bg-accent/70 font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-surface-muted/70 hover:text-foreground",
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </Link>
  );
}

type SidebarFooterProps = ComponentProps<"div"> & {
  onToggleCollapse?: () => void;
};

export function SidebarFooter({
  className,
  children,
  onToggleCollapse,
  ...props
}: SidebarFooterProps) {
  const { collapsed } = useSidebarState();

  return (
    <div
      {...props}
      className={cn(
        "mt-auto flex items-center justify-between gap-2 border-t border-border px-3 py-2",
        collapsed && "lg:justify-center lg:px-2",
        className,
      )}
    >
      {children && (
        <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
          {children}
        </div>
      )}

      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? "Expand navigation sidebar"
              : "Collapse navigation sidebar"
          }
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted hover:text-foreground lg:inline-flex"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              "size-4 transition-transform duration-(--duration-control) ease-(--ease-control)",
              collapsed && "rotate-180",
            )}
          >
            <rect x="3" y="3.5" width="14" height="13" rx="2" />
            <path d="M8.25 3.5v13" />
            <path d="M13 7.75 10.75 10 13 12.25" />
          </svg>
        </button>
      )}
    </div>
  );
}
