import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { SortDirection } from "@/lib/table-sort";

type TableCardHeaderProps = {
  title: string;
  count?: string;
  description?: string;
  actions?: ReactNode;
  headingId?: string;
  className?: string;
};

/**
 * Standard table container header placing the section title on the left and
 * the record count (and any secondary header actions) on the right.
 */
export function TableCardHeader({
  title,
  count,
  description,
  actions,
  headingId,
  className,
}: TableCardHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6 sm:py-3.5",
        className,
      )}
    >
      <div className="grid gap-0.5">
        <h2 id={headingId} className="text-sm font-semibold text-foreground">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {(count || actions) && (
        <div className="flex flex-wrap items-center gap-3">
          {count && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

type TableProps = ComponentProps<"table"> & {
  containerClassName?: string;
};

/**
 * Hairline-bordered scrollable data table keeping wide tabular views bounded
 * inside their own overflow container on narrow viewports.
 */
export function Table({ className, containerClassName, ...props }: TableProps) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto overscroll-x-contain rounded-panel border border-border bg-surface",
        containerClassName,
      )}
    >
      <table
        {...props}
        className={cn(
          "w-full border-collapse text-left text-sm text-foreground",
          className,
        )}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      {...props}
      className={cn(
        "border-b border-border bg-background/70 text-xs font-medium text-muted-foreground",
        className,
      )}
    />
  );
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      {...props}
      className={cn("divide-y divide-border bg-surface", className)}
    />
  );
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      {...props}
      className={cn(
        "border-t border-border bg-background/70 text-xs font-medium text-muted-foreground",
        className,
      )}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      {...props}
      className={cn(
        "transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-background/60",
        className,
      )}
    />
  );
}

function SortIndicator({ direction }: { direction: SortDirection | null }) {
  if (direction === "asc") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5 shrink-0 text-primary"
      >
        <path d="M8 12.5V3.5" />
        <path d="m4.5 7 3.5-3.5L11.5 7" />
      </svg>
    );
  }

  if (direction === "desc") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5 shrink-0 text-primary"
      >
        <path d="M8 3.5v9" />
        <path d="m4.5 9 3.5 3.5L11.5 9" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0 text-muted-foreground/75 transition-colors duration-(--duration-control) ease-(--ease-control) group-hover:text-foreground"
    >
      <path d="M5.5 12V4" />
      <path d="M3.25 6.25 5.5 4l2.25 2.25" />
      <path d="M10.5 4v8" />
      <path d="M8.25 9.75 10.5 12l2.25-2.25" />
    </svg>
  );
}

type TableHeadProps = ComponentProps<"th"> & {
  numeric?: boolean;
  /** Active sort direction for sortable columns; omit `onSort` for static/action headers. */
  sortDirection?: SortDirection | null | undefined;
  onSort?: (() => void) | undefined;
};

export function TableHead({
  className,
  numeric = false,
  sortDirection = null,
  onSort,
  scope = "col",
  children,
  ...props
}: TableHeadProps) {
  if (!onSort) {
    return (
      <th
        {...props}
        scope={scope}
        className={cn(
          "px-4 py-3 align-middle font-medium whitespace-nowrap",
          numeric && "text-right tabular-nums",
          className,
        )}
      >
        {children}
      </th>
    );
  }

  const isActive = sortDirection === "asc" || sortDirection === "desc";
  const ariaSort =
    sortDirection === "asc"
      ? "ascending"
      : sortDirection === "desc"
        ? "descending"
        : "none";

  const indicator = <SortIndicator direction={sortDirection} />;

  return (
    <th
      {...props}
      scope={scope}
      aria-sort={ariaSort}
      className={cn(
        "p-0 align-middle font-medium whitespace-nowrap",
        numeric && "text-right tabular-nums",
        className,
      )}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "group inline-flex min-h-11 w-full cursor-pointer items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-(--duration-control) ease-(--ease-control) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
          numeric
            ? "justify-end text-right tabular-nums"
            : "justify-start text-left",
          isActive
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {numeric && indicator}
        <span>{children}</span>
        {!numeric && indicator}
      </button>
    </th>
  );
}

type TableCellProps = ComponentProps<"td"> & {
  numeric?: boolean;
};

export function TableCell({
  className,
  numeric = false,
  ...props
}: TableCellProps) {
  return (
    <td
      {...props}
      className={cn(
        "px-4 py-3.5 align-top",
        numeric && "text-right tabular-nums",
        className,
      )}
    />
  );
}

export function TableCaption({
  className,
  ...props
}: ComponentProps<"caption">) {
  return (
    <caption
      {...props}
      className={cn(
        "px-4 py-3 text-left text-xs text-muted-foreground",
        className,
      )}
    />
  );
}
