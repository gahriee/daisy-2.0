import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import {
  compactSingleLineSizingClasses,
  controlBaseClasses,
  editableControlClasses,
} from "./control-styles";

/**
 * Single-line text input defaulting to compact 40 px mobile / 36 px desktop
 * sizing with pixel-compensated border-only focus, active, and invalid states.
 */
export type InputProps = ComponentProps<"input"> & {
  variant?: "default" | "filter";
};

export function Input({
  className,
  type = "text",
  variant = "default",
  ...props
}: InputProps) {
  void variant;

  return (
    <input
      {...props}
      type={type}
      className={cn(
        controlBaseClasses,
        editableControlClasses,
        compactSingleLineSizingClasses,
        "pr-3 pl-3",
        type === "file" &&
          "cursor-pointer py-1 file:mr-2.5 file:cursor-pointer file:rounded-control file:border file:border-border file:bg-surface-muted file:px-2.5 file:py-1 file:text-xs file:leading-none file:font-medium file:text-foreground",
        className,
      )}
    />
  );
}
