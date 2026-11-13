import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary:
    "border-control-border bg-surface text-foreground hover:bg-surface-muted",
  ghost: "border-transparent text-primary hover:bg-surface-muted",
  danger:
    "border-transparent bg-danger text-primary-foreground hover:bg-danger-hover",
};
type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  loading?: boolean;
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border px-4 py-2 text-sm font-semibold transition-colors duration-(--duration-control) ease-(--ease-control) disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {loading && (
        <svg
          aria-hidden="true"
          className="size-4 motion-safe:animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.25"
          />
          <path
            d="M12 3a9 9 0 0 1 9 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
