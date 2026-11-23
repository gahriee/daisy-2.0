"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PublicBookingCardsSkeleton } from "@/components/common/page-skeletons";
import {
  GuestCountStepperRow,
  PUBLIC_BOOKING_CARD_ELEVATED_INTERACTIVE,
  PUBLIC_BOOKING_CARD_FOCAL,
} from "@/components/features/transients/public-booking-chrome";
import { PublicStayDateRangeCalendar } from "@/components/features/transients/public-stay-date-range-picker";
import { PublicBookingTracker } from "@/components/features/transients/public-booking-tracker";
import {
  ScrollReveal,
  ScrollStoryProgress,
} from "@/components/features/transients/public-booking-scrollytelling";
import {
  SelfDrawingLine,
  Tilt3DCard,
} from "@/components/features/transients/public-booking-visual-fx";
import {
  EditorialBookingFooter,
  HouseRulesSection,
  HowItWorksScrollTrack,
  StayAnywhereShowcase,
} from "@/components/features/transients/public-booking-sections";
import { DaisyBrand } from "@/components/layout/daisy-brand";
import {
  buildPublicStayQueryString,
  buildRoomGallerySlides,
  filterAndSortPublicRooms,
  formatGuestsSummary,
  getRoomAvailabilityStatus,
  getScopeLabel,
} from "@/features/transients/public-booking-view";
import type {
  PublicAvailabilityDto,
  PublicPublishedRoomDto,
} from "@/features/transients/schemas";
import {
  ROOM_PHOTO_OUTPUT_HEIGHT,
  ROOM_PHOTO_OUTPUT_WIDTH,
} from "@/features/rooms/schemas";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import { cn } from "@/lib/cn";

type PublicBookingClientProps = {
  initialAvailability: PublicAvailabilityDto;
  initialAdults: number;
  initialChildren: number;
};

type SearchPopoverPanel = "WHEN_IN" | "WHEN_OUT" | "WHO" | "FILTER" | null;
type ScopeFilter = "ALL" | "WHOLE_ROOM" | "BED";

const MAX_PUBLIC_GUESTS = 20;

