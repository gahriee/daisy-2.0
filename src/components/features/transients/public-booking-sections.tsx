"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DaisyBrand } from "@/components/layout/daisy-brand";
import {
  buildOsmAreaSearchUrl,
  buildRoomGallerySlides,
  formatGuestsSummary,
  formatStayTime,
  getScopeLabel,
} from "@/features/transients/public-booking-view";
import type {
  PublicAvailabilityDto,
  PublicPublishedRoomDto,
} from "@/features/transients/schemas";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import { cn } from "@/lib/cn";

type HowItWorksScrollTrackProps = {
  availability: PublicAvailabilityDto;
  rooms: PublicPublishedRoomDto[];
  adults: number;
  childrenCount: number;
  queryString: string;
  onJumpToSearch: () => void;
};

/**
 * Editorial horizontal scroll-pinned showcase ("HOW IT WORKS") styled with
 * Daisy's primary Rausch, blush, stone, white, and charcoal tokens.
 */
export function HowItWorksScrollTrack({
  availability,
  rooms,
  adults,
  childrenCount,
  queryString,
  onJumpToSearch,
}: HowItWorksScrollTrackProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [translateX, setTranslateX] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const mediaDesktop = window.matchMedia("(min-width: 1024px)");
    const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let rafId = 0;

    function updateProgress() {
      rafId = 0;
      if (!mediaDesktop.matches || mediaReduced.matches) {
        setTranslateX(0);
        return;
      }
      const wrapper = wrapperRef.current;
      const track = trackRef.current;
      if (!wrapper || !track || !track.parentElement) return;

      const rect = wrapper.getBoundingClientRect();
      const stickyTopOffset = 68;
      const scrollableDistance = Math.max(
        1,
        wrapper.offsetHeight - (window.innerHeight - stickyTopOffset),
      );
      const rawProgress = (stickyTopOffset - rect.top) / scrollableDistance;
      const clamped = Math.min(1, Math.max(0, rawProgress));
      const maxShift = Math.max(
        0,
        track.scrollWidth - track.parentElement.clientWidth,
      );
      setTranslateX(clamped * maxShift);
      setActiveIndex(clamped < 0.34 ? 0 : clamped < 0.68 ? 1 : 2);
    }

    function scheduleUpdate() {
      if (!rafId) {
        rafId = window.requestAnimationFrame(updateProgress);
      }
    }

    updateProgress();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    mediaDesktop.addEventListener("change", scheduleUpdate);
    mediaReduced.addEventListener("change", scheduleUpdate);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      mediaDesktop.removeEventListener("change", scheduleUpdate);
      mediaReduced.removeEventListener("change", scheduleUpdate);
    };
  }, []);

  const previewRooms = rooms.slice(0, 3);
  const primaryRoom = rooms[0] ?? null;
  const stayDateSummary = `${formatManilaDate(availability.checkInDateManila)} to ${formatManilaDate(availability.checkOutDateManila)}`;
  const guestSummary = formatGuestsSummary(adults, childrenCount);

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="relative border-t border-border bg-surface"
    >
      <div ref={wrapperRef} className="relative lg:h-[210vh]">
        <div className="px-4 py-14 sm:px-6 lg:sticky lg:top-[68px] lg:flex lg:h-[calc(100svh-68px)] lg:flex-col lg:justify-center lg:overflow-hidden lg:px-10 lg:py-10">
          <div className="mx-auto mb-8 max-w-2xl text-center lg:mb-10">
            <h2
              id="how-it-works-heading"
              className="font-book-serif text-4xl font-normal tracking-[0.05em] text-foreground uppercase sm:text-5xl"
            >
              How it works
            </h2>
            <p className="mt-2.5 text-sm leading-6 text-muted-foreground sm:text-base">
              Explore open rooms, pick your stay dates and guest count, then
              send a direct request with clear nightly estimates.
            </p>
          </div>

          <div className="mx-auto w-full max-w-7xl lg:overflow-hidden">
            <div
              ref={trackRef}
              style={
                translateX > 0
                  ? { transform: `translate3d(-${translateX}px, 0, 0)` }
                  : undefined
              }
              className="flex flex-col gap-6 lg:flex-row lg:gap-6 lg:will-change-transform"
            >
              {/* Panel 1: Soft Rausch Blush stage — Discover Unique Stays */}
              <article className="grid shrink-0 gap-6 rounded-2xl border border-border bg-background p-6 sm:p-8 lg:w-[min(76vw,840px)] lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-9">
                <div className="flex flex-col items-start gap-3.5 lg:col-span-5">
                  <h3 className="font-book-serif text-3xl leading-[1.06] font-normal tracking-[0.03em] text-foreground uppercase sm:text-4xl">
                    Discover unique stays
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Compare private and shared rooms with real room photos,
                    guest limits, and nightly rates before you request a stay.
                  </p>
                  <a
                    href="#rooms"
                    className="mt-1 inline-flex min-h-11 items-center justify-center rounded-lg border border-control-border bg-surface px-5 text-sm font-medium text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted"
                  >
                    Browse rooms
                  </a>
                </div>

                <div className="overflow-hidden rounded-xl bg-accent p-5 sm:p-6 lg:col-span-7">
                  <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-3">
                    {previewRooms.length > 0 ? (
                      previewRooms.map((room, idx) => {
                        const slide = buildRoomGallerySlides(room)[0];
                        return (
                          <Link
                            key={room.roomId}
                            href={`/book/${room.roomId}?${queryString}`}
                            className={cn(
                              "flex flex-col overflow-hidden rounded-xl bg-surface shadow-sm transition-colors hover:ring-1 hover:ring-primary/40",
                              idx === 1 && "sm:-translate-y-1.5 sm:shadow-md",
                            )}
                          >
                            <div className="aspect-[4/3] w-full overflow-hidden bg-surface-muted">
                              <img
                                src={
                                  slide?.url ?? "/images/hero/stay-hero-500.jpg"
                                }
                                alt={room.title}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="grid gap-0.5 p-3">
                              <span className="truncate text-xs font-semibold text-foreground">
                                {room.title}
                              </span>
                              <span className="truncate text-[11px] text-muted-foreground tabular-nums">
                                {formatPhpCurrency(room.dailyRate)} / night
                              </span>
                            </div>
                          </Link>
                        );
                      })
                    ) : (
                      <div className="col-span-full overflow-hidden rounded-xl bg-surface shadow-sm">
                        <img
                          src="/images/hero/stay-hero-960.jpg"
                          alt="Clean guest room interior"
                          loading="lazy"
                          className="h-44 w-full object-cover"
                        />
                        <div className="p-4">
                          <p className="text-sm font-semibold text-foreground">
                            {availability.propertyName}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Private and shared rooms for short stays
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>

              {/* Panel 2: Soft Stone stage — Smart Search Made Simple */}
              <article className="grid shrink-0 gap-6 rounded-2xl border border-border bg-background p-6 sm:p-8 lg:w-[min(76vw,840px)] lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-9">
                <div className="flex flex-col items-start gap-3.5 lg:col-span-5">
                  <h3 className="font-book-serif text-3xl leading-[1.06] font-normal tracking-[0.03em] text-foreground uppercase sm:text-4xl">
                    Smart search made simple
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Pick your check-in date, check-out date, and total guests in
                    seconds. Live room availability updates right away.
                  </p>
                  <button
                    type="button"
                    onClick={onJumpToSearch}
                    className="mt-1 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-control-border bg-surface px-5 text-sm font-medium text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted"
                  >
                    Adjust stay dates
                  </button>
                </div>

                <div className="overflow-hidden rounded-xl bg-surface-muted p-5 sm:p-6 lg:col-span-7">
                  <div className="mx-auto max-w-sm overflow-hidden rounded-xl bg-surface shadow-sm">
                    <div className="h-24 w-full overflow-hidden bg-surface-muted">
                      <img
                        src="/images/hero/stay-hero-960.jpg"
                        alt="Featured stay view"
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="grid gap-2.5 p-4">
                      <div className="rounded-lg bg-background px-3 py-2">
                        <span className="block text-[11px] text-muted-foreground">
                          Property
                        </span>
                        <span className="block truncate text-sm font-medium text-foreground">
                          {availability.propertyName}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-lg bg-background px-3 py-2">
                          <span className="block text-[11px] text-muted-foreground">
                            Dates
                          </span>
                          <span className="block truncate text-xs font-medium text-foreground tabular-nums">
                            {stayDateSummary}
                          </span>
                        </div>
                        <div className="rounded-lg bg-background px-3 py-2">
                          <span className="block text-[11px] text-muted-foreground">
                            Guests
                          </span>
                          <span className="block truncate text-xs font-medium text-foreground">
                            {guestSummary}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onJumpToSearch}
                        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-primary-hover"
                      >
                        Search open rooms
                      </button>
                    </div>
                  </div>
                </div>
              </article>

              {/* Panel 3: Warm Charcoal stage — Fast Direct Request */}
              <article className="grid shrink-0 gap-6 rounded-2xl border border-border bg-background p-6 sm:p-8 lg:w-[min(76vw,840px)] lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-9">
                <div className="flex flex-col items-start gap-3.5 lg:col-span-5">
                  <h3 className="font-book-serif text-3xl leading-[1.06] font-normal tracking-[0.03em] text-foreground uppercase sm:text-4xl">
                    Fast direct request
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Send your details without creating an account. You get a
                    clear reference number while the host confirms your dates.
                  </p>
                  <Link
                    href={
                      primaryRoom
                        ? `/book/${primaryRoom.roomId}/request?${queryString}`
                        : "#rooms"
                    }
                    className="mt-1 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-primary-hover"
                  >
                    Request a stay
                  </Link>
                </div>

                <div className="overflow-hidden rounded-xl bg-foreground p-5 sm:p-6 lg:col-span-7">
                  <div className="mx-auto max-w-sm rounded-xl bg-surface p-5 shadow-md">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <span className="text-sm font-semibold text-foreground">
                        Stay summary
                      </span>
                      <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-accent-foreground">
                        Direct request
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Room</span>
                        <span className="truncate font-medium text-foreground">
                          {primaryRoom
                            ? primaryRoom.title
                            : "Select any open room"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Check-in</span>
                        <span className="font-medium text-foreground tabular-nums">
                          {formatManilaDate(availability.checkInDateManila)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Check-out</span>
                        <span className="font-medium text-foreground tabular-nums">
                          {formatManilaDate(availability.checkOutDateManila)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          Length of stay
                        </span>
                        <span className="font-medium text-foreground tabular-nums">
                          {availability.nights}{" "}
                          {availability.nights === 1 ? "night" : "nights"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground">
                        Estimated total
                      </span>
                      <span className="text-lg font-semibold text-foreground tabular-nums">
                        {primaryRoom
                          ? formatPhpCurrency(primaryRoom.indicativeTotalAmount)
                          : "Shown per room"}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>

          {/* Subtle progress indicator on desktop */}
          <div
            aria-hidden="true"
            className="mx-auto mt-7 hidden items-center justify-center gap-2 lg:flex"
          >
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  activeIndex === index
                    ? "w-10 bg-primary"
                    : "w-3 bg-control-border",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type StayAnywhereShowcaseProps = {
  availability: PublicAvailabilityDto;
  featuredRoom: PublicPublishedRoomDto | null;
  adults: number;
  childrenCount: number;
  queryString: string;
};

/**
 * Split blush-framed detail showcase paired with sticky editorial copy
 * ("BOOK DIRECT ANYWHERE") in Daisy's Rausch & charcoal palette.
 */
export function StayAnywhereShowcase({
  availability,
  featuredRoom,
  adults,
  childrenCount,
  queryString,
}: StayAnywhereShowcaseProps) {
  const featuredSlide = featuredRoom
    ? buildRoomGallerySlides(featuredRoom)[0]
    : null;
  const checkInClock = formatStayTime(availability.checkInTimeManila);
  const checkOutClock = formatStayTime(availability.checkOutTimeManila);

  return (
    <section
      aria-labelledby="stay-direct-heading"
      className="border-t border-border bg-background px-4 py-14 sm:px-6 lg:px-10 lg:py-20"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-12 lg:items-start lg:gap-12">
        {/* Left: Soft Rausch blush stage framing the crisp white room detail card */}
        <div className="overflow-hidden rounded-2xl bg-accent p-5 sm:p-8 lg:col-span-6">
          <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-surface shadow-sm">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-muted">
              <img
                src={featuredSlide?.url ?? "/images/hero/stay-hero-960.jpg"}
                alt={featuredRoom?.title ?? availability.propertyName}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <span className="absolute right-3 bottom-3 rounded-full bg-foreground/85 px-3 py-1 text-xs font-medium text-surface tabular-nums">
                {featuredRoom
                  ? `${buildRoomGallerySlides(featuredRoom).length || 1} photo${buildRoomGallerySlides(featuredRoom).length === 1 ? "" : "s"}`
                  : "Direct stay"}
              </span>
            </div>

            <div className="grid gap-4 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                <div className="grid gap-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    {featuredRoom?.title ?? availability.propertyName}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {featuredRoom
                      ? `${getScopeLabel(featuredRoom.scope)}, up to ${featuredRoom.capacity} ${featuredRoom.capacity === 1 ? "guest" : "guests"}`
                      : "Short-stay guest accommodations"}
                  </p>
                </div>
                {featuredRoom && (
                  <div className="shrink-0 text-right">
                    <span className="block text-lg font-semibold text-foreground tabular-nums">
                      {formatPhpCurrency(featuredRoom.indicativeTotalAmount)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                      {availability.nights}{" "}
                      {availability.nights === 1 ? "night" : "nights"}
                    </span>
                  </div>
                )}
              </div>

              <dl className="grid gap-2.5 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Selected stay</dt>
                  <dd className="font-medium text-foreground tabular-nums">
                    {formatManilaDate(availability.checkInDateManila)} to{" "}
                    {formatManilaDate(availability.checkOutDateManila)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Guests</dt>
                  <dd className="font-medium text-foreground">
                    {formatGuestsSummary(adults, childrenCount)}
                  </dd>
                </div>
                {checkInClock && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Standard check-in</dt>
                    <dd className="font-medium text-foreground tabular-nums">
                      {checkInClock}
                    </dd>
                  </div>
                )}
                {checkOutClock && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">
                      Standard check-out
                    </dt>
                    <dd className="font-medium text-foreground tabular-nums">
                      {checkOutClock}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-foreground">
                  About this stay
                </p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {availability.transientPolicyNote ??
                    featuredRoom?.description ??
                    "Every booking request is reviewed directly by the host so dates, room assignment, and total rates are confirmed cleanly before arrival."}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Sticky editorial callout & 3 aligned pillars */}
        <div className="flex flex-col items-start gap-7 lg:sticky lg:top-24 lg:col-span-6 lg:pt-2">
          <div className="grid gap-3.5">
            <h2
              id="stay-direct-heading"
              className="font-book-serif text-4xl leading-[0.98] font-normal tracking-[0.04em] text-foreground uppercase sm:text-5xl lg:text-6xl"
            >
              Book direct
              <br />
              anywhere
            </h2>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
              No sign-up wall and no hidden service charges. Check real room
              openings from your phone and send your request straight to the
              front desk.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-6 border-t border-border pt-6 sm:grid-cols-3">
            <div className="grid content-start gap-1">
              <span className="text-sm font-semibold text-foreground">
                Direct
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                No third-party fees or guest account needed
              </span>
            </div>
            <div className="grid content-start gap-1">
              <span className="text-sm font-semibold text-foreground">
                Transparent
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                Nightly rates and stay totals shown upfront
              </span>
            </div>
            <div className="grid content-start gap-1">
              <span className="text-sm font-semibold text-foreground">
                Confirmed
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                Host reviews and verifies every booking request
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#rooms"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-primary-hover"
            >
              Explore open rooms
            </a>
            {featuredRoom && (
              <Link
                href={`/book/${featuredRoom.roomId}?${queryString}`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-control-border bg-surface px-6 text-sm font-medium text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted"
              >
                View featured room
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

type EditorialBookingFooterProps = {
  propertyName: string;
  propertyAddress: string | null;
  contactPhone: string | null;
  checkInTimeManila: string;
  checkOutTimeManila: string;
  heroPhotoCredit?: string;
};

/**
 * Editorial footer ("GET IN TOUCH") aligned to the shared `max-w-7xl` grid.
 */
export function EditorialBookingFooter({
  propertyName,
  propertyAddress,
  contactPhone,
  checkInTimeManila,
  checkOutTimeManila,
  heroPhotoCredit,
}: EditorialBookingFooterProps) {
  const currentYear = new Date().getFullYear();
  const checkInClock = formatStayTime(checkInTimeManila);
  const checkOutClock = formatStayTime(checkOutTimeManila);

  return (
    <footer className="border-t border-border bg-surface text-muted-foreground">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-10 lg:py-16">
        <div className="mb-10 text-center lg:mb-12">
          <h2 className="font-book-serif text-4xl font-normal tracking-[0.06em] text-foreground uppercase sm:text-5xl">
            Get in touch
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-8 border-b border-border pb-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
          <div className="grid content-start gap-3">
            <h3 className="text-sm font-semibold text-foreground">Explore</h3>
            <ul className="grid gap-1.5 text-sm">
              <li>
                <a
                  href="#rooms"
                  className="inline-flex min-h-11 items-center transition-colors hover:text-primary sm:min-h-8"
                >
                  Available rooms
                </a>
              </li>
              <li>
                <a
                  href="#how-it-works"
                  className="inline-flex min-h-11 items-center transition-colors hover:text-primary sm:min-h-8"
                >
                  How booking works
                </a>
              </li>
              <li>
                <a
                  href="#top-hero"
                  className="inline-flex min-h-11 items-center transition-colors hover:text-primary sm:min-h-8"
                >
                  Search dates and guests
                </a>
              </li>
            </ul>
          </div>

          <div className="grid content-start gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Stay details
            </h3>
            <ul className="grid gap-2 text-sm">
              {checkInClock && <li>Check-in time: {checkInClock}</li>}
              {checkOutClock && <li>Check-out time: {checkOutClock}</li>}
              <li>Prices shown are estimates until confirmed by the host.</li>
              {heroPhotoCredit && (
                <li className="text-xs text-muted-foreground">
                  {heroPhotoCredit}
                </li>
              )}
            </ul>
          </div>

          <div className="grid content-start gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Front desk
            </h3>
            <ul className="grid gap-2 text-sm">
              {propertyAddress && (
                <li>
                  <a
                    href={buildOsmAreaSearchUrl(propertyAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center underline decoration-control-border underline-offset-4 transition-colors hover:text-foreground sm:min-h-8"
                  >
                    {propertyAddress}
                  </a>
                </li>
              )}
              {contactPhone ? (
                <li>
                  <a
                    href={`tel:${contactPhone.replace(/[^+\d]/g, "")}`}
                    className="inline-flex min-h-11 items-center underline decoration-control-border underline-offset-4 transition-colors hover:text-foreground sm:min-h-8"
                  >
                    Call {contactPhone}
                  </a>
                </li>
              ) : (
                <li>
                  Send a booking request online and the host will reach out.
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2.5">
            <DaisyBrand asLink={false} show="icon" tone="light" />
            <span className="font-book-serif text-base tracking-[0.12em] text-foreground uppercase">
              {propertyName}
            </span>
          </div>
          <p>
            &copy; {currentYear} {propertyName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
