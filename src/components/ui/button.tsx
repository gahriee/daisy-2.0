import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover",
  secondary:
    "border-control-border bg-surface text-foreground hover:bg-surface-muted/70 active:bg-surface-muted",
  ghost:
    "border-transparent bg-transparent text-primary hover:bg-surface-muted hover:text-primary-hover active:bg-surface-muted",
  danger:
    "border-transparent bg-danger text-primary-foreground hover:bg-danger-hover active:bg-danger-hover",
};

const sizes = {
  md: "min-h-11 min-w-11 px-4 py-2 text-sm",
  sm: "min-h-9 min-w-9 px-3 py-1.5 text-[13px]",
};

type ButtonClassOptions = {
  variant?: keyof typeof variants | undefined;
  size?: keyof typeof sizes | undefined;
  className?: string | undefined;
};

/**
 * Shared Tailwind utility recipe for buttons and button-styled navigation links.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: ButtonClassOptions = {}) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-control border font-medium leading-none tracking-[-0.005em] whitespace-nowrap transition-[background-color,color,border-color] duration-(--duration-control) ease-(--ease-control) disabled:cursor-not-allowed disabled:opacity-50",
    sizes[size],
    variants[variant],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> &
  ButtonClassOptions & {
    loading?: boolean;
  };

/**
 * Primary, tonal-secondary, ghost, and danger action button with 500 operational
 * typography and flat color transitions without scale or translation transforms.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
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
      className={buttonClasses({ variant, size, className })}
    >
      {loading && (
        <svg
          aria-hidden="true"
          className="size-4 shrink-0 motion-safe:animate-spin"
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
