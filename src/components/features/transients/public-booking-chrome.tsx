import Link from "next/link";
import { DaisyBrand } from "@/components/layout/daisy-brand";
import { BackLink } from "@/components/ui/button";
import { buildOsmAreaSearchUrl } from "@/features/transients/public-booking-view";

type PublicBookingHeaderProps = {
  propertyName: string;
  propertyAddress: string | null;
  contactPhone?: string | null;
  homeHref?: string;
};

/**
 * Sticky commercial header for Daisy's public booking subpages, aligned to the
 * shared `max-w-7xl` container rail used across `/book`.
 */
export function PublicBookingHeader({
  propertyName,
  propertyAddress,
  contactPhone,
  homeHref = "/book",
}: PublicBookingHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={homeHref}
            className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-control text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:text-primary"
          >
            <DaisyBrand asLink={false} show="icon" tone="light" />
            <span className="grid min-w-0 leading-tight">
              <span className="truncate text-sm font-semibold tracking-[0.08em] uppercase sm:text-base">
                {propertyName}
              </span>
              {propertyAddress && (
                <span className="hidden truncate text-xs font-normal text-muted-foreground sm:block">
                  {propertyAddress}
                </span>
              )}
            </span>
          </Link>
        </div>

        {contactPhone && (
          <a
            href={`tel:${contactPhone.replace(/[^+\d]/g, "")}`}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-control-border bg-surface px-3.5 text-xs font-medium text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted"
          >
            Front desk: {contactPhone}
          </a>
        )}
      </div>
    </header>
  );
}

/**
 * Plain inline back link placed directly above the page heading on booking subpages.
 */
export function PublicBookingBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <div className="mb-3">
      <BackLink href={href} size="md">
        {label}
      </BackLink>
    </div>
  );
}

type PublicBookingFooterProps = {
  propertyName: string;
  propertyAddress: string | null;
  contactPhone: string | null;
  heroPhotoCredit?: string | undefined;
};

/**
 * Compact footer aligned to the shared `max-w-7xl` rail with property contact
 * and plain booking terms.
 */
export function PublicBookingFooter({
  propertyName,
  propertyAddress,
  contactPhone,
  heroPhotoCredit,
}: PublicBookingFooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="font-semibold text-foreground">
            &copy; {currentYear} {propertyName}
          </span>
          {propertyAddress && (
            <a
              href={buildOsmAreaSearchUrl(propertyAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground sm:min-h-8"
            >
              {propertyAddress}
            </a>
          )}
          {contactPhone && (
            <a
              href={`tel:${contactPhone.replace(/[^+\d]/g, "")}`}
              className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground sm:min-h-8"
            >
              Front desk {contactPhone}
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span>Prices shown are estimates until confirmed by the host.</span>
          {heroPhotoCredit && <span>{heroPhotoCredit}</span>}
        </div>
      </div>
    </footer>
  );
}

type GuestCountStepperRowProps = {
  label: string;
  description: string;
  count: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
};

/**
 * Touch-friendly Adults/Children counter row with 44 px circular steppers.
 */
export function GuestCountStepperRow({
  label,
  description,
  count,
  min,
  max,
  onChange,
}: GuestCountStepperRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="grid gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={count <= min}
          onClick={() => onChange(Math.max(min, count - 1))}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-control-border bg-surface text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:border-foreground disabled:cursor-not-allowed disabled:opacity-35"
        >
          <span aria-hidden="true" className="text-base leading-none">
            &minus;
          </span>
        </button>
        <span className="w-6 text-center text-sm font-medium text-foreground tabular-nums">
          {count}
        </span>
        <button
          type="button"
          disabled={count >= max}
          onClick={() => onChange(Math.min(max, count + 1))}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-control-border bg-surface text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:border-foreground disabled:cursor-not-allowed disabled:opacity-35"
        >
          <span aria-hidden="true" className="text-base leading-none">
            +
          </span>
        </button>
      </div>
    </div>
  );
}
