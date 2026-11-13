import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlBaseClasses, editableControlClasses } from "./control-styles";

/**
 * Vertically resizable multiline input with pixel-compensated border-only
 * focus, active, and invalid states.
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cn(
        controlBaseClasses,
        editableControlClasses,
        "min-h-28 resize-y py-2.5 pr-3.5 pl-3.5 not-disabled:not-read-only:focus:py-[9px] not-disabled:not-read-only:focus:pl-[13px] not-disabled:not-read-only:active:py-[9px] not-disabled:not-read-only:active:pl-[13px] read-only:focus-visible:py-[9px] read-only:focus-visible:pl-[13px] aria-invalid:not-disabled:py-[9px] aria-invalid:not-disabled:pl-[13px]",
        className,
      )}
    />
  );
}
