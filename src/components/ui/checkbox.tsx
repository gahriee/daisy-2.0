import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CheckboxProps = Omit<ComponentProps<"input">, "type" | "children"> & {
  label: ReactNode;
};

/**
 * Accessible native checkbox with a custom hairline tick transition inside a
 * 44px touch-target wrapping label.
 */
export function Checkbox({
  label,
  className,
  disabled,
  ...props
}: CheckboxProps) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-3 text-sm leading-5 text-foreground select-none",
        disabled && "cursor-not-allowed text-muted-foreground",
        className,
      )}
    >
      <span className="relative inline-grid size-5 shrink-0 place-items-center">
        <input
          {...props}
          disabled={disabled}
          type="checkbox"
          className="peer size-5 cursor-pointer appearance-none rounded-[6px] border border-control-border bg-surface transition-[background-color,border-color] duration-(--duration-control) ease-(--ease-control) hover:not-disabled:not-checked:border-foreground/60 checked:border-primary checked:bg-primary hover:not-disabled:checked:border-primary-hover hover:not-disabled:checked:bg-primary-hover disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:checked:bg-muted-foreground/45 disabled:checked:border-muted-foreground/45"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          fill="none"
          className="pointer-events-none absolute size-3 scale-75 text-primary-foreground opacity-0 transition-[opacity,transform] duration-(--duration-control) ease-(--ease-control) peer-checked:scale-100 peer-checked:opacity-100 motion-reduce:transition-none forced-colors:hidden"
        >
          <path
            d="M2.25 6.25 4.75 8.75 9.75 3.25"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{label}</span>
    </label>
  );
}
