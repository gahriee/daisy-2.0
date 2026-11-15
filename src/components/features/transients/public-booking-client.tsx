"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { DaisyBrand } from "@/components/layout/daisy-brand";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  PublicAvailabilityDto,
  PublicBookingAckDto,
  PublicPublishedRoomDto,
} from "@/features/transients/schemas";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";

type GallerySlide = {
  id: string;
  url: string;
  caption: string | null;
};

function buildGallerySlides(room: PublicPublishedRoomDto): GallerySlide[] {
  if (room.galleryImages.length > 0) {
    return room.galleryImages;
  }
  if (room.previewImageUrl) {
    return [
      {
        id: `${room.roomId}-preview`,
        url: room.previewImageUrl,
        caption: null,
      },
    ];
  }
  return [];
}

export function PublicBookingClient({
  initialAvailability,
}: {
  initialAvailability: PublicAvailabilityDto;
}) {
  const [availability, setAvailability] = useState(initialAvailability);
  const [checkIn, setCheckIn] = useState(initialAvailability.checkInDateManila);
  const [checkOut, setCheckOut] = useState(
    initialAvailability.checkOutDateManila,
  );
  const [guests, setGuests] = useState(String(initialAvailability.guests));
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);

  const [selectedRoom, setSelectedRoom] =
    useState<PublicPublishedRoomDto | null>(null);
  const [galleryRoom, setGalleryRoom] = useState<PublicPublishedRoomDto | null>(
    null,
  );
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : `key-${Date.now()}`,
  );
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedAck, setSubmittedAck] = useState<PublicBookingAckDto | null>(
    null,
  );

  async function handleCheckAvailability(event: FormEvent) {
    event.preventDefault();
    setLoadingAvail(true);
    setAvailError(null);
    try {
      const params = new URLSearchParams({
        checkIn,
        checkOut,
        guests: guests || "1",
      });
      const res = await fetch(`/api/public/availability?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setAvailError(data.error ?? "Check your stay dates and guest count.");
        return;
      }
      setAvailability(data as PublicAvailabilityDto);
    } catch {
      setAvailError("Could not load live availability right now. Try again.");
    } finally {
      setLoadingAvail(false);
    }
  }

  function openRequestForRoom(room: PublicPublishedRoomDto) {
    setSelectedRoom(room);
    setSubmitError(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  function openGalleryForRoom(room: PublicPublishedRoomDto) {
    setGalleryRoom(room);
    setGalleryIndex(0);
  }

  function handleGalleryKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!galleryRoom) return;
    const slides = buildGallerySlides(galleryRoom);
    if (slides.length <= 1) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setGalleryIndex((prev) => (prev - 1 + slides.length) % slides.length);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setGalleryIndex((prev) => (prev + 1) % slides.length);
    }
  }

  async function handleSubmitRequest(event: FormEvent) {
    event.preventDefault();
    if (!selectedRoom || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/public/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          idempotencyKey,
          roomId: selectedRoom.roomId,
          scope: selectedRoom.scope,
          checkInDateManila: availability.checkInDateManila,
          checkOutDateManila: availability.checkOutDateManila,
          partySize: Number(guests || "1"),
          guestName,
          guestPhone,
          guestEmail,
          notes,
          privacyConsentAccepted: privacyConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(
          data.error ?? "Your booking request could not be sent right now.",
        );
        return;
      }

      setSubmittedAck(data as PublicBookingAckDto);
      setSelectedRoom(null);
      setGuestName("");
      setGuestPhone("");
      setGuestEmail("");
      setNotes("");
      setPrivacyConsent(false);
    } catch {
      setSubmitError(
        "Network interrupted. Retry safely — your request reference will not duplicate.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <DaisyBrand show="icon" />
            <div className="grid">
              <span className="text-base font-semibold tracking-tight text-foreground">
                {availability.propertyName}
              </span>
              {availability.propertyAddress && (
                <span className="text-xs text-muted-foreground">
                  {availability.propertyAddress}
                </span>
              )}
            </div>
          </div>

          <Link
            href="/auth/sign-in"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Owner sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <section className="grid gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Short-stay availability &amp; booking requests
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Check live published room availability.
            {availability.checkInTimeManila && availability.checkOutTimeManila
              ? ` Standard check-in ${availability.checkInTimeManila}, check-out ${availability.checkOutTimeManila}.`
              : ""}{" "}
            Requests wait for Owner review before rooms are confirmed.
          </p>
        </section>

        {submittedAck && (
          <Alert tone="success" role="status" title="Request received">
            <div className="grid gap-2 text-sm">
              <p className="font-mono text-xs font-semibold text-foreground">
                Reference: {submittedAck.referenceCode}
              </p>
              <p>
                <strong>Pending Owner review — not yet confirmed.</strong>{" "}
                Submitting a request does not hold a room until the Owner
                approves it and confirms final stay arrangements.
              </p>
              <div className="grid gap-0.5 tabular-nums">
                <span>{submittedAck.roomTitle}</span>
                <span>
                  {formatManilaDate(submittedAck.checkInDateManila)} &rarr;{" "}
                  {formatManilaDate(submittedAck.checkOutDateManila)} (
                  {submittedAck.nights}{" "}
                  {submittedAck.nights === 1 ? "night" : "nights"})
                </span>
                <span>
                  Indicative total{" "}
                  {formatPhpCurrency(submittedAck.quotedTotalAmount)}.
                </span>
              </div>
            </div>
          </Alert>
        )}

        <Card className="p-5 sm:p-6">
          <form
            onSubmit={handleCheckAvailability}
            className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Field id="pub-checkin" label="Check-in date" required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  required
                />
              )}
            </Field>

            <Field id="pub-checkout" label="Check-out date" required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  required
                />
              )}
            </Field>

            <Field id="pub-guests" label="Guests" required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="number"
                  min={1}
                  max={20}
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  required
                />
              )}
            </Field>

            <Button
              type="submit"
              size="sm"
              loading={loadingAvail}
              className="min-h-10 w-full sm:min-h-9"
            >
              Check availability
            </Button>
          </form>

          {availError && (
            <Alert tone="danger" role="alert" className="mt-4">
              {availError}
            </Alert>
          )}
        </Card>

        {availability.transientPolicyNote && (
          <Alert tone="info" title="Stay notes from the property">
            {availability.transientPolicyNote}
          </Alert>
        )}

        {availability.rooms.length === 0 ? (
          <EmptyState>
            <Image
              src="/illustrations/sweet-home.svg"
              alt=""
              width={160}
              height={112}
              className="h-28 w-auto"
            />
            <EmptyStateTitle>
              No transient listings open right now
            </EmptyStateTitle>
            <EmptyStateDescription>
              Try adjusting your dates or check back shortly when rooms are
              published for short stays.
            </EmptyStateDescription>
          </EmptyState>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2">
            {availability.rooms.map((room) => {
              const slides = buildGallerySlides(room);
              const hasGallery = slides.length > 0;
              return (
                <Card
                  key={room.roomId}
                  className="flex flex-col justify-between overflow-hidden p-0 transition-transform duration-(--duration-control) ease-(--ease-control) hover:-translate-y-0.5"
                >
                  {room.previewImageUrl && (
                    <button
                      type="button"
                      onClick={() => openGalleryForRoom(room)}
                      aria-label={`View photos for ${room.title}`}
                      className="group/photo relative aspect-[16/10] w-full cursor-pointer overflow-hidden border-b border-border bg-surface-muted text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                    >
                      <Image
                        src={room.previewImageUrl}
                        alt={room.title}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 100vw, 50vw"
                        className="object-cover transition-transform duration-300 ease-out group-hover/photo:scale-[1.03]"
                      />
                      {room.galleryImages.length > 0 && (
                        <span className="absolute right-3 bottom-3 rounded-control border border-border bg-surface/95 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm">
                          {room.galleryImages.length}{" "}
                          {room.galleryImages.length === 1 ? "shot" : "shots"}
                        </span>
                      )}
                    </button>
                  )}

                  <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="grid gap-0.5">
                          <h2 className="text-lg font-semibold tracking-tight text-foreground">
                            {room.title}
                          </h2>
                          <span className="text-xs text-muted-foreground">
                            {room.roomTypeName}
                          </span>
                        </div>
                        <Badge
                          tone={
                            room.isAvailableForRequestedStay
                              ? "success"
                              : "neutral"
                          }
                        >
                          {room.isAvailableForRequestedStay
                            ? "Room open"
                            : "Unavailable for dates"}
                        </Badge>
                      </div>

                      {room.description && (
                        <p className="text-sm leading-5 text-muted-foreground">
                          {room.description}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-3 border-t border-border pt-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="grid gap-0.5 text-xs text-muted-foreground tabular-nums">
                          <span>
                            {formatPhpCurrency(room.dailyRate)} / night
                          </span>
                          <span>
                            {availability.nights}{" "}
                            {availability.nights === 1 ? "night" : "nights"}
                          </span>
                        </div>
                        <span className="text-base font-semibold text-foreground tabular-nums">
                          Indicative{" "}
                          {formatPhpCurrency(room.indicativeTotalAmount)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {hasGallery && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => openGalleryForRoom(room)}
                          >
                            {room.galleryImages.length > 0
                              ? `View photos (${room.galleryImages.length})`
                              : "View photo"}
                          </Button>
                        )}
                        <Button
                          type="button"
                          disabled={!room.isAvailableForRequestedStay}
                          onClick={() => openRequestForRoom(room)}
                          className="flex-1"
                        >
                          Request booking
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </section>
        )}
      </main>

      <footer className="border-t border-border bg-surface/60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <div className="grid gap-0.5">
            <span>{availability.propertyName}</span>
            {availability.contactPhone && (
              <span>Front desk {availability.contactPhone}</span>
            )}
          </div>
          <span>Rates shown are indicative until Owner approval.</span>
        </div>
      </footer>

      <Dialog
        open={Boolean(selectedRoom)}
        onClose={() => setSelectedRoom(null)}
        title="Request stay"
        {...(selectedRoom
          ? {
              description: (
                <>
                  <span>{selectedRoom.title}</span>
                  <span className="tabular-nums">
                    {formatManilaDate(availability.checkInDateManila)} &rarr;{" "}
                    {formatManilaDate(availability.checkOutDateManila)} (
                    {availability.nights}{" "}
                    {availability.nights === 1 ? "night" : "nights"})
                  </span>
                  <span className="tabular-nums">
                    Indicative total{" "}
                    {formatPhpCurrency(selectedRoom.indicativeTotalAmount)}
                  </span>
                </>
              ),
            }
          : {})}
      >
        {selectedRoom && (
          <form onSubmit={handleSubmitRequest} className="grid gap-4">
            {submitError && (
              <Alert tone="danger" role="alert">
                {submitError}
              </Alert>
            )}

            <Field id="req-name" label="Your full name" required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Andrea Santos"
                  required
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="req-phone"
                label="Phone number"
                description="Phone or email required."
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    maxLength={40}
                    placeholder="e.g. +63 917 000 0000"
                  />
                )}
              </Field>

              <Field id="req-email" label="Email address">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    maxLength={160}
                    placeholder="guest@domain.example"
                  />
                )}
              </Field>
            </div>

            <Field id="req-notes" label="Note for Owner (optional)">
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Estimated arrival hour or questions"
                />
              )}
            </Field>

            <Checkbox
              checked={privacyConsent}
              onChange={(e) => setPrivacyConsent(e.target.checked)}
              label="I understand this inquiry submits my name and contact details solely so the boarding house Owner can review and confirm availability."
            />

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSelectedRoom(null)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Submit request
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        open={Boolean(galleryRoom)}
        onClose={() => setGalleryRoom(null)}
        maxWidthClassName="max-w-2xl"
        title={galleryRoom ? `Photos: ${galleryRoom.title}` : "Room photos"}
        description={
          galleryRoom ? `${galleryRoom.roomTypeName} showcase` : undefined
        }
      >
        {galleryRoom &&
          (() => {
            const slides = buildGallerySlides(galleryRoom);
            if (slides.length === 0) return null;
            const safeIndex = Math.min(galleryIndex, slides.length - 1);
            const current = slides[safeIndex]!;
            return (
              <div
                onKeyDown={handleGalleryKeyDown}
                tabIndex={-1}
                className="grid gap-3 outline-none"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-panel border border-border bg-foreground/95">
                  <Image
                    src={current.url}
                    alt={
                      current.caption ||
                      `${galleryRoom.title} photo ${safeIndex + 1}`
                    }
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 640px"
                    className="object-contain"
                  />
                </div>

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    {current.caption ? (
                      <p className="text-sm leading-5 font-medium text-foreground">
                        {current.caption}
                      </p>
                    ) : (
                      <p className="text-sm leading-5 text-muted-foreground">
                        {galleryRoom.title}
                      </p>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Photo {safeIndex + 1} of {slides.length}
                    </span>
                  </div>

                  {slides.length > 1 && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setGalleryIndex(
                            (safeIndex - 1 + slides.length) % slides.length,
                          )
                        }
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setGalleryIndex((safeIndex + 1) % slides.length)
                        }
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>

                {slides.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {slides.map((slide, idx) => (
                      <button
                        key={slide.id}
                        type="button"
                        onClick={() => setGalleryIndex(idx)}
                        aria-label={`View photo ${idx + 1}${slide.caption ? `: ${slide.caption}` : ""}`}
                        aria-pressed={idx === safeIndex}
                        className={`relative aspect-[4/3] w-18 shrink-0 cursor-pointer overflow-hidden rounded-control border transition-colors ${
                          idx === safeIndex
                            ? "border-primary ring-1 ring-primary"
                            : "border-border opacity-75 hover:opacity-100"
                        }`}
                      >
                        <Image
                          src={slide.url}
                          alt={
                            slide.caption ||
                            `${galleryRoom.title} thumbnail ${idx + 1}`
                          }
                          fill
                          unoptimized
                          sizes="72px"
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
      </Dialog>
    </div>
  );
}