export function PublicBookingClient({
  initialAvailability,
  initialAdults,
  initialChildren,
}: PublicBookingClientProps) {
  const safeInitialAdults = Math.max(1, initialAdults);
  const safeInitialChildren = Math.max(
    0,
    Math.min(MAX_PUBLIC_GUESTS - safeInitialAdults, initialChildren),
  );

  const [availability, setAvailability] =
    useState<PublicAvailabilityDto>(initialAvailability);
  const [activeSelection, setActiveSelection] = useState({
    checkIn: initialAvailability.checkInDateManila,
    checkOut: initialAvailability.checkOutDateManila,
    adults: safeInitialAdults,
    children: safeInitialChildren,
  });

  const [draftCheckIn, setDraftCheckIn] = useState(
    initialAvailability.checkInDateManila,
  );
  const [draftCheckOut, setDraftCheckOut] = useState(
    initialAvailability.checkOutDateManila,
  );
  const [draftAdults, setDraftAdults] = useState(safeInitialAdults);
  const [draftChildren, setDraftChildren] = useState(safeInitialChildren);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("ALL");

  const [openPopover, setOpenPopover] = useState<SearchPopoverPanel>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [slideIndexByRoomId, setSlideIndexByRoomId] = useState<
    Record<string, number>
  >({});
  const [deckIndex, setDeckIndex] = useState(0);

  const searchBarRef = useRef<HTMLDivElement | null>(null);
  const roomsSectionRef = useRef<HTMLElement | null>(null);
  const heroImageRef = useRef<HTMLImageElement | null>(null);
  const heroBackDeckRef = useRef<HTMLDivElement | null>(null);
  const searchSeqRef = useRef(0);

  // Subtle GPU-composited hero parallax on scroll (disabled on reduced motion)
  useEffect(() => {
    const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaReduced.matches) return;

    let rafId = 0;

    function updateParallax() {
      rafId = 0;
      const scrollY = window.scrollY;
      const clamped = Math.min(1, Math.max(0, scrollY / 720));
      if (heroImageRef.current) {
        const y = clamped * 44;
        const scale = 1.04 + clamped * 0.05;
        heroImageRef.current.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      }
      if (heroBackDeckRef.current) {
        const deckY = 8 - clamped * 14;
        const deckRot = -4 - clamped * 2.5;
        heroBackDeckRef.current.style.transform = `translate3d(-10px, ${deckY.toFixed(1)}px, 0) rotate(${deckRot.toFixed(2)}deg)`;
      }
    }

    function schedule() {
      if (!rafId) {
        rafId = window.requestAnimationFrame(updateParallax);
      }
    }

    updateParallax();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", schedule);
    };
  }, []);

  useEffect(() => {
    if (!openPopover) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-daisy-picker-popover="true"]')) {
        return;
      }
      if (
        searchBarRef.current &&
        !searchBarRef.current.contains(event.target as Node)
      ) {
        setOpenPopover(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPopover(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPopover]);

  const activeTotalGuests = activeSelection.adults + activeSelection.children;

  const sortedRooms = useMemo(
    () =>
      filterAndSortPublicRooms(availability.rooms, {
        roomTypeFilter: "ALL",
        availabilityFilter: "ALL",
        sortBy: "RECOMMENDED",
        requestedGuests: activeTotalGuests,
      }),
    [availability.rooms, activeTotalGuests],
  );

  // Hide rooms that are already booked for the selected stay dates
  const openRoomsForDates = useMemo(
    () =>
      sortedRooms.filter((room) =>
        room.scope === "WHOLE_ROOM"
          ? room.availableUnitsForRange === 1
          : room.availableUnitsForRange >= 1,
      ),
    [sortedRooms],
  );

  const visibleRooms = useMemo(() => {
    if (scopeFilter === "ALL") return openRoomsForDates;
    return openRoomsForDates.filter((room) => room.scope === scopeFilter);
  }, [openRoomsForDates, scopeFilter]);

  const showcaseRooms =
    openRoomsForDates.length > 0 ? openRoomsForDates : sortedRooms;

  const currentStayQuery = useMemo(
    () => buildPublicStayQueryString(activeSelection),
    [activeSelection],
  );

  const fallbackDeckItem = useMemo(
    () => ({
      id: "stand-in-1",
      roomId: null as string | null,
      title: availability.propertyName,
      subtitle: "Short-stay guest rooms",
      priceLabel: "Direct rates",
      imageUrl: "/images/hero/stay-hero-960.jpg",
      secondaryImageUrl: "/images/hero/stay-hero-500.jpg",
    }),
    [availability.propertyName],
  );

  // Featured preview deck items for the right-hand Video 1 hero column
  const deckItems = useMemo(() => {
    if (showcaseRooms.length === 0) {
      return [fallbackDeckItem];
    }

    return showcaseRooms.map((room, idx) => {
      const slides = buildRoomGallerySlides(room);
      const nextRoom = showcaseRooms[(idx + 1) % showcaseRooms.length];
      const nextSlide = nextRoom ? buildRoomGallerySlides(nextRoom)[0] : null;
      return {
        id: room.roomId,
        roomId: room.roomId as string | null,
        title: room.title,
        subtitle: getScopeLabel(room.scope),
        priceLabel: formatPhpCurrency(room.dailyRate),
        imageUrl: slides[0]?.url ?? "/images/hero/stay-hero-960.jpg",
        secondaryImageUrl:
          slides[1]?.url ?? nextSlide?.url ?? "/images/hero/stay-hero-500.jpg",
      };
    });
  }, [showcaseRooms, fallbackDeckItem]);

  const safeDeckIndex = deckItems.length > 0 ? deckIndex % deckItems.length : 0;
  const activeDeckItem = deckItems[safeDeckIndex] ?? fallbackDeckItem;

  // Warm browser cache for featured deck cover images so stepping `<` / `>` is instant
  useEffect(() => {
    if (deckItems.length <= 1) return;
    const urls = new Set<string>();
    for (const item of deckItems) {
      if (item.imageUrl) urls.add(item.imageUrl);
      if (item.secondaryImageUrl) urls.add(item.secondaryImageUrl);
    }
    const preloaded: HTMLImageElement[] = [];
    for (const url of urls) {
      const img = new window.Image();
      img.decoding = "async";
      img.src = url;
      preloaded.push(img);
    }
    return () => {
      preloaded.length = 0;
    };
  }, [deckItems]);

  function stepDeck(delta: number) {
    if (deckItems.length <= 1) return;
    setDeckIndex(
      (prev) => (prev + delta + deckItems.length) % deckItems.length,
    );
  }

  async function applySearch(override?: {
    checkIn?: string;
    checkOut?: string;
    adults?: number;
    children?: number;
    scrollToRooms?: boolean;
  }) {
    const nextCheckIn = override?.checkIn ?? draftCheckIn;
    const nextCheckOut = override?.checkOut ?? draftCheckOut;
    const nextAdults = override?.adults ?? draftAdults;
    const nextChildren = override?.children ?? draftChildren;
    const totalGuests = nextAdults + nextChildren;

    if (!nextCheckIn || !nextCheckOut || nextCheckOut <= nextCheckIn) {
      setSearchError("Choose a check-out date after your check-in date.");
      setOpenPopover("WHEN_IN");
      return;
    }
    if (totalGuests < 1 || totalGuests > MAX_PUBLIC_GUESTS) {
      setSearchError(
        `Guests must be between 1 and ${MAX_PUBLIC_GUESTS} in total.`,
      );
      setOpenPopover("WHO");
      return;
    }

    const requestSeq = ++searchSeqRef.current;
    setSearchError(null);
    setLoadingAvailability(true);

    try {
      const apiQuery = new URLSearchParams({
        checkIn: nextCheckIn,
        checkOut: nextCheckOut,
        guests: String(totalGuests),
      });
      const response = await fetch(
        `/api/public/availability?${apiQuery.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      const data = await response.json();
      if (requestSeq !== searchSeqRef.current) return;
      if (!response.ok) {
        setSearchError(
          typeof data?.error === "string"
            ? data.error
            : "Could not refresh room availability. Try again.",
        );
        return;
      }

      const nextSelection = {
        checkIn: nextCheckIn,
        checkOut: nextCheckOut,
        adults: nextAdults,
        children: nextChildren,
      };
      setAvailability(data as PublicAvailabilityDto);
      setActiveSelection(nextSelection);
      setDraftCheckIn(nextCheckIn);
      setDraftCheckOut(nextCheckOut);
      setDraftAdults(nextAdults);
      setDraftChildren(nextChildren);
      setOpenPopover(null);

      const urlQuery = buildPublicStayQueryString(nextSelection);
      window.history.replaceState(null, "", `/book?${urlQuery}`);

      if (override?.scrollToRooms) {
        roomsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch {
      if (requestSeq !== searchSeqRef.current) return;
      setSearchError(
        "Unable to reach the reservation desk right now. Check your connection and try again.",
      );
    } finally {
      if (requestSeq === searchSeqRef.current) {
        setLoadingAvailability(false);
      }
    }
  }

  function stepCardSlide(roomId: string, totalSlides: number, delta: number) {
    if (totalSlides <= 1) return;
    setSlideIndexByRoomId((current) => {
      const prev = current[roomId] ?? 0;
      const next = (prev + delta + totalSlides) % totalSlides;
      return { ...current, [roomId]: next };
    });
  }

  function jumpToHeroSearch() {
    searchBarRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setOpenPopover("WHEN_IN");
  }

  const filterLabel =
    scopeFilter === "ALL"
      ? "All rooms"
      : scopeFilter === "WHOLE_ROOM"
        ? "Private rooms"
        : "Shared rooms";

  const activeStaySummary = `${formatManilaDate(availability.checkInDateManila)} to ${formatManilaDate(availability.checkOutDateManila)}, ${availability.nights} ${availability.nights === 1 ? "night" : "nights"}, ${formatGuestsSummary(activeSelection.adults, activeSelection.children)}`;

  return (
    <div
      id="top-hero"
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      {/* Top editorial navigation bar aligned to the shared max-w-7xl rail */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-md">
        <ScrollStoryProgress />
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <Link
            href={`/book?${currentStayQuery}`}
            className="flex min-h-11 min-w-0 shrink-0 items-center gap-2.5 text-foreground transition-colors hover:text-primary"
          >
            <DaisyBrand asLink={false} show="icon" tone="light" />
            <span className="truncate whitespace-nowrap text-sm font-semibold tracking-[0.1em] uppercase">
              {availability.propertyName}
            </span>
          </Link>

          <p className="hidden shrink-0 whitespace-nowrap text-center text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase xl:block">
            Direct short-stay booking
          </p>

          <nav
            aria-label="Booking navigation"
            className="flex shrink-0 flex-nowrap items-center gap-3 sm:gap-5"
          >
            <a
              href="#rooms"
              className="hidden min-h-11 items-center whitespace-nowrap text-xs font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Rooms
            </a>
            <a
              href="#how-it-works"
              className="hidden min-h-11 items-center whitespace-nowrap text-xs font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
            >
              How it works
            </a>
            <a
              href="#house-rules"
              className="hidden min-h-11 items-center whitespace-nowrap text-xs font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
            >
              House rules
            </a>
            <a
              href="#track"
              className="inline-flex min-h-11 items-center whitespace-nowrap text-xs font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              Track booking
            </a>
            {availability.contactPhone && (
              <a
                href={`tel:${availability.contactPhone.replace(/[^+\d]/g, "")}`}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-control-border bg-surface px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                {availability.contactPhone}
              </a>
            )}
          </nav>
        </div>
      </header>

      <main id="main-content" className="w-full flex-1">
        {/* Video 1 composition aligned to the shared max-w-7xl rail */}
        <section
          aria-label="Short-stay hero and search"
          className="relative mx-auto w-full max-w-7xl px-4 pt-4 pb-8 sm:px-6 sm:pt-6 lg:px-10 lg:pb-12"
        >
          <div
            className={cn(
              "grid overflow-visible rounded-2xl lg:min-h-[600px] lg:grid-cols-12 xl:min-h-[650px]",
              PUBLIC_BOOKING_CARD_FOCAL,
            )}
          >
            {/* Left ~66%: Full-bleed sunlit room hero + uppercase headline + crisp 2x2 booking bar */}
            <div className="relative flex flex-col justify-between gap-8 overflow-visible rounded-t-2xl p-6 sm:p-8 lg:col-span-8 lg:rounded-t-none lg:rounded-l-2xl lg:p-10 xl:p-12">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-t-2xl lg:rounded-t-none lg:rounded-l-2xl"
              >
                <img
                  ref={heroImageRef}
                  src="/images/hero/stay-hero-1280.jpg"
                  srcSet="/images/hero/stay-hero-500.jpg 500w, /images/hero/stay-hero-960.jpg 960w, /images/hero/stay-hero-1280.jpg 1280w"
                  sizes="(max-width: 1023px) 100vw, 66vw"
                  width={1280}
                  height={853}
                  alt="Sunlit guest bedroom with crisp white linens, terracotta throw blanket, ceiling fan, and armchair beside a bright window"
                  fetchPriority="high"
                  decoding="async"
                  data-source="stand-in"
                  data-subject="stand-in"
                  className="h-full w-full object-cover object-center will-change-transform"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-foreground/70 via-foreground/35 to-foreground/80" />
              </div>

              {/* Headline + asterisk editorial subtitle */}
              <div className="relative z-10 max-w-2xl pt-2 sm:pt-4">
                <h1 className="book-hero-reveal text-4xl leading-[0.94] font-semibold tracking-[-0.03em] text-surface uppercase sm:text-6xl xl:text-[4.5rem]">
                  Explore
                  <br />
                  comfortable
                  <br />
                  short stays
                </h1>

                <div className="book-hero-reveal-delay mt-6 flex items-start gap-3 text-sm leading-6 text-surface/90 sm:max-w-md">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="mt-1 size-4 shrink-0 text-surface"
                  >
                    <path d="M10 2v16M2 10h16M4.3 4.3l11.4 11.4M15.7 4.3 4.3 15.7" />
                  </svg>
                  <p>
                    Clean private and shared rooms with upfront nightly rates
                    and direct confirmation from the host.
                  </p>
                </div>
              </div>

              {/* Bottom frosted white 2x2 booking widget + full-width Rausch Book now CTA */}
              <div
                ref={searchBarRef}
                className="relative z-30 mx-auto mt-auto w-full max-w-xl"
              >
                <div className="grid gap-2.5 rounded-2xl border border-border/90 bg-surface/95 p-3 shadow-lg backdrop-blur-md sm:p-3.5">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPopover((prev) =>
                          prev === "WHEN_IN" ? null : "WHEN_IN",
                        )
                      }
                      aria-expanded={openPopover === "WHEN_IN"}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-background px-3.5 py-2 text-left transition-colors hover:border-control-border hover:bg-surface-muted/70",
                        openPopover === "WHEN_IN" &&
                          "border-primary bg-accent/40",
                      )}
                    >
                      <span className="grid min-w-0">
                        <span className="text-[11px] text-muted-foreground">
                          Check-in
                        </span>
                        <span className="truncate text-sm font-medium text-foreground tabular-nums">
                          {formatManilaDate(draftCheckIn)}
                        </span>
                      </span>
                      <CalendarIcon />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenPopover((prev) =>
                          prev === "WHEN_OUT" ? null : "WHEN_OUT",
                        )
                      }
                      aria-expanded={openPopover === "WHEN_OUT"}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-background px-3.5 py-2 text-left transition-colors hover:border-control-border hover:bg-surface-muted/70",
                        openPopover === "WHEN_OUT" &&
                          "border-primary bg-accent/40",
                      )}
                    >
                      <span className="grid min-w-0">
                        <span className="text-[11px] text-muted-foreground">
                          Check-out
                        </span>
                        <span className="truncate text-sm font-medium text-foreground tabular-nums">
                          {formatManilaDate(draftCheckOut)}
                        </span>
                      </span>
                      <CalendarIcon />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenPopover((prev) =>
                          prev === "WHO" ? null : "WHO",
                        )
                      }
                      aria-expanded={openPopover === "WHO"}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-background px-3.5 py-2 text-left transition-colors hover:border-control-border hover:bg-surface-muted/70",
                        openPopover === "WHO" && "border-primary bg-accent/40",
                      )}
                    >
                      <span className="grid min-w-0">
                        <span className="text-[11px] text-muted-foreground">
                          Guests
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">
                          {formatGuestsSummary(draftAdults, draftChildren)}
                        </span>
                      </span>
                      <GuestsIcon />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenPopover((prev) =>
                          prev === "FILTER" ? null : "FILTER",
                        )
                      }
                      aria-expanded={openPopover === "FILTER"}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-background px-3.5 py-2 text-left transition-colors hover:border-control-border hover:bg-surface-muted/70",
                        openPopover === "FILTER" &&
                          "border-primary bg-accent/40",
                      )}
                    >
                      <span className="grid min-w-0">
                        <span className="text-[11px] text-muted-foreground">
                          Room type
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">
                          {filterLabel}
                        </span>
                      </span>
                      <FilterIcon />
                    </button>
                  </div>

                  {/* Full-width primary Rausch animated-gradient Book now CTA */}
                  <button
                    type="button"
                    disabled={loadingAvailability}
                    onClick={() => applySearch({ scrollToRooms: true })}
                    className="book-animated-gradient-cta inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors duration-(--duration-control) ease-(--ease-control) disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingAvailability ? "Checking..." : "Book now"}
                  </button>
                </div>

                {/* Popovers */}
                {(openPopover === "WHEN_IN" || openPopover === "WHEN_OUT") && (
                  <div
                    role="region"
                    aria-label="Choose check-in and check-out dates"
                    className="absolute inset-x-0 top-full z-50 mt-2.5 w-full sm:right-auto sm:w-[min(92vw,580px)]"
                  >
                    <PublicStayDateRangeCalendar
                      key={openPopover}
                      checkIn={draftCheckIn}
                      checkOut={draftCheckOut}
                      initialPhase={
                        openPopover === "WHEN_OUT" ? "checkOut" : "checkIn"
                      }
                      onClose={() => setOpenPopover(null)}
                      onRangeSelect={(nextCheckIn, nextCheckOut) => {
                        setDraftCheckIn(nextCheckIn);
                        setDraftCheckOut(nextCheckOut);
                        setOpenPopover(null);
                        void applySearch({
                          checkIn: nextCheckIn,
                          checkOut: nextCheckOut,
                          scrollToRooms: false,
                        });
                      }}
                    />
                  </div>
                )}

                {openPopover === "WHO" && (
                  <div
                    role="region"
                    aria-label="Choose adults and children"
                    className="absolute inset-x-0 top-full z-50 mt-2.5 w-full rounded-2xl border border-border bg-surface p-5 text-foreground shadow-xl sm:right-auto sm:max-w-sm"
                  >
                    <div className="divide-y divide-border">
                      <GuestCountStepperRow
                        label="Adults"
                        description="Ages 13 or above"
                        count={draftAdults}
                        min={1}
                        max={MAX_PUBLIC_GUESTS - draftChildren}
                        onChange={(next) => {
                          setDraftAdults(next);
                          setSearchError(null);
                        }}
                      />
                      <GuestCountStepperRow
                        label="Children"
                        description="Ages 2 to 12"
                        count={draftChildren}
                        min={0}
                        max={MAX_PUBLIC_GUESTS - draftAdults}
                        onChange={(next) => {
                          setDraftChildren(next);
                          setSearchError(null);
                        }}
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Total guests: {draftAdults + draftChildren}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setOpenPopover(null)}
                        >
                          Close
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          loading={loadingAvailability}
                          onClick={() => applySearch({ scrollToRooms: true })}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {openPopover === "FILTER" && (
                  <div
                    role="region"
                    aria-label="Filter room type"
                    className="absolute inset-x-0 top-full z-50 mt-2.5 w-full rounded-2xl border border-border bg-surface p-4 text-foreground shadow-xl sm:right-0 sm:left-auto sm:max-w-xs"
                  >
                    <div className="grid gap-1.5">
                      {(
                        [
                          ["ALL", "All rooms", "Show private and shared rooms"],
                          [
                            "WHOLE_ROOM",
                            "Private rooms",
                            "Entire room reserved for your group",
                          ],
                          [
                            "BED",
                            "Shared rooms",
                            "Individual bed spaces for solo travelers",
                          ],
                        ] as const
                      ).map(([value, title, desc]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setScopeFilter(value);
                            setOpenPopover(null);
                          }}
                          className={cn(
                            "flex min-h-11 cursor-pointer flex-col items-start rounded-xl px-3.5 py-2.5 text-left transition-colors",
                            scopeFilter === value
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-surface-muted",
                          )}
                        >
                          <span className="text-sm font-semibold">{title}</span>
                          <span className="text-xs text-muted-foreground">
                            {desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right ~34%: Crisp white Featured Room Deck */}
            <aside
              aria-label="Featured room preview"
              className="flex min-w-0 flex-col justify-between gap-6 rounded-b-2xl border-t border-border bg-surface p-6 sm:p-8 lg:col-span-4 lg:rounded-r-2xl lg:rounded-bl-none lg:border-t-0 lg:border-l lg:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs leading-5 font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Choose your
                  <br />
                  best stay
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deckItems.length <= 1}
                    onClick={() => stepDeck(-1)}
                    aria-label="Previous featured room"
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-control-border bg-surface text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4"
                    >
                      <path d="M10 3.5 5.5 8 10 12.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={deckItems.length <= 1}
                    onClick={() => stepDeck(1)}
                    aria-label="Next featured room"
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-control-border bg-surface text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4"
                    >
                      <path d="M6 3.5 10.5 8 6 12.5" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Interactive 3D stacked & tilted layered photo deck */}
              <Tilt3DCard
                maxTiltDeg={8}
                className="relative mx-auto my-2 flex aspect-[4/3] w-full max-w-[272px] items-center justify-center rounded-2xl"
              >
                <div
                  ref={heroBackDeckRef}
                  aria-hidden="true"
                  className="absolute inset-3 -translate-x-2.5 translate-y-2 -rotate-4 overflow-hidden rounded-2xl border border-border bg-surface-muted opacity-90 will-change-transform"
                >
                  <img
                    src={activeDeckItem.secondaryImageUrl}
                    alt=""
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div
                  style={{ transform: "translateZ(22px)" }}
                  className="relative z-10 h-full w-[88%] rotate-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg transition-transform duration-300 hover:rotate-0"
                >
                  {activeDeckItem.roomId ? (
                    <Link
                      href={`/book/${activeDeckItem.roomId}?${currentStayQuery}`}
                      aria-label={`View ${activeDeckItem.title}`}
                      className="block h-full w-full"
                    >
                      <img
                        src={activeDeckItem.imageUrl}
                        alt={activeDeckItem.title}
                        fetchPriority="high"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </Link>
                  ) : (
                    <img
                      src={activeDeckItem.imageUrl}
                      alt={activeDeckItem.title}
                      fetchPriority="high"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  )}
                  {deckItems.length > 1 && (
                    <span className="pointer-events-none absolute right-2.5 bottom-2.5 rounded-full bg-foreground/80 px-2.5 py-0.5 text-[11px] font-medium text-surface tabular-nums">
                      {safeDeckIndex + 1} / {deckItems.length}
                    </span>
                  )}
                </div>
              </Tilt3DCard>

              {/* Active room caption & price */}
              <div className="grid min-w-0 gap-2 border-t border-border pt-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  {activeDeckItem.roomId ? (
                    <Link
                      href={`/book/${activeDeckItem.roomId}?${currentStayQuery}`}
                      className="line-clamp-2 min-w-0 flex-1 text-lg leading-snug font-semibold tracking-tight text-foreground uppercase hover:text-primary hover:underline"
                    >
                      {activeDeckItem.title}
                    </Link>
                  ) : (
                    <span className="line-clamp-2 min-w-0 flex-1 text-lg leading-snug font-semibold tracking-tight text-foreground uppercase">
                      {activeDeckItem.title}
                    </span>
                  )}
                  <span className="shrink-0 pt-0.5 text-right text-sm font-semibold text-primary tabular-nums">
                    {activeDeckItem.priceLabel}
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {activeDeckItem.subtitle}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatManilaDate(availability.checkInDateManila)} to{" "}
                    {formatManilaDate(availability.checkOutDateManila)}
                  </span>
                </div>
              </div>
            </aside>
          </div>

          {searchError && (
            <div className="mt-4">
              <Alert tone="danger" role="alert" title="Could not update search">
                {searchError}
              </Alert>
            </div>
          )}
        </section>

        {/* Live Rooms Directory (#rooms) in Daisy's Rausch & charcoal palette */}
        <section
          id="rooms"
          ref={roomsSectionRef}
          aria-labelledby="rooms-directory-heading"
          className="border-t border-border bg-background px-4 py-14 sm:px-6 lg:px-10 lg:py-20"
        >
          <div className="mx-auto w-full max-w-7xl">
            <ScrollReveal>
              <div className="mb-10 flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
                <div className="grid gap-2">
                  <h2
                    id="rooms-directory-heading"
                    className="font-book-serif text-4xl font-normal tracking-[0.05em] text-foreground uppercase sm:text-5xl"
                  >
                    Rooms for short stays
                  </h2>
                  <SelfDrawingLine align="left" width={132} />
                  <p className="text-sm text-muted-foreground">
                    {visibleRooms.length}{" "}
                    {visibleRooms.length === 1 ? "room" : "rooms"} shown for{" "}
                    {activeStaySummary}
                  </p>
                </div>

                <div
                  role="group"
                  aria-label="Filter rooms by type"
                  className="flex flex-wrap items-center gap-2"
                >
                  {(
                    [
                      ["ALL", "All rooms"],
                      ["WHOLE_ROOM", "Private"],
                      ["BED", "Shared"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={scopeFilter === value}
                      onClick={() => setScopeFilter(value)}
                      className={cn(
                        "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-4 text-xs font-medium transition-colors duration-(--duration-control) ease-(--ease-control)",
                        scopeFilter === value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-control-border bg-surface text-foreground hover:bg-surface-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </ScrollReveal>

            {loadingAvailability ? (
              <PublicBookingCardsSkeleton count={4} />
            ) : visibleRooms.length === 0 ? (
              <EmptyState className="my-6 bg-surface">
                <EmptyStateTitle>
                  {sortedRooms.length === 0
                    ? "No rooms listed right now"
                    : openRoomsForDates.length === 0
                      ? "No rooms open for these dates"
                      : "No rooms match this room type"}
                </EmptyStateTitle>
                <EmptyStateDescription>
                  {sortedRooms.length === 0
                    ? `Short-stay rooms are not open for online booking yet.${
                        availability.contactPhone
                          ? ` You may call ${availability.contactPhone} to ask about open dates.`
                          : ""
                      }`
                    : openRoomsForDates.length === 0
                      ? "All rooms are booked for your chosen dates. Pick different check-in and check-out dates to see open stays."
                      : "Switch back to All rooms to see every open stay option for these dates."}
                </EmptyStateDescription>
                <EmptyStateActions>
                  {openRoomsForDates.length > 0 ? (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => setScopeFilter("ALL")}
                    >
                      Show all rooms
                    </Button>
                  ) : sortedRooms.length > 0 ? (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={jumpToHeroSearch}
                    >
                      Change stay dates
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => applySearch()}
                    >
                      Check again
                    </Button>
                  )}
                </EmptyStateActions>
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleRooms.map((room, index) => (
                  <ScrollReveal
                    key={room.roomId}
                    variant="scale"
                    delayMs={Math.min(index, 3) * 75}
                    className="flex"
                  >
                    <RoomStorefrontCard
                      room={room}
                      nights={availability.nights}
                      requestedGuests={activeTotalGuests}
                      queryString={currentStayQuery}
                      priority={index < 4}
                      slideIndex={slideIndexByRoomId[room.roomId] ?? 0}
                      onStepSlide={(totalSlides, delta) =>
                        stepCardSlide(room.roomId, totalSlides, delta)
                      }
                    />
                  </ScrollReveal>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Video 2: Scroll-linked horizontal "HOW IT WORKS" showcase */}
        <HowItWorksScrollTrack
          availability={availability}
          rooms={showcaseRooms}
          adults={activeSelection.adults}
          childrenCount={activeSelection.children}
          queryString={currentStayQuery}
          onJumpToSearch={jumpToHeroSearch}
        />

        {/* Video 2: Split blush-framed detail showcase + sticky "BOOK DIRECT ANYWHERE" */}
        <StayAnywhereShowcase
          availability={availability}
          featuredRoom={showcaseRooms[0] ?? null}
          adults={activeSelection.adults}
          childrenCount={activeSelection.children}
          queryString={currentStayQuery}
        />

        {/* Owner-configured House Rules (#house-rules) */}
        <HouseRulesSection rulesText={availability.transientPolicyNote} />

        {/* Public booking status lookup (#track) */}
        <PublicBookingTracker />
      </main>

      {/* Video 2: Editorial "GET IN TOUCH" footer */}
      <EditorialBookingFooter
        propertyName={availability.propertyName}
        propertyAddress={availability.propertyAddress}
        propertyLatitude={availability.propertyLatitude}
        propertyLongitude={availability.propertyLongitude}
        contactPhone={availability.contactPhone}
        checkInTimeManila={availability.checkInTimeManila}
        checkOutTimeManila={availability.checkOutTimeManila}
      />
    </div>
  );
}

type RoomStorefrontCardProps = {
  room: PublicPublishedRoomDto;
  nights: number;
  requestedGuests: number;
  queryString: string;
  priority?: boolean;
  slideIndex: number;
  onStepSlide: (totalSlides: number, delta: number) => void;
};

function RoomStorefrontCard({
  room,
  nights,
  requestedGuests,
  queryString,
  priority = false,
  slideIndex,
  onStepSlide,
}: RoomStorefrontCardProps) {
  const slides = buildRoomGallerySlides(room);
  const safeIndex =
    slides.length > 0 ? Math.min(slideIndex, slides.length - 1) : 0;
  const activeSlide = slides[safeIndex] ?? null;
  const status = getRoomAvailabilityStatus(room, requestedGuests);

  const detailHref = `/book/${room.roomId}?${queryString}`;
  const requestHref = `/book/${room.roomId}/request?${queryString}`;

  const capacityText =
    room.scope === "BED"
      ? status.available
        ? `${room.availableUnitsForRange} ${room.availableUnitsForRange === 1 ? "bed" : "beds"} open`
        : "Shared room (1 guest per bed)"
      : `Up to ${room.capacity} ${room.capacity === 1 ? "guest" : "guests"}`;

  const photoCountText =
    slides.length > 0
      ? `${slides.length} ${slides.length === 1 ? "photo" : "photos"}`
      : "No photos yet";

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl",
        PUBLIC_BOOKING_CARD_ELEVATED_INTERACTIVE,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-muted">
        <Link
          href={detailHref}
          aria-label={`View ${room.title} photos and details`}
          className="block h-full w-full"
        >
          {activeSlide ? (
            <img
              src={activeSlide.url}
              alt={activeSlide.caption ?? `${room.title} photo`}
              width={ROOM_PHOTO_OUTPUT_WIDTH}
              height={ROOM_PHOTO_OUTPUT_HEIGHT}
              className="h-full w-full object-cover transition-opacity duration-200"
              loading={priority ? "eager" : "lazy"}
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="size-8 text-muted-foreground/70"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="8.5" cy="10.5" r="1.5" />
                <path d="m21 16-5-5-6 6-2-2-5 4" />
              </svg>
              <span>Photos coming soon</span>
            </div>
          )}
        </Link>

        <div className="pointer-events-none absolute top-3 left-3 z-10">
          <Badge tone={status.tone} className="shadow-sm">
            {status.label}
          </Badge>
        </div>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => onStepSlide(slides.length, -1)}
              aria-label={`Previous photo of ${room.title}`}
              className="absolute top-1/2 left-2 z-10 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border/80 bg-surface/95 text-foreground shadow-sm transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="M10 3.5 5.5 8 10 12.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onStepSlide(slides.length, 1)}
              aria-label={`Next photo of ${room.title}`}
              className="absolute top-1/2 right-2 z-10 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border/80 bg-surface/95 text-foreground shadow-sm transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="M6 3.5 10.5 8 6 12.5" />
              </svg>
            </button>

            <span className="pointer-events-none absolute right-3 bottom-3 z-10 rounded-full bg-foreground/80 px-2.5 py-0.5 text-xs font-medium text-surface tabular-nums">
              {safeIndex + 1} / {slides.length}
            </span>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-base leading-snug font-semibold text-foreground">
            <Link href={detailHref} className="hover:underline">
              {room.title}
            </Link>
          </h3>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {room.roomTypeName}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          {getScopeLabel(room.scope)}, {capacityText}, {photoCountText}
        </p>

        {activeSlide?.caption && (
          <p className="truncate text-xs text-foreground/85">
            Photo note: {activeSlide.caption}
          </p>
        )}

        {!status.available && (
          <p className="text-xs font-medium text-warning">{status.detail}</p>
        )}

        <div className="mt-auto pt-2.5">
          <p className="text-sm text-foreground">
            <span className="text-base font-semibold tabular-nums">
              {formatPhpCurrency(room.indicativeTotalAmount)}
            </span>{" "}
            <span className="text-muted-foreground">
              for {nights} {nights === 1 ? "night" : "nights"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatPhpCurrency(room.dailyRate)} per night
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href={detailHref}
            className={buttonClasses({
              variant: "secondary",
              size: "md",
              className: "w-full justify-center rounded-xl",
            })}
          >
            View room
          </Link>
          {status.available ? (
            <Link
              href={requestHref}
              className={buttonClasses({
                variant: "primary",
                size: "md",
                className: "w-full justify-center rounded-xl",
              })}
            >
              Request booking
            </Link>
          ) : (
            <Link
              href={`${detailHref}#stay-box`}
              className={buttonClasses({
                variant: "ghost",
                size: "md",
                className:
                  "w-full justify-center rounded-xl border border-border whitespace-nowrap",
              })}
            >
              {status.tone === "warning" ? "Edit guests" : "Change dates"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-muted-foreground"
    >
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" />
      <path d="M6 2v3M12 2v3M2.5 7.5h13" />
    </svg>
  );
}

function GuestsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-muted-foreground"
    >
      <circle cx="9" cy="6" r="2.75" />
      <path d="M3.5 15.25a5.5 5.5 0 0 1 11 0" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-muted-foreground"
    >
      <path d="M3 4.5h12M5.5 9h7M8 13.5h2" />
    </svg>
  );
}
