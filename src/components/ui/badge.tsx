import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "border-border bg-surface-muted text-foreground",
  success: "border-success-border bg-success-surface text-success",
  warning: "border-warning-border bg-warning-surface text-warning",
  danger: "border-danger-border bg-danger-surface text-danger",
  info: "border-info-border bg-info-surface text-info",
};

type BadgeProps = ComponentProps<"span"> & {
  tone?: keyof typeof tones;
};

/**
 * Non-interactive operational status badge with hairline boundary and tabular
 * numerals.
 */
export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center gap-1 rounded-control border px-2.5 py-0.5 text-xs font-medium leading-5 tabular-nums tracking-[-0.005em] whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
