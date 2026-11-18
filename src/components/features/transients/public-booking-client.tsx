"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GuestCountStepperRow,
  PublicBookingFooter,
  PublicBookingHeader,
} from "@/components/features/transients/public-booking-chrome";
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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { diffManilaDays, formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import { cn } from "@/lib/cn";

type PublicBookingClientProps = {
  initialAvailability: PublicAvailabilityDto;
  initialAdults: number;
  initialChildren: number;
};

type SearchPopoverPanel = "WHEN" | "WHO" | null;

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

  const [openPopover, setOpenPopover] = useState<SearchPopoverPanel>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [slideIndexByRoomId, setSlideIndexByRoomId] = useState<
    Record<string, number>
  >({});

  const searchBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openPopover) return;

    function handlePointerDown(event: PointerEvent) {
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

  const draftNights = useMemo(() => {
    try {
      return diffManilaDays(draftCheckIn, draftCheckOut);
    } catch {
      return 0;
    }
  }, [draftCheckIn, draftCheckOut]);

  const activeTotalGuests = activeSelection.adults + activeSelection.children;

  const visibleRooms = useMemo(
    () =>
      filterAndSortPublicRooms(availability.rooms, {
        roomTypeFilter: "ALL",
        availabilityFilter: "ALL",
        sortBy: "RECOMMENDED",
        requestedGuests: activeTotalGuests,
      }),
    [availability.rooms, activeTotalGuests],
  );

  const currentStayQuery = useMemo(
    () => buildPublicStayQueryString(activeSelection),
    [activeSelection],
  );

  async function applySearch(override?: {
    checkIn?: string;
    checkOut?: string;
    adults?: number;
    children?: number;
  }) {
    const nextCheckIn = override?.checkIn ?? draftCheckIn;
    const nextCheckOut = override?.checkOut ?? draftCheckOut;
    const nextAdults = override?.adults ?? draftAdults;
    const nextChildren = override?.children ?? draftChildren;
    const totalGuests = nextAdults + nextChildren;

    if (!nextCheckIn || !nextCheckOut || nextCheckOut <= nextCheckIn) {
      setSearchError("Choose a check-out date after your check-in date.");
      setOpenPopover("WHEN");
      return;
    }
    if (totalGuests < 1 || totalGuests > MAX_PUBLIC_GUESTS) {
      setSearchError(
        `Guests must be between 1 and ${MAX_PUBLIC_GUESTS} in total.`,
      );
      setOpenPopover("WHO");
      return;
    }

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
    } catch {
      setSearchError(
        "Unable to reach the reservation desk right now. Check your connection and try again.",
      );
    } finally {
      setLoadingAvailability(false);
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

  const whenLabel =
    draftNights > 0
      ? `${formatManilaDate(draftCheckIn)} to ${formatManilaDate(draftCheckOut)}`
      : "Add dates";
  const whoLabel = formatGuestsSummary(draftAdults, draftChildren);

  const activeStaySummary = `${formatManilaDate(availability.checkInDateManila)} to ${formatManilaDate(availability.checkOutDateManila)}, ${availability.nights} ${availability.nights === 1 ? "night" : "nights"}, ${formatGuestsSummary(activeSelection.adults, activeSelection.children)}`;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicBookingHeader
        propertyName={availability.propertyName}
        propertyAddress={availability.propertyAddress}
        contactPhone={availability.contactPhone}
        homeHref={`/book?${currentStayQuery}`}
      />

      <main id="main-content" className="w-full flex-1">
        <div className="w-full px-4 pt-4 sm:px-6 lg:px-10 lg:pt-6">
          <section
            aria-label="Featured short-stay guest room"
            className="overflow-hidden rounded-2xl border border-border bg-surface-muted"
          >
            <img
              src="/images/hero/stay-hero-1280.jpg"
              srcSet="/images/hero/stay-hero-500.jpg 500w, /images/hero/stay-hero-960.jpg 960w, /images/hero/stay-hero-1280.jpg 1280w"
              sizes="(max-width: 639px) 100vw, (max-width: 1023px) calc(100vw - 3rem), calc(100vw - 5rem)"
              width={1280}
              height={853}
              alt="Sunlit guest bedroom with crisp white linens, terracotta throw blanket, ceiling fan, and armchair beside a bright window"
              fetchPriority="high"
              decoding="async"
              data-source="stand-in"
              data-subject="stand-in"
              className="h-52 w-full object-cover object-center sm:h-72 lg:h-[22rem] xl:h-[25rem]"
            />
          </section>
        </div>

        <div className="w-full px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <section
            ref={searchBarRef}
            aria-label="Search stay dates and guests"
            className="relative z-20 mx-auto w-full max-w-2xl sm:-mt-14"
          >
            <div
              className={cn(
                "flex w-full flex-col gap-2 rounded-2xl border border-border bg-surface p-2 shadow-md sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:p-1.5",
                openPopover && "border-control-border",
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setOpenPopover((prev) => (prev === "WHEN" ? null : "WHEN"))
                }
                aria-expanded={openPopover === "WHEN"}
                className={cn(
                  "flex min-h-12 flex-1 cursor-pointer flex-col items-start justify-center rounded-xl px-4 py-2 text-left transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted sm:rounded-full sm:px-5",
                  openPopover === "WHEN" && "bg-surface-muted",
                )}
              >
                <span className="text-xs font-semibold text-foreground">
                  When
                </span>
                <span className="w-full truncate text-xs text-muted-foreground">
                  {whenLabel}
                </span>
              </button>

              <div
                aria-hidden="true"
                className="mx-2 h-px bg-border sm:mx-0 sm:h-7 sm:w-px sm:shrink-0"
              />

              <button
                type="button"
                onClick={() =>
                  setOpenPopover((prev) => (prev === "WHO" ? null : "WHO"))
                }
                aria-expanded={openPopover === "WHO"}
                className={cn(
                  "flex min-h-12 flex-1 cursor-pointer flex-col items-start justify-center rounded-xl px-4 py-2 text-left transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted sm:rounded-full sm:px-5",
                  openPopover === "WHO" && "bg-surface-muted",
                )}
              >
                <span className="text-xs font-semibold text-foreground">
                  Who
                </span>
                <span className="w-full truncate text-xs text-muted-foreground">
                  {whoLabel}
                </span>
              </button>

              <div className="sm:pl-2">
                <Button
                  type="button"
                  variant="primary"
                  loading={loadingAvailability}
                  onClick={() => applySearch()}
                  className="w-full rounded-xl px-5 sm:w-auto sm:rounded-full"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4 shrink-0"
                  >
                    <circle cx="7" cy="7" r="4.75" />
                    <path d="m10.5 10.5 3.25 3.25" />
                  </svg>
                  <span>Search</span>
                </Button>
              </div>
            </div>

            {openPopover === "WHEN" && (
              <div
                role="region"
                aria-label="Choose check-in and check-out dates"
                className="absolute top-full left-0 z-40 mt-2 w-full rounded-2xl border border-border bg-surface p-5 shadow-lg sm:max-w-lg"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="search-check-in" label="Check-in">
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        type="date"
                        value={draftCheckIn}
                        onChange={(event) => {
                          setDraftCheckIn(event.target.value);
                          setSearchError(null);
                        }}
                      />
                    )}
                  </Field>
                  <Field id="search-check-out" label="Check-out">
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        type="date"
                        value={draftCheckOut}
                        onChange={(event) => {
                          setDraftCheckOut(event.target.value);
                          setSearchError(null);
                        }}
                      />
                    )}
                  </Field>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
                    {draftNights > 0
                      ? `${draftNights} ${draftNights === 1 ? "night" : "nights"} selected`
                      : "Select check-out after check-in"}
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
                      onClick={() => applySearch()}
                    >
                      Apply dates
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {openPopover === "WHO" && (
              <div
                role="region"
                aria-label="Choose adults and children"
                className="absolute top-full right-0 z-40 mt-2 w-full rounded-2xl border border-border bg-surface p-5 shadow-lg sm:max-w-sm"
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
                    Total guests: {draftAdults + draftChildren} (max{" "}
                    {MAX_PUBLIC_GUESTS})
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
                      onClick={() => applySearch()}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {searchError && (
            <div className="mt-5">
              <Alert tone="danger" role="alert" title="Could not update search">
                {searchError}
              </Alert>
            </div>
          )}

          <div className="mt-7 mb-6 grid gap-1 border-b border-border pb-4">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Rooms for short stays
            </h1>
            <p className="text-sm text-muted-foreground">
              {visibleRooms.length}{" "}
              {visibleRooms.length === 1 ? "room" : "rooms"} shown for{" "}
              {activeStaySummary}
            </p>
          </div>

          {visibleRooms.length === 0 ? (
            <EmptyState className="my-6 bg-surface">
              <EmptyStateTitle>No rooms listed right now</EmptyStateTitle>
              <EmptyStateDescription>
                Short-stay rooms are not open for online booking yet.
                {availability.contactPhone
                  ? ` You may call ${availability.contactPhone} to ask about open dates.`
                  : ""}
              </EmptyStateDescription>
              <EmptyStateActions>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => applySearch()}
                >
                  Check again
                </Button>
              </EmptyStateActions>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleRooms.map((room) => (
                <RoomStorefrontCard
                  key={room.roomId}
                  room={room}
                  nights={availability.nights}
                  requestedGuests={activeTotalGuests}
                  queryString={currentStayQuery}
                  slideIndex={slideIndexByRoomId[room.roomId] ?? 0}
                  onStepSlide={(totalSlides, delta) =>
                    stepCardSlide(room.roomId, totalSlides, delta)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <PublicBookingFooter
        propertyName={availability.propertyName}
        propertyAddress={availability.propertyAddress}
        contactPhone={availability.contactPhone}
        heroPhotoCredit="Room photo: Tim Collins (CC BY-SA 3.0)"
      />
    </div>
  );
}

type RoomStorefrontCardProps = {
  room: PublicPublishedRoomDto;
  nights: number;
  requestedGuests: number;
  queryString: string;
  slideIndex: number;
  onStepSlide: (totalSlides: number, delta: number) => void;
};

function RoomStorefrontCard({
  room,
  nights,
  requestedGuests,
  queryString,
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
    <article className="flex min-w-0 flex-col">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface-muted">
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
              loading="lazy"
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

      <div className="flex flex-1 flex-col gap-1.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-base font-semibold leading-snug text-foreground">
            <Link href={detailHref} className="hover:underline">
              {room.title}
            </Link>
          </h2>
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

        <div className="mt-auto pt-1.5">
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

        <div className="mt-2 grid grid-cols-2 gap-2">
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
                  "w-full justify-center rounded-xl border border-border",
              })}
            >
              Change dates
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
