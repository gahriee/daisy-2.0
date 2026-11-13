import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({
  className,
  type = "text",
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      {...props}
      type={type}
      className={cn(
        "min-h-11 w-full min-w-0 rounded-control border border-control-border bg-surface px-3 py-2 text-base text-foreground placeholder:text-muted-foreground aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground read-only:bg-surface-muted",
        className,
      )}
    />
  );
}
