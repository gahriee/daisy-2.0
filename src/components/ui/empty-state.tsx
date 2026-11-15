import type { ComponentProps, ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

export type EmptyIllustrationName =
  "document-search" | "sweet-home" | "adjust-settings";

const EMPTY_ILLUSTRATIONS: Record<
  EmptyIllustrationName,
  { src: string; width: number; height: number }
> = {
  "document-search": {
    src: "/illustrations/document-search.svg",
    width: 799,
    height: 618,
  },
  "sweet-home": {
    src: "/illustrations/sweet-home.svg",
    width: 960,
    height: 749,
  },
  "adjust-settings": {
    src: "/illustrations/adjust-settings.svg",
    width: 717,
    height: 800,
  },
};

const ILLUSTRATION_SIZE_CLASSES = {
  xs: "w-24 sm:w-28",
  sm: "w-32 sm:w-36",
  md: "w-36 sm:w-44",
} as const;

/**
 * Centered unDraw SVG artwork for empty tables and empty workspace views.
 */
export function EmptyStateIllustration({
  illustration = "document-search",
  size = "md",
  className,
}: {
  illustration?: EmptyIllustrationName;
  size?: keyof typeof ILLUSTRATION_SIZE_CLASSES;
  className?: string;
}) {
  const asset = EMPTY_ILLUSTRATIONS[illustration];
  return (
    <Image
      src={asset.src}
      alt=""
      width={asset.width}
      height={asset.height}
      unoptimized
      aria-hidden="true"
      className={cn(
        "mx-auto h-auto select-none",
        ILLUSTRATION_SIZE_CLASSES[size],
        className,
      )}
    />
  );
}

/**
 * Centered empty-state body with SVG illustration, title, optional copy, and
 * optional recovery actions. Defaults to borderless embedded table cards under
 * TableCardHeader; pass embedded={false} for standalone EmptyState panels.
 */
export function TableEmptyState({
  title,
  description,
  illustration = "document-search",
  illustrationSize,
  actions,
  embedded = true,
  titleId,
  className,
}: {
  title: string;
  description?: string;
  illustration?: EmptyIllustrationName;
  illustrationSize?: keyof typeof ILLUSTRATION_SIZE_CLASSES;
  actions?: ReactNode;
  embedded?: boolean;
  titleId?: string;
  className?: string;
}) {
  const resolvedSize = illustrationSize ?? (embedded ? "sm" : "md");

  if (!embedded) {
    return (
      <EmptyState aria-labelledby={titleId} className={className}>
        <EmptyStateIllustration
          illustration={illustration}
          size={resolvedSize}
        />
        <div className="grid justify-items-center gap-1.5">
          <EmptyStateTitle id={titleId}>{title}</EmptyStateTitle>
          {description && (
            <EmptyStateDescription>{description}</EmptyStateDescription>
          )}
        </div>
        {actions && <EmptyStateActions>{actions}</EmptyStateActions>}
      </EmptyState>
    );
  }

  return (
    <div
      className={cn(
        "grid min-w-0 items-center justify-items-center gap-3.5 px-4 py-8 text-center sm:px-6 sm:py-10",
        className,
      )}
    >
      <EmptyStateIllustration illustration={illustration} size={resolvedSize} />
      <div className="grid justify-items-center gap-1">
        <h3
          id={titleId}
          className="mx-auto text-base font-semibold tracking-tight text-foreground"
        >
          {title}
        </h3>
        {description && (
          <p className="mx-auto max-w-md text-xs leading-5 text-muted-foreground sm:text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && <EmptyStateActions>{actions}</EmptyStateActions>}
    </div>
  );
}

/**
 * Quiet, solid-surface empty-state container with centered illustration/icon,
 * balanced typography, and recovery actions.
 */
export function EmptyState({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      {...props}
      className={cn(
        "grid min-w-0 items-center justify-items-center gap-5 rounded-panel border border-border bg-surface px-6 py-10 text-center sm:px-8 sm:py-12",
        className,
      )}
    />
  );
}

export function EmptyStateIcon({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-control border border-border bg-surface-muted text-foreground",
        className,
      )}
    />
  );
}

export function EmptyStateTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      {...props}
      className={cn(
        "mx-auto text-xl font-semibold tracking-tight text-foreground sm:text-2xl",
        className,
      )}
    />
  );
}

export function EmptyStateDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      {...props}
      className={cn(
        "mx-auto max-w-prose text-base leading-6 text-muted-foreground",
        className,
      )}
    />
  );
}

export function EmptyStateActions({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "flex flex-wrap items-center justify-center gap-3",
        className,
      )}
    />
  );
}
