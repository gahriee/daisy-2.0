import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type SeparatorProps =
  | ({ orientation?: "horizontal" } & ComponentProps<"hr">)
  | ({ orientation: "vertical" } & ComponentProps<"div">);

/**
 * Crisp 1px structural hairline rule for horizontal or vertical sectioning.
 */
export function Separator({
  orientation = "horizontal",
  className,
  ...props
}: SeparatorProps) {
  if (orientation === "vertical") {
    return (
      <div
        {...(props as ComponentProps<"div">)}
        role="separator"
        aria-orientation="vertical"
        className={cn("w-px shrink-0 self-stretch bg-border", className)}
      />
    );
  }

  return (
    <hr
      {...(props as ComponentProps<"hr">)}
      className={cn("w-full border-0 border-t border-border", className)}
    />
  );
}
