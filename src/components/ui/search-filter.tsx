"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import {
  compactSingleLineSizingClasses,
  controlBaseClasses,
  editableControlClasses,
} from "./control-styles";

type SearchFilterBarProps = ComponentProps<"section"> & {
  title?: string;
  updating?: boolean;
  hasActiveFilters?: boolean;
  onClearAll?: () => void;
  clearAllLabel?: string;
  actions?: ReactNode;
};

/**
 * Dynamic workspace find-and-narrow toolbar without a manual submit button:
 * pairs compact find controls with optional trailing actions and clear recovery.
 */
export function SearchFilterBar({
  title,
  updating = false,
  hasActiveFilters = false,
  onClearAll,
  clearAllLabel = "Clear",
  actions,
  className,
  children,
  ...props
}: SearchFilterBarProps) {
  return (
    <section
      {...props}
      className={cn(
        "grid min-w-0 gap-3 rounded-panel border border-border bg-surface p-3.5 sm:p-4",
        className,
      )}
    >
      {(title || actions || updating) && (
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {title && (
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            )}
            {updating && (
              <span
                aria-live="polite"
                className="text-xs font-medium text-muted-foreground"
              >
                Updating…
              </span>
            )}
          </div>

          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">{children}</div>
        {hasActiveFilters && onClearAll && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="min-h-10 shrink-0 self-start sm:min-h-9 md:self-auto"
          >
            {clearAllLabel}
          </Button>
        )}
      </div>
    </section>
  );
}

type SearchFilterInputProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type"
> & {
  value: string;
  onValueChange: (value: string) => void;
  clearLabel?: string;
  wrapperClassName?: string;
};

/**
 * Compact border-only-on-focus live find field with leading search glyph and
 * an inline clear trigger whenever text is present.
 */
export function SearchFilterInput({
  value,
  onValueChange,
  clearLabel = "Clear",
  className,
  wrapperClassName,
  ...props
}: SearchFilterInputProps) {
  return (
    <div
      className={cn(
        "relative flex w-full min-w-0 items-center",
        wrapperClassName,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
      >
        <circle cx="9" cy="9" r="5.5" />
        <path d="m13.5 13.5 3.25 3.25" />
      </svg>

      <input
        {...props}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          controlBaseClasses,
          editableControlClasses,
          compactSingleLineSizingClasses,
          "pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden",
          className,
        )}
      />

      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onValueChange("")}
          aria-label={clearLabel}
          className="absolute right-0 inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-r-control text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:text-foreground sm:min-h-9 sm:min-w-9"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="size-3.5"
          >
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}
