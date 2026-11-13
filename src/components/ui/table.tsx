import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

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
        "w-full overflow-x-auto rounded-panel border border-border bg-surface",
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

type TableHeadProps = ComponentProps<"th"> & {
  numeric?: boolean;
};

export function TableHead({
  className,
  numeric = false,
  ...props
}: TableHeadProps) {
  return (
    <th
      {...props}
      className={cn(
        "px-4 py-3 font-medium whitespace-nowrap",
        numeric && "text-right tabular-nums",
        className,
      )}
    />
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
