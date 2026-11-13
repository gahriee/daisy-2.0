import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Separator({ className, ...props }: ComponentProps<"hr">) {
  return (
    <hr
      {...props}
      className={cn("w-full border-0 border-t border-border", className)}
    />
  );
}
