import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Quiet, solid-surface empty-state container with centered illustration/icon,
 * balanced typography, and recovery actions.
 */
export function EmptyState({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      {...props}
      className={cn(
        "grid min-w-0 items-center justify-items-center gap-5 rounded-panel border border-border bg-surface px-6 py-10 text-center sm:px-8 sm:py-12",
        className,
      )}
    />
  );
}

export function EmptyStateIcon({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-control border border-border bg-surface-muted text-foreground",
        className,
      )}
    />
  );
}

export function EmptyStateTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      {...props}
      className={cn(
        "mx-auto text-xl font-semibold tracking-tight text-foreground sm:text-2xl",
        className,
      )}
    />
  );
}

export function EmptyStateDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      {...props}
      className={cn(
        "mx-auto max-w-prose text-base leading-6 text-muted-foreground",
        className,
      )}
    />
  );
}

export function EmptyStateActions({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "flex flex-wrap items-center justify-center gap-3",
        className,
      )}
    />
  );
}
