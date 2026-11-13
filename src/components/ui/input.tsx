import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlBaseClasses, editableControlClasses } from "./control-styles";

/**
 * Single-line text input with mobile-safe 16px body size and pixel-compensated
 * border-only focus, active, and invalid states.
 */
export function Input({
  className,
  type = "text",
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      {...props}
      type={type}
      className={cn(
        controlBaseClasses,
        editableControlClasses,
        "min-h-11 py-2 pr-3.5 pl-3.5 not-disabled:not-read-only:focus:py-[7px] not-disabled:not-read-only:focus:pl-[13px] not-disabled:not-read-only:active:py-[7px] not-disabled:not-read-only:active:pl-[13px] read-only:focus-visible:py-[7px] read-only:focus-visible:pl-[13px] aria-invalid:not-disabled:py-[7px] aria-invalid:not-disabled:pl-[13px]",
        className,
      )}
    />
  );
}
