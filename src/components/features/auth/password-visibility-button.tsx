import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type PasswordVisibilityButtonProps = Omit<ComponentProps<"button">, "type"> & {
  visible: boolean;
  label?: string;
};

/**
 * Embedded eye toggle anchored inside compact password inputs.
 */
export function PasswordVisibilityButton({
  visible,
  label = "Show password",
  className,
  ...props
}: PasswordVisibilityButtonProps) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={visible}
      aria-label={label}
      className={cn(
        "absolute inset-y-0 right-0 inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-r-control text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:min-w-9",
        className,
      )}
    >
      {visible ? (
        <svg
          aria-hidden="true"
          className="size-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 3l18 18" />
          <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
          <path d="M9.88 5.09A10.94 10.94 0 0 1 12 4.91c5.22 0 9.27 3.63 10.5 7.09a12.3 12.3 0 0 1-3.16 4.74" />
          <path d="M6.61 6.61A12.46 12.46 0 0 0 1.5 12c1.23 3.46 5.28 7.09 10.5 7.09a10.9 10.9 0 0 0 4.02-.75" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          className="size-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1.5 12C2.73 8.54 6.78 4.91 12 4.91S21.27 8.54 22.5 12c-1.23 3.46-5.28 7.09-10.5 7.09S2.73 15.46 1.5 12Z" />
          <circle cx="12" cy="12" r="2.75" />
        </svg>
      )}
    </button>
  );
}
