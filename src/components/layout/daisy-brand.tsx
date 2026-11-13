import Link from "next/link";
import { DaisyMark } from "@/components/layout/daisy-mark";
import { cn } from "@/lib/cn";

type BrandShow = "lockup" | "icon" | "wordmark";
type BrandTone = "light" | "dark" | "monochrome";

type DaisyWordmarkProps = {
  className?: string;
};

/**
 * Clean operational wordmark inheriting current foreground ink.
 */
export function DaisyWordmark({ className }: DaisyWordmarkProps) {
  return (
    <span className={cn("text-base font-semibold tracking-tight", className)}>
      Daisy
    </span>
  );
}

type DaisyBrandProps = {
  href?: string;
  asLink?: boolean;
  subtitle?: string;
  show?: BrandShow;
  tone?: BrandTone;
  variant?: "default" | "inverted";
  className?: string;
};

/**
 * Daisy brand lockup supporting icon-only, wordmark-only, and full lockup modes
 * across light, dark, and single-ink monochrome surface treatments.
 */
export function DaisyBrand({
  href = "/",
  asLink = true,
  subtitle,
  show = "lockup",
  tone,
  variant = "default",
  className,
}: DaisyBrandProps) {
  const inverted = variant === "inverted";
  const resolvedTone: BrandTone = tone ?? (inverted ? "dark" : "light");

  const showIcon = show !== "wordmark";
  const showWordmark = show !== "icon";

  const rootToneClass =
    resolvedTone === "dark" || (resolvedTone === "monochrome" && inverted)
      ? "text-surface"
      : "text-foreground";

  const linkHoverClass =
    resolvedTone === "dark" || (resolvedTone === "monochrome" && inverted)
      ? "hover:text-surface/85"
      : resolvedTone === "monochrome"
        ? "hover:text-muted-foreground"
        : "hover:text-primary";

  const subtitleClass =
    resolvedTone === "dark" || (resolvedTone === "monochrome" && inverted)
      ? "text-surface/65"
      : "text-muted-foreground";

  const iconWrapperClass =
    resolvedTone === "monochrome"
      ? "inline-flex size-8 shrink-0 items-center justify-center text-current"
      : resolvedTone === "dark"
        ? "inline-flex size-8 shrink-0 items-center justify-center rounded-control bg-surface text-primary"
        : "inline-flex size-8 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground";

  const content = (
    <>
      {showIcon && (
        <span aria-hidden="true" className={iconWrapperClass}>
          <DaisyMark
            className={resolvedTone === "monochrome" ? "size-6" : "size-4.5"}
          />
        </span>
      )}
      {showWordmark && (
        <span className="grid leading-tight">
          <DaisyWordmark />
          {subtitle && (
            <span className={cn("text-xs font-normal", subtitleClass)}>
              {subtitle}
            </span>
          )}
        </span>
      )}
    </>
  );

  const baseClass = cn(
    "inline-flex items-center rounded-control",
    showIcon && showWordmark && "gap-2.5",
    asLink &&
      "min-h-11 min-w-11 transition-colors duration-(--duration-control) ease-(--ease-control)",
    rootToneClass,
    asLink && linkHoverClass,
    className,
  );

  if (!asLink) {
    return (
      <span
        aria-label={showWordmark ? undefined : "Daisy"}
        className={baseClass}
      >
        {content}
      </span>
    );
  }

  return (
    <Link href={href} aria-label="Daisy home" className={baseClass}>
      {content}
    </Link>
  );
}
