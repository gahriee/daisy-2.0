import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Select({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "min-h-11 w-full min-w-0 rounded-control border border-control-border bg-surface px-3 py-2 text-base text-foreground aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground",
        className,
      )}
    >
      {children}
    </select>
  );
}
