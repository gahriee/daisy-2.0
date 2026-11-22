import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Screen-reader-hidden loading placeholder matching control radius
 * and muted surface definition, respecting reduced-motion preferences.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(
        "h-4 animate-pulse rounded-control border border-border/50 bg-surface-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}
