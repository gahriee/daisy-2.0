import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CheckboxProps = Omit<ComponentProps<"input">, "type" | "children"> & {
  label: ReactNode;
};
export function Checkbox({
  label,
  className,
  disabled,
  ...props
}: CheckboxProps) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-3 text-sm text-foreground",
        disabled && "cursor-not-allowed text-muted-foreground",
        className,
      )}
    >
      <input
        {...props}
        disabled={disabled}
        type="checkbox"
        className="size-5 shrink-0 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}
