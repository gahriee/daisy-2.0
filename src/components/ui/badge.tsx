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

const countPillTones = {
  neutral: "border-border bg-surface-muted text-muted-foreground",
  success: "border-success-border bg-success-surface text-success",
  warning: "border-warning-border bg-warning-surface text-warning",
  danger: "border-danger-border bg-danger-surface text-danger",
  info: "border-info-border bg-info-surface text-info",
  primary: "border-primary/20 bg-accent text-accent-foreground",
};

type CountPillProps = ComponentProps<"span"> & {
  tone?: keyof typeof countPillTones;
};

/**
 * Compact tabular count pill for row action menus, buttons, and section
 * headings. Replaces inline parenthesized counts such as `Notes (1)`.
 */
export function CountPill({
  tone = "neutral",
  className,
  children,
  ...props
}: CountPillProps) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex min-w-5 shrink-0 items-center justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums",
        countPillTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

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
