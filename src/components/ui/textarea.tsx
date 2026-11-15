import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlBaseClasses, editableControlClasses } from "./control-styles";

export type TextareaProps = ComponentProps<"textarea"> & {
  variant?: "default" | "filter";
};

const defaultTextareaClasses =
  "min-h-20 resize-y py-2 pr-3 pl-3 text-base leading-5 sm:text-sm sm:leading-5";

/**
 * Vertically resizable multiline input with compact default density and
 * pixel-compensated border-only focus, active, and invalid states.
 */
export function Textarea({
  className,
  variant = "default",
  ...props
}: TextareaProps) {
  void variant;

  return (
    <textarea
      {...props}
      className={cn(
        controlBaseClasses,
        editableControlClasses,
        defaultTextareaClasses,
        className,
      )}
    />
  );
}
