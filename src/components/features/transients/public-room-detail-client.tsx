"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  GuestCountStepperRow,
  PublicBookingBackLink,
  PublicBookingFooter,
  PublicBookingHeader,
} from "@/components/features/transients/public-booking-chrome";
import {
  buildOsmAreaSearchUrl,
  buildPublicStayQueryString,
  buildRoomGallerySlides,
  formatGuestsSummary,
  formatStayTime,
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
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { diffManilaDays, formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import { cn } from "@/lib/cn";

type PublicRoomDetailClientProps = {
  initialAvailability: PublicAvailabilityDto;
  initialRoom: PublicPublishedRoomDto;
  initialAdults: number;
  initialChildren: number;
};

const MAX_PUBLIC_GUESTS = 20;

export function PublicRoomDetailClient({
  initialAvailability,
  initialRoom,
  initialAdults,
  initialChildren,
}: PublicRoomDetailClientProps) {
  const safeInitialAdults = Math.max(1, initialAdults);
  const safeInitialChildren = Math.max(
    0,
    Math.min(MAX_PUBLIC_GUESTS - safeInitialAdults, initialChildren),
  );

  const [availability, setAvailability] =
    useState<PublicAvailabilityDto>(initialAvailability);
  const [room, setRoom] = useState<PublicPublishedRoomDto>(initialRoom);
  const [roomUnavailableOnRefresh, setRoomUnavailableOnRefresh] =
    useState(false);

  const [draftCheckIn, setDraftCheckIn] = useState(
    initialAvailability.checkInDateManila,
  );
  const [draftCheckOut, setDraftCheckOut] = useState(
    initialAvailability.checkOutDateManila,
  );
  const [adults, setAdults] = useState(safeInitialAdults);
  const [children, setChildren] = useState(safeInitialChildren);

  const [slideIndex, setSlideIndex] = useState(0);
  const [loadingDates, setLoadingDates] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const slides = useMemo(() => buildRoomGallerySlides(room), [room]);
  const safeSlideIndex =
    slides.length > 0 ? Math.min(slideIndex, slides.length - 1) : 0;
  const activeSlide = slides[safeSlideIndex] ?? null;

  const totalGuests = adults + children;
  const status = getRoomAvailabilityStatus(room, totalGuests);
  const datesChanged =
    draftCheckIn !== availability.checkInDateManila ||
    draftCheckOut !== availability.checkOutDateManila;

  const draftNights = useMemo(() => {
    try {
      return diffManilaDays(draftCheckIn, draftCheckOut);
    } catch {
      return 0;
    }
  }, [draftCheckIn, draftCheckOut]);

  const syncedQuery = useMemo(
    () =>
      buildPublicStayQueryString({
        checkIn: availability.checkInDateManila,
        checkOut: availability.checkOutDateManila,
        adults,
        children,
      }),
    [
      availability.checkInDateManila,
      availability.checkOutDateManila,
      adults,
      children,
    ],
  );

  function syncHistoryUrl(
    nextCheckIn: string,
    nextCheckOut: string,
    nextAdults: number,
    nextChildren: number,
  ) {
    const query = buildPublicStayQueryString({
      checkIn: nextCheckIn,
      checkOut: nextCheckOut,
      adults: nextAdults,
      children: nextChildren,
    });
    window.history.replaceState(null, "", `/book/${room.roomId}?${query}`);
  }

  function updateGuestCounts(nextAdults: number, nextChildren: number) {
    setAdults(nextAdults);
    setChildren(nextChildren);
    syncHistoryUrl(
      availability.checkInDateManila,
      availability.checkOutDateManila,
      nextAdults,
      nextChildren,
    );
  }

  async function refreshDates() {
    if (!draftCheckIn || !draftCheckOut || draftCheckOut <= draftCheckIn) {
      setDateError("Choose a check-out date after your check-in date.");
      return;
    }

    setDateError(null);
    setLoadingDates(true);
    try {
      const apiQuery = new URLSearchParams({
        checkIn: draftCheckIn,
        checkOut: draftCheckOut,
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
        setDateError(
          typeof data?.error === "string"
            ? data.error
            : "Could not check those dates right now. Try again.",
        );
        return;
      }

      const nextAvailability = data as PublicAvailabilityDto;
      const updatedRoom = nextAvailability.rooms.find(
        (candidate) => candidate.roomId === room.roomId,
      );

      setAvailability(nextAvailability);
      if (updatedRoom) {
        setRoom(updatedRoom);
        setRoomUnavailableOnRefresh(false);
      } else {
        setRoomUnavailableOnRefresh(true);
      }
      syncHistoryUrl(draftCheckIn, draftCheckOut, adults, children);
    } catch {
      setDateError(
        "Unable to reach the reservation desk right now. Check your connection and try again.",
      );
    } finally {
      setLoadingDates(false);
    }
  }

  function stepSlide(delta: number) {
    if (slides.length <= 1) return;
    setSlideIndex(
      (current) => (current + delta + slides.length) % slides.length,
    );
  }

  const checkInLabel = formatStayTime(availability.checkInTimeManila);
  const checkOutLabel = formatStayTime(availability.checkOutTimeManila);
  const browseHref = `/book?${syncedQuery}`;
  const requestHref = `/book/${room.roomId}/request?${syncedQuery}`;

  const guestLimitCopy =
    room.scope === "BED"
      ? "Shared room (1 guest per bed)"
      : `Up to ${room.capacity} ${room.capacity === 1 ? "guest" : "guests"}`;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicBookingHeader
        propertyName={availability.propertyName}
        propertyAddress={availability.propertyAddress}
        contactPhone={availability.contactPhone}
        homeHref={browseHref}
      />

      <main
        id="main-content"
        className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8"
      >
        <PublicBookingBackLink href={browseHref} label="All rooms" />

        <div className="mb-6 flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{room.roomTypeName}</Badge>
              <Badge tone={roomUnavailableOnRefresh ? "warning" : status.tone}>
                {roomUnavailableOnRefresh ? "Currently unlisted" : status.label}
              </Badge>
              {slides.length > 0 && (
                <a
                  href="#photos"
                  className="inline-flex min-h-11 items-center text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground lg:min-h-7"
                >
                  {slides.length} {slides.length === 1 ? "photo" : "photos"}
                </a>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {room.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {getScopeLabel(room.scope)}, {guestLimitCopy}
              {availability.propertyAddress
                ? `, ${availability.propertyAddress}`
                : ""}
            </p>
          </div>

          <div className="lg:hidden">
            <a
              href="#stay-box"
              className={buttonClasses({
                variant: "primary",
                size: "md",
                className: "w-full justify-center rounded-xl",
              })}
            >
              Check dates &amp; request
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_27rem]">
          <div className="min-w-0 space-y-8">
            <section aria-label="Featured room photo">
              <div
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    stepSlide(-1);
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    stepSlide(1);
                  }
                }}
                className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
              >
                {activeSlide ? (
                  <img
                    src={activeSlide.url}
                    alt={activeSlide.caption ?? `${room.title} room photo`}
                    width={ROOM_PHOTO_OUTPUT_WIDTH}
                    height={ROOM_PHOTO_OUTPUT_HEIGHT}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="size-10 text-muted-foreground/70"
                    >
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <circle cx="8.5" cy="10.5" r="1.5" />
                      <path d="m21 16-5-5-6 6-2-2-5 4" />
                    </svg>
                    <span>
                      The host has not added photos for this room yet.
                    </span>
                  </div>
                )}

                {slides.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => stepSlide(-1)}
                      aria-label="Previous photo"
                      className="absolute top-1/2 left-3 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-surface/95 text-foreground shadow-sm transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface"
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
                      onClick={() => stepSlide(1)}
                      aria-label="Next photo"
                      className="absolute top-1/2 right-3 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-surface/95 text-foreground shadow-sm transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface"
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

                    <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-foreground/85 px-3 py-1 text-xs font-medium text-surface tabular-nums">
                      {safeSlideIndex + 1} of {slides.length}
                    </span>
                  </>
                )}
              </div>

              {activeSlide && (
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3">
                  <p className="text-sm text-foreground">
                    {activeSlide.caption ??
                      (safeSlideIndex === 0
                        ? `${room.title} cover photo`
                        : `${room.title}, photo ${safeSlideIndex + 1}`)}
                  </p>
                  {slides.length > 1 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Photo {safeSlideIndex + 1} of {slides.length}
                    </span>
                  )}
                </div>
              )}

              {slides.length > 1 && (
                <div
                  aria-label="Select room photo"
                  className="mt-3 flex gap-2 overflow-x-auto pb-1"
                >
                  {slides.map((slide, idx) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setSlideIndex(idx)}
                      aria-pressed={idx === safeSlideIndex}
                      aria-label={
                        slide.caption
                          ? `Show photo ${idx + 1}: ${slide.caption}`
                          : `Show photo ${idx + 1}`
                      }
                      className={cn(
                        "relative aspect-[4/3] w-24 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 bg-surface-muted transition-colors duration-(--duration-control) ease-(--ease-control)",
                        idx === safeSlideIndex
                          ? "border-primary"
                          : "border-transparent opacity-75 hover:opacity-100",
                      )}
                    >
                      <img
                        src={slide.url}
                        alt=""
                        width={ROOM_PHOTO_OUTPUT_WIDTH}
                        height={ROOM_PHOTO_OUTPUT_HEIGHT}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>

            {slides.length > 0 && (
              <section id="photos" className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
                  <h2 className="text-xl font-semibold text-foreground">
                    All room photos ({slides.length})
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Every photo attached by the host with its caption.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {slides.map((slide, idx) => (
                    <figure
                      key={slide.id}
                      className={cn(
                        "flex flex-col overflow-hidden rounded-2xl border bg-surface",
                        idx === safeSlideIndex
                          ? "border-primary"
                          : "border-border",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSlideIndex(idx)}
                        className="aspect-[4/3] w-full cursor-pointer overflow-hidden bg-surface-muted text-left"
                        aria-label={
                          slide.caption
                            ? `Focus photo ${idx + 1}: ${slide.caption}`
                            : `Focus photo ${idx + 1}`
                        }
                      >
                        <img
                          src={slide.url}
                          alt={
                            slide.caption ?? `${room.title} photo ${idx + 1}`
                          }
                          width={ROOM_PHOTO_OUTPUT_WIDTH}
                          height={ROOM_PHOTO_OUTPUT_HEIGHT}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                      <figcaption className="flex flex-1 flex-col justify-between gap-1 px-3.5 py-2.5">
                        <span className="text-sm text-foreground">
                          {slide.caption ??
                            (idx === 0
                              ? "Main room photo"
                              : `Room photo ${idx + 1}`)}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Photo {idx + 1} of {slides.length}
                        </span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-4">
              <h2 className="border-b border-border pb-3 text-xl font-semibold text-foreground">
                About this room
              </h2>
              {room.description ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {room.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Clean short-stay {room.roomTypeName.toLowerCase()} with
                  host-confirmed check-in and front desk support.
                </p>
              )}

              <dl className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Room setup
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">
                    {getScopeLabel(room.scope)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Capacity
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">
                    {guestLimitCopy}
                  </dd>
                </div>
                {checkInLabel && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      Check-in from
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {checkInLabel}
                    </dd>
                  </div>
                )}
                {checkOutLabel && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      Check-out by
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {checkOutLabel}
                    </dd>
                  </div>
                )}
                {availability.transientPolicyNote && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-muted-foreground">
                      House reminders
                    </dt>
                    <dd className="mt-1 whitespace-pre-line text-sm text-foreground">
                      {availability.transientPolicyNote}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="space-y-3">
              <h2 className="border-b border-border pb-3 text-xl font-semibold text-foreground">
                Location &amp; front desk
              </h2>
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
                <div className="grid gap-1">
                  <span className="text-sm font-semibold text-foreground">
                    {availability.propertyName}
                  </span>
                  {availability.propertyAddress && (
                    <span className="text-sm text-muted-foreground">
                      {availability.propertyAddress}
                    </span>
                  )}
                  {availability.contactPhone && (
                    <a
                      href={`tel:${availability.contactPhone.replace(/[^+\d]/g, "")}`}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 hover:text-primary sm:min-h-7"
                    >
                      Call front desk: {availability.contactPhone}
                    </a>
                  )}
                </div>

                {availability.propertyAddress && (
                  <a
                    href={buildOsmAreaSearchUrl(availability.propertyAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses({
                      variant: "secondary",
                      size: "md",
                      className: "rounded-xl",
                    })}
                  >
                    See area map
                  </a>
                )}
              </div>
            </section>
          </div>

          <aside id="stay-box" className="min-w-0">
            <Card className="rounded-2xl border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-24">
              <div className="flex items-baseline justify-between gap-3 border-b border-border pb-4">
                <div>
                  <span className="text-2xl font-semibold text-foreground tabular-nums">
                    {formatPhpCurrency(room.dailyRate)}
                  </span>{" "}
                  <span className="text-sm text-muted-foreground">night</span>
                </div>
                <Badge
                  tone={roomUnavailableOnRefresh ? "warning" : status.tone}
                >
                  {roomUnavailableOnRefresh
                    ? "Unavailable"
                    : status.available
                      ? "Available"
                      : status.label}
                </Badge>
              </div>

              {dateError && (
                <div className="mt-4">
                  <Alert tone="danger" role="alert">
                    {dateError}
                  </Alert>
                </div>
              )}

              {roomUnavailableOnRefresh && (
                <div className="mt-4">
                  <Alert tone="warning" role="status">
                    This room is no longer listed for online requests. Browse{" "}
                    <Link href={browseHref} className="font-medium underline">
                      all open rooms
                    </Link>{" "}
                    for other options.
                  </Alert>
                </div>
              )}

              <div className="mt-4 grid gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
                  <Field id="detail-check-in" label="Check-in">
                    {(fieldProps) => (
                      <DatePicker
                        {...fieldProps}
                        required
                        value={draftCheckIn}
                        onValueChange={(next) => {
                          setDraftCheckIn(next);
                          setDateError(null);
                        }}
                      />
                    )}
                  </Field>
                  <Field id="detail-check-out" label="Check-out">
                    {(fieldProps) => (
                      <DatePicker
                        {...fieldProps}
                        required
                        value={draftCheckOut}
                        onValueChange={(next) => {
                          setDraftCheckOut(next);
                          setDateError(null);
                        }}
                      />
                    )}
                  </Field>
                </div>

                {datesChanged && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    loading={loadingDates}
                    onClick={refreshDates}
                    className="w-full rounded-xl"
                  >
                    {draftNights > 0
                      ? `Update to ${draftNights} ${draftNights === 1 ? "night" : "nights"}`
                      : "Update dates"}
                  </Button>
                )}

                <div className="border-t border-border pt-2 divide-y divide-border">
                  <GuestCountStepperRow
                    label="Adults"
                    description="Ages 13 or above"
                    count={adults}
                    min={1}
                    max={MAX_PUBLIC_GUESTS - children}
                    onChange={(nextAdults) =>
                      updateGuestCounts(nextAdults, children)
                    }
                  />
                  <GuestCountStepperRow
                    label="Children"
                    description="Ages 2 to 12"
                    count={children}
                    min={0}
                    max={MAX_PUBLIC_GUESTS - adults}
                    onChange={(nextChildren) =>
                      updateGuestCounts(adults, nextChildren)
                    }
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-2 border-t border-border pt-4 text-sm">
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span>Dates</span>
                  <span className="font-medium text-foreground">
                    {formatManilaDate(availability.checkInDateManila)} to{" "}
                    {formatManilaDate(availability.checkOutDateManila)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span>Guests</span>
                  <span className="font-medium text-foreground">
                    {formatGuestsSummary(adults, children)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span>
                    {formatPhpCurrency(room.dailyRate)} x {availability.nights}{" "}
                    {availability.nights === 1 ? "night" : "nights"}
                  </span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatPhpCurrency(room.indicativeTotalAmount)}
                  </span>
                </div>
              </div>

              {!status.available && !roomUnavailableOnRefresh && (
                <div className="mt-4">
                  <Alert tone="warning">{status.detail}</Alert>
                </div>
              )}

              <div className="mt-5 grid gap-2.5">
                {status.available &&
                !roomUnavailableOnRefresh &&
                !datesChanged ? (
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
                ) : datesChanged ? (
                  <Button
                    type="button"
                    variant="primary"
                    loading={loadingDates}
                    onClick={refreshDates}
                    className="w-full rounded-xl"
                  >
                    Check new dates first
                  </Button>
                ) : (
                  <Link
                    href={browseHref}
                    className={buttonClasses({
                      variant: "secondary",
                      size: "md",
                      className: "w-full justify-center rounded-xl",
                    })}
                  >
                    Browse other rooms
                  </Link>
                )}

                <p className="text-center text-xs text-muted-foreground">
                  You will fill in your guest details on the next page. Rooms
                  are reserved only after the host confirms your request.
                </p>
              </div>
            </Card>
          </aside>
        </div>
      </main>

      <PublicBookingFooter
        propertyName={availability.propertyName}
        propertyAddress={availability.propertyAddress}
        contactPhone={availability.contactPhone}
      />
    </div>
  );
}
