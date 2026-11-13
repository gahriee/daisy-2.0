import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const variants = {
  default: "border border-border bg-surface p-6 sm:p-7",
  tonal: "border border-border/80 bg-surface-muted p-6 sm:p-7",
  open: "border-0 bg-transparent p-0",
};

type CardProps = ComponentProps<"div"> & {
  variant?: keyof typeof variants;
  interactive?: boolean;
};

/**
 * Flat structural surface panel with resting hairline definition and optional
 * interactive hover-lift treatment for linked containers.
 */
export function Card({
  className,
  variant = "default",
  interactive = false,
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        "min-w-0 rounded-panel",
        variants[variant],
        interactive &&
          "transition-[transform,border-color,box-shadow] duration-(--duration-control) ease-(--ease-control) [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_12px_28px_-16px_rgb(34_34_34/0.14)] motion-reduce:transform-none motion-reduce:hover:translate-y-0",
        className,
      )}
    />
  );
}
