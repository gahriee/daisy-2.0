import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  info: "border-info-border bg-info-surface text-info",
  success: "border-success-border bg-success-surface text-success",
  warning: "border-warning-border bg-warning-surface text-warning",
  danger: "border-danger-border bg-danger-surface text-danger",
};

const icons: Record<keyof typeof tones, ReactNode> = {
  info: (
    <>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 7.25v3.5M8 5.25h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  success: (
    <>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.5 8.15 7.2 9.85 10.6 6.35"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  warning: (
    <>
      <path
        d="M7.14 2.75a1 1 0 0 1 1.72 0l5.2 8.75a1 1 0 0 1-.86 1.5H2.8a1 1 0 0 1-.86-1.5l5.2-8.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.25v2.75M8 10.85h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  danger: (
    <>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.1 5.9 5.9 10.1M5.9 5.9l4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
};

/**
 * Tonal notification panel with a subtle hairline border and a fixed-rail
 * geometric status mark that preserves custom child layout classes.
 */
export function Alert({
  tone = "info",
  role = "status",
  className,
  children,
  ...props
}: ComponentProps<"div"> & { tone?: keyof typeof tones }) {
  return (
    <div
      {...props}
      role={role}
      className={cn(
        "relative rounded-panel border py-3.5 pr-4 pl-10 text-sm leading-6",
        tones[tone],
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        className="pointer-events-none absolute top-4 left-3.5 size-4"
      >
        {icons[tone]}
      </svg>
      {children}
    </div>
  );
}
