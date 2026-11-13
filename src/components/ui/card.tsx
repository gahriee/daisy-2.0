import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "min-w-0 rounded-panel border border-border bg-surface p-5",
        className,
      )}
    />
  );
}
