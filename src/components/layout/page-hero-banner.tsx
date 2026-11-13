import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

type PageHeroBannerProps = {
  headingId: string;
  eyebrow?: string;
  title: string;
  description: string;
  badges?: ReactNode;
  actions?: ReactNode;
  illustrationSrc: string;
  illustrationWidth: number;
  illustrationHeight: number;
  className?: string;
};

/**
 * Editorial hairline hero surface pairing left-aligned operational copy and
 * badges with an unDraw vector backdrop over an architectural dot grid.
 */
export function PageHeroBanner({
  headingId,
  eyebrow,
  title,
  description,
  badges,
  actions,
  illustrationSrc,
  illustrationWidth,
  illustrationHeight,
  className,
}: PageHeroBannerProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "relative overflow-hidden rounded-panel border border-border bg-surface",
        className,
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] lg:grid-cols-[1fr_296px]">
        <div className="relative z-10 grid gap-3 p-5 sm:p-7">
          {eyebrow && (
            <p className="text-[13px] font-medium text-primary">{eyebrow}</p>
          )}

          <div className="grid gap-1.5">
            <h1
              id={headingId}
              className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              {title}
            </h1>
            <p className="max-w-prose text-sm leading-6 text-muted-foreground sm:text-base">
              {description}
            </p>
          </div>

          {(badges || actions) && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {badges && (
                <div className="flex flex-wrap items-center gap-2">
                  {badges}
                </div>
              )}
              {actions && (
                <div className="flex flex-wrap items-center gap-2">
                  {actions}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          aria-hidden="true"
          className="relative hidden items-center justify-center overflow-hidden border-l border-border bg-background bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px] p-5 md:flex"
        >
          <Image
            src={illustrationSrc}
            alt=""
            width={illustrationWidth}
            height={illustrationHeight}
            unoptimized
            className="h-auto max-h-40 w-full max-w-[230px] object-contain opacity-95 select-none"
          />
        </div>
      </div>
    </section>
  );
}
