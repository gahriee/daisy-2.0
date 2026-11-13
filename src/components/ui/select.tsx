import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlBaseClasses } from "./control-styles";

/**
 * Native `<select>` styled with a custom trailing chevron and consistent control
 * perimeter across platforms.
 */
export function Select({
  className,
  children,
  disabled,
  ...props
}: ComponentProps<"select">) {
  return (
    <div className="relative flex w-full min-w-0 items-center">
      <select
        {...props}
        disabled={disabled}
        className={cn(
          controlBaseClasses,
          "peer min-h-11 cursor-pointer appearance-none py-2 pr-10 pl-3.5 not-disabled:focus:py-[7px] not-disabled:focus:pr-[39px] not-disabled:focus:pl-[13px] not-disabled:active:py-[7px] not-disabled:active:pr-[39px] not-disabled:active:pl-[13px] aria-invalid:not-disabled:py-[7px] aria-invalid:not-disabled:pr-[39px] aria-invalid:not-disabled:pl-[13px]",
          className,
        )}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) peer-hover:not-peer-disabled:text-foreground peer-disabled:opacity-50"
      >
        <path
          d="M4.25 6.25 8 10l3.75-3.75"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
