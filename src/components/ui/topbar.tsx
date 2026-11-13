import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Opaque hairline application top bar paired cleanly with the persistent sidebar
 * height (`64 px`) without backdrop blur, sticky collapse, or ambient elevation.
 */
export function Topbar({ className, ...props }: ComponentProps<"header">) {
  return (
    <header
      {...props}
      className={cn(
        "sticky top-0 z-20 flex min-h-16 w-full shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6 lg:px-8",
        className,
      )}
    />
  );
}

export function TopbarLeft({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn("flex min-w-0 items-center gap-3", className)}
    />
  );
}

export function TopbarTitle({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      {...props}
      className={cn(
        "truncate text-base font-semibold tracking-tight text-foreground",
        className,
      )}
    />
  );
}

export function TopbarActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn("flex shrink-0 items-center gap-2 sm:gap-3", className)}
    />
  );
}

type TopbarMenuButtonProps = ComponentProps<"button"> & {
  expanded: boolean;
  controls: string;
};

export function TopbarMenuButton({
  expanded,
  controls,
  className,
  ...props
}: TopbarMenuButtonProps) {
  return (
    <button
      {...props}
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={expanded ? "Close navigation menu" : "Open navigation menu"}
      className={cn(
        "inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-control border border-border bg-surface text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted lg:hidden",
        className,
      )}
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
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  );
}
