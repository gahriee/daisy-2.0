"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  PUBLIC_BOOKING_CARD_ELEVATED_INTERACTIVE,
  PUBLIC_BOOKING_CARD_FOCAL,
} from "@/components/features/transients/public-booking-chrome";
import { ScrollReveal } from "@/components/features/transients/public-booking-scrollytelling";
import {
  MorphingAura,
  SelfDrawingLine,
  Tilt3DCard,
  WebGLAmbientField,
} from "@/components/features/transients/public-booking-visual-fx";
import { DaisyBrand } from "@/components/layout/daisy-brand";
import { parseHouseRulesList } from "@/features/settings/schemas";
import {
  buildGrabBookingUrl,
  buildMapDirectionsUrl,
  buildRoomGallerySlides,
  formatGuestsSummary,
  formatStayTime,
  getScopeLabel,
  hasValidMapCoordinates,
} from "@/features/transients/public-booking-view";
import {
  GrabBookingLinkButton,
  PropertyMapPreview,
} from "@/components/ui/property-map-pin";
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
  const [trackProgress, setTrackProgress] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDesktopMotion, setIsDesktopMotion] = useState(false);

  useEffect(() => {
    const mediaDesktop = window.matchMedia("(min-width: 1024px)");
    const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let rafId = 0;

    function updateProgress() {
      rafId = 0;
      const activeMotion = mediaDesktop.matches && !mediaReduced.matches;
      setIsDesktopMotion(activeMotion);
      if (!activeMotion) {
        setTranslateX(0);
        setTrackProgress(0);
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
      setTrackProgress(clamped);
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

  function jumpToChapter(index: number) {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const stickyTopOffset = 68;
    const wrapperTop = wrapper.getBoundingClientRect().top + window.scrollY;
    const scrollableDistance = Math.max(
      1,
      wrapper.offsetHeight - (window.innerHeight - stickyTopOffset),
    );
    const targetProgress = index === 0 ? 0 : index === 1 ? 0.5 : 1;
    window.scrollTo({
      top: wrapperTop - stickyTopOffset + targetProgress * scrollableDistance,
      behavior: "smooth",
    });
  }

  function getPanelFocusStyle(index: number) {
    if (!isDesktopMotion) return undefined;
    const panelCoord = trackProgress * 2;
    const dist = Math.min(1, Math.abs(panelCoord - index));
    const scale = 1 - dist * 0.03;
    const opacity = 1 - dist * 0.28;
    return {
      transform: `scale(${scale.toFixed(3)})`,
      opacity: Number(opacity.toFixed(3)),
    };
  }

  function getCardParallaxX(index: number, factor = 18) {
    if (!isDesktopMotion) return undefined;
    const delta = trackProgress * 2 - index;
    const shift = Math.max(-24, Math.min(24, -delta * factor));
    return { transform: `translate3d(${shift.toFixed(1)}px, 0, 0)` };
  }

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
          <ScrollReveal className="mx-auto mb-8 max-w-2xl text-center lg:mb-10">
            <h2
              id="how-it-works-heading"
              className="font-book-serif text-4xl font-normal tracking-[0.05em] text-foreground uppercase sm:text-5xl"
            >
              How it works
            </h2>
            <SelfDrawingLine className="mt-1.5" width={148} />
            <p className="mt-2.5 text-sm leading-6 text-muted-foreground sm:text-base">
              Explore open rooms, pick your stay dates and guest count, then
              send a direct request with clear nightly estimates.
            </p>
          </ScrollReveal>

          <div className="mx-auto -my-4 w-full max-w-7xl py-4 lg:overflow-hidden">
            <div
              ref={trackRef}
              style={
                translateX > 0
                  ? { transform: `translate3d(-${translateX}px, 0, 0)` }
                  : undefined
              }
              className="flex flex-col gap-6 lg:flex-row lg:gap-6 lg:will-change-transform"
            >
              {/* Panel 1: Discover Unique Stays */}
              <article
                style={getPanelFocusStyle(0)}
                className="grid shrink-0 gap-6 rounded-2xl bg-background p-6 ring-1 ring-foreground/[0.05] shadow-[0_1px_2px_rgb(34_34_34/0.04),0_12px_32px_-16px_rgb(34_34_34/0.12)] transition-[opacity,transform] duration-200 sm:p-8 lg:w-[min(76vw,840px)] lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-9"
              >
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

                <div
                  style={getCardParallaxX(0, 14)}
                  className="grid grid-cols-1 items-center gap-4 will-change-transform sm:grid-cols-3 lg:col-span-7"
                >
                  {previewRooms.length > 0 ? (
                    previewRooms.map((room, idx) => {
                      const slide = buildRoomGallerySlides(room)[0];
                      return (
                        <Link
                          key={room.roomId}
                          href={`/book/${room.roomId}?${queryString}`}
                          className={cn(
                            "flex flex-col overflow-hidden rounded-2xl hover:ring-primary/35",
                            idx === 1
                              ? cn(
                                  PUBLIC_BOOKING_CARD_FOCAL,
                                  "transition-[box-shadow,transform] duration-(--duration-control) ease-(--ease-control) sm:-translate-y-1.5",
                                )
                              : PUBLIC_BOOKING_CARD_ELEVATED_INTERACTIVE,
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
                          <div className="grid gap-0.5 p-3.5">
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
                    <div
                      className={cn(
                        "col-span-full overflow-hidden rounded-2xl",
                        PUBLIC_BOOKING_CARD_FOCAL,
                      )}
                    >
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
              </article>

              {/* Panel 2: Smart Search Made Simple */}
              <article
                style={getPanelFocusStyle(1)}
                className="grid shrink-0 gap-6 rounded-2xl bg-background p-6 ring-1 ring-foreground/[0.05] shadow-[0_1px_2px_rgb(34_34_34/0.04),0_12px_32px_-16px_rgb(34_34_34/0.12)] transition-[opacity,transform] duration-200 sm:p-8 lg:w-[min(76vw,840px)] lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-9"
              >
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

                <div
                  style={getCardParallaxX(1, 20)}
                  className="flex items-center justify-center will-change-transform lg:col-span-7"
                >
                  <Tilt3DCard
                    maxTiltDeg={5}
                    className={cn(
                      "w-full max-w-sm overflow-hidden rounded-2xl",
                      PUBLIC_BOOKING_CARD_FOCAL,
                    )}
                  >
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
                        className="book-animated-gradient-cta inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors duration-(--duration-control) ease-(--ease-control)"
                      >
                        Search open rooms
                      </button>
                    </div>
                  </Tilt3DCard>
                </div>
              </article>

              {/* Panel 3: Fast Direct Request */}
              <article
                style={getPanelFocusStyle(2)}
                className="grid shrink-0 gap-6 rounded-2xl bg-background p-6 ring-1 ring-foreground/[0.05] shadow-[0_1px_2px_rgb(34_34_34/0.04),0_12px_32px_-16px_rgb(34_34_34/0.12)] transition-[opacity,transform] duration-200 sm:p-8 lg:w-[min(76vw,840px)] lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-9"
              >
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

                <div
                  style={getCardParallaxX(2, 20)}
                  className="flex items-center justify-center will-change-transform lg:col-span-7"
                >
                  <Tilt3DCard
                    maxTiltDeg={5}
                    className={cn(
                      "w-full max-w-sm rounded-2xl p-5",
                      PUBLIC_BOOKING_CARD_FOCAL,
                    )}
                  >
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
                  </Tilt3DCard>
                </div>
              </article>
            </div>
          </div>

          {/* Interactive chapter progress indicator on desktop */}
          <div className="mx-auto mt-7 hidden max-w-md flex-col items-center gap-3 lg:flex">
            <div className="flex items-center gap-5 text-xs font-medium">
              {(
                [
                  [0, "01", "Discover"],
                  [1, "02", "Search"],
                  [2, "03", "Request"],
                ] as const
              ).map(([index, step, label]) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => jumpToChapter(index)}
                  aria-current={activeIndex === index ? "step" : undefined}
                  className={cn(
                    "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 transition-colors duration-(--duration-control)",
                    activeIndex === index
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="tabular-nums opacity-75">{step}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="h-1 w-48 overflow-hidden rounded-full bg-border"
            >
              <div
                className="h-full w-full origin-left rounded-full bg-primary will-change-transform"
                style={{
                  transform: `scaleX(${Math.max(0.08, trackProgress).toFixed(3)})`,
                }}
              />
            </div>
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
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [pinProgress, setPinProgress] = useState(0);
  const [isDesktopPinned, setIsDesktopPinned] = useState(false);

  useEffect(() => {
    const mediaDesktop = window.matchMedia("(min-width: 1024px)");
    const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let rafId = 0;

    function updatePinProgress() {
      rafId = 0;
      const shouldPin = mediaDesktop.matches && !mediaReduced.matches;
      setIsDesktopPinned(shouldPin);
      if (!shouldPin) {
        setPinProgress(1);
        return;
      }
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const stickyTopOffset = 68;
      const scrollableDistance = Math.max(
        1,
        wrapper.offsetHeight - (window.innerHeight - stickyTopOffset),
      );
      const raw = (stickyTopOffset - rect.top) / scrollableDistance;
      setPinProgress(Math.min(1, Math.max(0, raw)));
    }

    function schedule() {
      if (!rafId) {
        rafId = window.requestAnimationFrame(updatePinProgress);
      }
    }

    updatePinProgress();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    mediaDesktop.addEventListener("change", schedule);
    mediaReduced.addEventListener("change", schedule);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      mediaDesktop.removeEventListener("change", schedule);
      mediaReduced.removeEventListener("change", schedule);
    };
  }, []);

  const featuredSlide = featuredRoom
    ? buildRoomGallerySlides(featuredRoom)[0]
    : null;
  const checkInClock = formatStayTime(availability.checkInTimeManila);
  const checkOutClock = formatStayTime(availability.checkOutTimeManila);

  // Smooth zoom-out on the featured room photo while the section stays pinned
  const imageScale = isDesktopPinned
    ? Math.max(1, 1.08 - pinProgress * 0.08)
    : 1;
  const cardShiftY = isDesktopPinned ? (0.5 - pinProgress) * 14 : 0;

  // Each pillar fills smoothly in sequence; Confirmed finishes at 0.84 so all 3
  // are 100% illuminated before the sticky runway releases into the footer.
  const pillars = [
    {
      title: "Direct",
      body: "No third-party fees or guest account needed",
      start: 0.0,
      end: 0.28,
    },
    {
      title: "Transparent",
      body: "Nightly rates and stay totals shown upfront",
      start: 0.28,
      end: 0.56,
    },
    {
      title: "Confirmed",
      body: "Host reviews and verifies every booking request",
      start: 0.56,
      end: 0.84,
    },
  ] as const;

  return (
    <section
      aria-labelledby="stay-direct-heading"
      className="relative border-t border-border bg-background"
    >
      <div ref={wrapperRef} className="relative lg:h-[220vh]">
        <div className="px-4 py-14 sm:px-6 lg:sticky lg:top-[68px] lg:flex lg:min-h-[calc(100svh-68px)] lg:items-center lg:px-10 lg:py-12">
          <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
            {/* Left: Elevated featured room detail card with organic morphing aura & 3D tilt */}
            <ScrollReveal
              variant="scale"
              className="relative flex justify-center lg:col-span-6"
            >
              <MorphingAura className="absolute -inset-6 m-auto h-[380px] w-[380px] opacity-80 sm:h-[460px] sm:w-[460px]" />
              <div
                style={
                  isDesktopPinned
                    ? {
                        transform: `translate3d(0, ${cardShiftY.toFixed(1)}px, 0)`,
                      }
                    : undefined
                }
                className="relative z-10 w-full max-w-md will-change-transform"
              >
                <Tilt3DCard
                  maxTiltDeg={5}
                  className={cn(
                    "w-full overflow-hidden rounded-2xl",
                    PUBLIC_BOOKING_CARD_FOCAL,
                  )}
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-muted">
                    <img
                      src={
                        featuredSlide?.url ?? "/images/hero/stay-hero-960.jpg"
                      }
                      alt={featuredRoom?.title ?? availability.propertyName}
                      loading="lazy"
                      style={
                        isDesktopPinned
                          ? { transform: `scale(${imageScale.toFixed(3)})` }
                          : undefined
                      }
                      className="h-full w-full object-cover will-change-transform"
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
                            {formatPhpCurrency(
                              featuredRoom.indicativeTotalAmount,
                            )}
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
                          <dt className="text-muted-foreground">
                            Standard check-in
                          </dt>
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
                </Tilt3DCard>
              </div>
            </ScrollReveal>

            {/* Right: Pinned editorial callout & scroll-gated 3 pillars */}
            <ScrollReveal
              delayMs={100}
              className="flex flex-col items-start gap-7 lg:col-span-6"
            >
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
                {pillars.map((pillar) => {
                  const fill = isDesktopPinned
                    ? Math.min(
                        1,
                        Math.max(
                          0,
                          (pinProgress - pillar.start) /
                            (pillar.end - pillar.start),
                        ),
                      )
                    : 1;
                  const active = fill > 0.05;
                  return (
                    <div
                      key={pillar.title}
                      className={cn(
                        "grid content-start gap-1.5 transition-opacity duration-300",
                        active ? "opacity-100" : "opacity-40",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="mb-1 block h-0.5 w-full overflow-hidden rounded-full bg-border"
                      >
                        <span
                          style={{ transform: `scaleX(${fill.toFixed(3)})` }}
                          className="block h-full w-full origin-left rounded-full bg-primary will-change-transform"
                        />
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {pillar.title}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">
                        {pillar.body}
                      </span>
                    </div>
                  );
                })}
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
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
}

type HouseRulesSectionProps = {
  rulesText: string | null;
};

type HouseRuleRowProps = {
  index: number;
  rule: string;
};

function HouseRuleRow({ index, rule }: HouseRuleRowProps) {
  const rowRef = useRef<HTMLLIElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;

    const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaReduced.matches || typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25, rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const delayMs = Math.min(index * 80, 400);

  return (
    <li
      ref={rowRef}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={cn(
        "flex items-start gap-4 py-4 first:pt-0 last:pb-0 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      <span
        aria-hidden="true"
        style={{ transitionDelay: `${delayMs + 60}ms` }}
        className={cn(
          "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground tabular-nums transition-transform duration-500 ease-out motion-reduce:transition-none",
          visible ? "scale-100" : "scale-75",
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="text-sm leading-6 text-foreground sm:text-[15px]">
        {rule}
      </span>
    </li>
  );
}

/**
 * Editorial House Rules section (`#house-rules`) on `/book`, driven by the
 * Owner's configured rules in Settings -> Stays & limits.
 */
export function HouseRulesSection({ rulesText }: HouseRulesSectionProps) {
  const rules = parseHouseRulesList(rulesText);
  if (rules.length === 0) return null;

  return (
    <section
      id="house-rules"
      aria-labelledby="house-rules-heading"
      className="border-t border-border bg-background px-4 py-14 sm:px-6 lg:px-10 lg:py-20"
    >
      <div className="mx-auto w-full max-w-3xl">
        <ScrollReveal className="mb-8 text-center">
          <h2
            id="house-rules-heading"
            className="font-book-serif text-4xl font-normal tracking-[0.05em] text-foreground uppercase sm:text-5xl"
          >
            House rules
          </h2>
          <SelfDrawingLine className="mt-1.5" width={148} />
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Please review these simple guidelines so every guest enjoys a safe,
            clean, and peaceful stay.
          </p>
        </ScrollReveal>

        <ScrollReveal variant="scale">
          <div
            className={cn(
              "rounded-2xl p-6 sm:p-8 lg:p-10",
              PUBLIC_BOOKING_CARD_FOCAL,
            )}
          >
            <ol className="divide-y divide-border/70">
              {rules.map((rule, index) => (
                <HouseRuleRow
                  key={`${index}-${rule.slice(0, 24)}`}
                  index={index}
                  rule={rule}
                />
              ))}
            </ol>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

type EditorialBookingFooterProps = {
  propertyName: string;
  propertyAddress: string | null;
  propertyLatitude?: number | null | undefined;
  propertyLongitude?: number | null | undefined;
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
  propertyLatitude,
  propertyLongitude,
  contactPhone,
  checkInTimeManila,
  checkOutTimeManila,
  heroPhotoCredit,
}: EditorialBookingFooterProps) {
  const currentYear = new Date().getFullYear();
  const checkInClock = formatStayTime(checkInTimeManila);
  const checkOutClock = formatStayTime(checkOutTimeManila);
  const directionsUrl = buildMapDirectionsUrl({
    address: propertyAddress,
    latitude: propertyLatitude,
    longitude: propertyLongitude,
  });
  const grabUrl = buildGrabBookingUrl({
    address: propertyAddress,
    latitude: propertyLatitude,
    longitude: propertyLongitude,
    propertyName,
  });
  const hasPin = hasValidMapCoordinates(propertyLatitude, propertyLongitude);

  return (
    <footer className="relative overflow-hidden border-t border-border bg-surface text-muted-foreground">
      <WebGLAmbientField intensity={0.55} className="opacity-75" />
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-10 lg:py-16">
        <ScrollReveal className="mb-10 text-center lg:mb-12">
          <h2 className="font-book-serif text-4xl font-normal tracking-[0.06em] text-foreground uppercase sm:text-5xl">
            Get in touch
          </h2>
          <SelfDrawingLine className="mt-1.5" width={148} />
        </ScrollReveal>

        <ScrollReveal delayMs={80}>
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
                Location &amp; front desk
              </h3>
              <ul className="grid gap-2 text-sm">
                {propertyAddress && <li>{propertyAddress}</li>}
                {(directionsUrl || grabUrl) && (
                  <li className="flex flex-wrap items-center gap-2">
                    {directionsUrl && (
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-primary-hover"
                      >
                        Get directions
                      </a>
                    )}
                    {grabUrl && (
                      <GrabBookingLinkButton href={grabUrl} size="sm" />
                    )}
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
              {hasPin && (
                <div className="pt-2">
                  <PropertyMapPreview
                    latitude={propertyLatitude!}
                    longitude={propertyLongitude!}
                    propertyName={propertyName}
                    propertyAddress={propertyAddress}
                    className="h-44 sm:h-48"
                  />
                </div>
              )}
            </div>
          </div>
        </ScrollReveal>

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
