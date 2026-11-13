import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-surface-muted text-muted-foreground",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  info: "bg-info-surface text-info",
};
export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center rounded-control px-2 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
    />
  );
}
