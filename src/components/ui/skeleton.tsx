import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Static, screen-reader-hidden loading placeholder matching control radius
 * and muted surface definition.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(
        "h-4 rounded-control border border-border/50 bg-surface-muted",
        className,
      )}
    />
  );
}
