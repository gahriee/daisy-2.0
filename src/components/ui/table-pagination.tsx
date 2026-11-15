"use client";

import { useId } from "react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { getPaginationItems } from "@/lib/table-pagination";

export type TablePaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  pageSizeOptions: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  label?: string;
  className?: string;
};

/**
 * Shared table footer pagination bar with `start–end of total` summary,
 * rows-per-page selector, and numbered page navigation.
 */
export function TablePagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  rangeStart,
  rangeEnd,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  label = "Table pagination",
  className,
}: TablePaginationProps) {
  const selectId = useId();
  const items = getPaginationItems(page, totalPages);
  const options = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  return (
    <nav
      aria-label={label}
      className={cn(
        "flex flex-col items-center justify-center gap-3 border-t border-border bg-surface px-4 py-3 text-center text-sm md:flex-row md:flex-wrap md:justify-between md:px-5 md:text-left",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
        <span className="text-sm text-muted-foreground tabular-nums">
          {rangeStart}&ndash;{rangeEnd} of {totalItems}
        </span>

        <div className="flex items-center gap-2">
          <label
            htmlFor={selectId}
            className="text-sm whitespace-nowrap text-muted-foreground"
          >
            Rows per page
          </label>
          <Select
            id={selectId}
            variant="compact"
            value={String(pageSize)}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {options.map((option) => (
              <option key={option} value={String(option)}>
                {option}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1 md:justify-end">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            className="size-4"
          >
            <path
              d="M9.75 4.25 6 8l3.75 3.75"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="inline-flex size-9 items-center justify-center text-sm text-muted-foreground select-none"
            >
              &hellip;
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={`Page ${item}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => {
                if (item !== page) onPageChange(item);
              }}
              className={cn(
                "inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-sm tabular-nums transition-colors duration-(--duration-control) ease-(--ease-control)",
                item === page
                  ? "bg-accent/70 font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
              )}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            className="size-4"
          >
            <path
              d="M6.25 4.25 10 8l-3.75 3.75"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </nav>
  );
}
