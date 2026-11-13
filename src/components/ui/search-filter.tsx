"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { controlBaseClasses, editableControlClasses } from "./control-styles";

type SearchFilterBarProps = ComponentProps<"section"> & {
  title?: string;
  resultCountText?: string;
  updating?: boolean;
  hasActiveFilters?: boolean;
  onClearAll?: () => void;
  clearAllLabel?: string;
  actions?: ReactNode;
};

/**
 * Dynamic workspace filtering toolbar without a manual submit button: combines
 * live result metrics, clear-all recovery, and responsive filter controls.
 */
export function SearchFilterBar({
  title,
  resultCountText,
  updating = false,
  hasActiveFilters = false,
  onClearAll,
  clearAllLabel = "Clear filters",
  actions,
  className,
  children,
  ...props
}: SearchFilterBarProps) {
  return (
    <section
      {...props}
      className={cn(
        "grid min-w-0 gap-4 rounded-panel border border-border bg-surface p-4 sm:p-5",
        className,
      )}
    >
      {(title || resultCountText || hasActiveFilters || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {title && (
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            )}
            {resultCountText && (
              <span
                aria-live="polite"
                className="text-xs font-medium text-muted-foreground tabular-nums"
              >
                {updating ? "Updating…" : resultCountText}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {hasActiveFilters && onClearAll && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearAll}
              >
                {clearAllLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {children}
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
 * Border-only-on-focus live search field with leading search glyph and an
 * accessible 44 px clear trigger whenever text is present.
 */
export function SearchFilterInput({
  value,
  onValueChange,
  clearLabel = "Clear search",
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
        className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground"
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
          "min-h-11 py-2 pr-11 pl-10 not-disabled:not-read-only:focus:py-[7px] not-disabled:not-read-only:focus:pr-[43px] not-disabled:not-read-only:focus:pl-[39px] not-disabled:not-read-only:active:py-[7px] not-disabled:not-read-only:active:pr-[43px] not-disabled:not-read-only:active:pl-[39px] [&::-webkit-search-cancel-button]:hidden",
          className,
        )}
      />

      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onValueChange("")}
          aria-label={clearLabel}
          className="absolute right-0 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-r-control text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:text-foreground"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="size-4"
          >
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}

export type FilterChipOption<T extends string = string> = {
  value: T;
  label: string;
};

type SearchFilterChipsProps<T extends string> = {
  label: string;
  options: readonly FilterChipOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
};

/**
 * Single-tap toggle pills for dynamic category filtering with >=44 px targets
 * and horizontal scroll fallback on compact viewports.
 */
export function SearchFilterChips<T extends string>({
  label,
  options,
  value,
  onValueChange,
  className,
}: SearchFilterChipsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-control border px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,border-color] duration-(--duration-control) ease-(--ease-control) sm:min-h-9 sm:px-3 sm:py-1.5",
              active
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "border-border bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
