import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const tones = {
  info: "bg-info-surface text-info",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
};
export function Alert({
  tone = "info",
  role = "status",
  className,
  ...props
}: ComponentProps<"div"> & { tone?: keyof typeof tones }) {
  return (
    <div
      {...props}
      role={role}
      className={cn(
        "rounded-panel p-4 text-sm leading-6",
        tones[tone],
        className,
      )}
    />
  );
}
