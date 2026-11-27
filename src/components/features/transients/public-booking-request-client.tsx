"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GuestCountStepperRow,
  PUBLIC_BOOKING_CARD_ELEVATED,
  PUBLIC_BOOKING_CARD_FOCAL,
  PublicBookingBackLink,
  PublicBookingFooter,
  PublicBookingHeader,
} from "@/components/features/transients/public-booking-chrome";
import { PublicStayDateRangePicker } from "@/components/features/transients/public-stay-date-range-picker";
import { computeTransientStayTotalCentavos } from "@/features/transients/calculations";
import {
  buildPublicStayQueryString,
  buildRoomGallerySlides,
  formatGuestsSummary,
  formatStayTime,
  getGuestSexLabel,
  getRoomAvailabilityStatus,
  getScopeLabel,
} from "@/features/transients/public-booking-view";
import {
  GUEST_SEX_LABELS,
  GUEST_SEX_OPTIONS,
  type GuestSexValue,
  type PublicAvailabilityDto,
  type PublicBookingAckDto,
  type PublicPublishedRoomDto,
} from "@/features/transients/schemas";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BackLink, Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { diffManilaDays, formatManilaDate } from "@/lib/dates";
import {
  formatMoneyDecimal,
  formatPhpCurrency,
  parseMoneyDecimal,
} from "@/lib/money";
import { cn } from "@/lib/cn";

type PublicBookingRequestClientProps = {
  initialAvailability: PublicAvailabilityDto;
  initialRoom: PublicPublishedRoomDto;
  initialAdults: number;
  initialChildren: number;
  initialUnavailableDates: string[];
  initialCalendarLoadedUntil: string;
};

type FormFieldKey =
  | "checkIn"
  | "checkOut"
  | "guestName"
  | "guestAge"
  | "guestSex"
  | "guestAddress"
  | "guestPhone"
  | "guestEmail"
  | "consent";

const MAX_PUBLIC_GUESTS = 20;

function createSubmissionReference(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function PublicBookingRequestClient({
  initialAvailability,
  initialRoom,
  initialAdults,
  initialChildren,
  initialUnavailableDates,
  initialCalendarLoadedUntil,
}: PublicBookingRequestClientProps) {
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

  const [guestName, setGuestName] = useState("");
  const [guestAge, setGuestAge] = useState("");
  const [guestSex, setGuestSex] = useState<GuestSexValue | "">("");
  const [guestAddress, setGuestAddress] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [privacyConsentAccepted, setPrivacyConsentAccepted] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FormFieldKey, string>>
  >({});
  const [dateError, setDateError] = useState<string | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedAck, setSubmittedAck] = useState<PublicBookingAckDto | null>(
    null,
  );
  const [copiedReference, setCopiedReference] = useState(false);

  const submissionKeyRef = useRef<{ signature: string; key: string } | null>(
    null,
  );
  const dateFetchSeqRef = useRef(0);

  const checkInRef = useRef<HTMLButtonElement | null>(null);
  const checkOutRef = useRef<HTMLButtonElement | null>(null);
  const guestNameRef = useRef<HTMLInputElement | null>(null);
  const guestAgeRef = useRef<HTMLInputElement | null>(null);
  const guestSexMaleRef = useRef<HTMLInputElement | null>(null);
  const guestAddressRef = useRef<HTMLInputElement | null>(null);
  const guestPhoneRef = useRef<HTMLInputElement | null>(null);
  const guestEmailRef = useRef<HTMLInputElement | null>(null);
  const consentRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!copiedReference) return;
    const timer = window.setTimeout(() => setCopiedReference(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copiedReference]);

  const slides = useMemo(() => buildRoomGallerySlides(room), [room]);
  const coverPhoto = slides[0] ?? null;
  const totalGuests = adults + children;
  const status = getRoomAvailabilityStatus(room, totalGuests);

  const draftNights = useMemo(() => {
    try {
      return diffManilaDays(draftCheckIn, draftCheckOut);
    } catch {
      return 0;
    }
  }, [draftCheckIn, draftCheckOut]);

  const effectiveNights = draftNights > 0 ? draftNights : availability.nights;
  const effectiveTotalAmount = useMemo(() => {
    if (
      draftCheckIn === availability.checkInDateManila &&
      draftCheckOut === availability.checkOutDateManila
    ) {
      return room.indicativeTotalAmount;
    }
    try {
      const rateCentavos = parseMoneyDecimal(room.dailyRate);
      return formatMoneyDecimal(
        computeTransientStayTotalCentavos(rateCentavos, effectiveNights),
      );
    } catch {
      return room.indicativeTotalAmount;
    }
  }, [
    draftCheckIn,
    draftCheckOut,
    availability.checkInDateManila,
    availability.checkOutDateManila,
    room.dailyRate,
    room.indicativeTotalAmount,
    effectiveNights,
  ]);

  const syncedQuery = useMemo(
    () =>
      buildPublicStayQueryString({
        checkIn: draftCheckIn,
        checkOut: draftCheckOut,
        adults,
        children,
      }),
    [draftCheckIn, draftCheckOut, adults, children],
  );

  function syncUrl(
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
    window.history.replaceState(
      null,
      "",
      `/book/${room.roomId}/request?${query}`,
    );
  }

  function updateGuestCounts(nextAdults: number, nextChildren: number) {
    setAdults(nextAdults);
    setChildren(nextChildren);
    syncUrl(
      availability.checkInDateManila,
      availability.checkOutDateManila,
      nextAdults,
      nextChildren,
    );
  }

  function clearFieldError(key: FormFieldKey) {
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function refreshDates(
    overrideCheckIn?: string,
    overrideCheckOut?: string,
  ) {
    const targetCheckIn = overrideCheckIn ?? draftCheckIn;
    const targetCheckOut = overrideCheckOut ?? draftCheckOut;

    if (!targetCheckIn || !targetCheckOut || targetCheckOut <= targetCheckIn) {
      setDateError("Choose a check-out date after your check-in date.");
      return;
    }

    const requestSeq = ++dateFetchSeqRef.current;
    setDateError(null);
    setLoadingDates(true);
    try {
      const apiQuery = new URLSearchParams({
        checkIn: targetCheckIn,
        checkOut: targetCheckOut,
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
      if (requestSeq !== dateFetchSeqRef.current) return;
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
      syncUrl(targetCheckIn, targetCheckOut, adults, children);
    } catch {
      if (requestSeq !== dateFetchSeqRef.current) return;
      setDateError(
        "Unable to reach the reservation desk right now. Check your connection and try again.",
      );
    } finally {
      if (requestSeq === dateFetchSeqRef.current) {
        setLoadingDates(false);
      }
    }
  }

  function focusFirstError(errors: Partial<Record<FormFieldKey, string>>) {
    const order: Array<[FormFieldKey, HTMLElement | null]> = [
      ["checkIn", checkInRef.current],
      ["checkOut", checkOutRef.current],
      ["guestName", guestNameRef.current],
      ["guestAge", guestAgeRef.current],
      ["guestSex", guestSexMaleRef.current],
      ["guestAddress", guestAddressRef.current],
      ["guestPhone", guestPhoneRef.current],
      ["guestEmail", guestEmailRef.current],
      ["consent", consentRef.current],
    ];
    for (const [key, element] of order) {
      if (errors[key] && element) {
        element.focus();
        return;
      }
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (loadingDates) {
      setSubmitError(
        "Still checking your newly selected dates. Please wait a moment and try again.",
      );
      return;
    }

    const errors: Partial<Record<FormFieldKey, string>> = {};
    const trimmedName = guestName.trim();
    const parsedAge = Number.parseInt(guestAge.trim(), 10);
    const trimmedAddress = guestAddress.trim();
    const trimmedPhone = guestPhone.trim();
    const trimmedEmail = guestEmail.trim().toLowerCase();
    const trimmedNotes = notes.trim();

    if (!draftCheckIn) {
      errors.checkIn = "Select a check-in date.";
    }
    if (!draftCheckOut || draftCheckOut <= draftCheckIn) {
      errors.checkOut = "Check-out date must be after check-in date.";
    }
    if (trimmedName.length < 2 || trimmedName.length > 120) {
      errors.guestName = "Enter your full name (at least 2 characters).";
    }
    if (
      !Number.isInteger(parsedAge) ||
      String(parsedAge) !== guestAge.trim() ||
      parsedAge < 1 ||
      parsedAge > 120
    ) {
      errors.guestAge = "Enter an age between 1 and 120.";
    }
    if (guestSex !== "MALE" && guestSex !== "FEMALE") {
      errors.guestSex = "Select Male or Female.";
    }
    if (trimmedAddress.length < 3 || trimmedAddress.length > 250) {
      errors.guestAddress = "Enter your home city or address.";
    }
    if (trimmedPhone.length < 6 || trimmedPhone.length > 40) {
      errors.guestPhone = "Enter a contact number so we can reply.";
    }
    if (
      !trimmedEmail ||
      trimmedEmail.length > 160 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
    ) {
      errors.guestEmail =
        "Enter a valid email address so we can send your booking confirmation.";
    }
    if (!privacyConsentAccepted) {
      errors.consent =
        "Please confirm these guest details are accurate before sending.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstError(errors);
      return;
    }

    if (roomUnavailableOnRefresh || !status.available) {
      setSubmitError(
        roomUnavailableOnRefresh
          ? "This room is no longer listed for online booking."
          : status.detail,
      );
      return;
    }

    const payloadBody = {
      roomId: room.roomId,
      scope: room.scope,
      checkInDateManila: availability.checkInDateManila,
      checkOutDateManila: availability.checkOutDateManila,
      partySize: totalGuests,
      adultsCount: adults,
      childrenCount: children,
      guestName: trimmedName,
      guestAge: parsedAge,
      guestSex,
      guestAddress: trimmedAddress,
      guestPhone: trimmedPhone,
      guestEmail: trimmedEmail,
      notes: trimmedNotes || null,
      privacyConsentAccepted: true as const,
    };

    const payloadSignature = JSON.stringify(payloadBody);
    const idempotencyKey =
      submissionKeyRef.current?.signature === payloadSignature
        ? submissionKeyRef.current.key
        : createSubmissionReference();
    submissionKeyRef.current = {
      signature: payloadSignature,
      key: idempotencyKey,
    };

    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await fetch("/api/public/booking-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey,
          ...payloadBody,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          setSubmitError(
            retryAfter
              ? `Too many requests right now. Wait ${retryAfter} seconds and try again.`
              : "Too many requests right now. Wait a moment and try again.",
          );
          return;
        }
        setSubmitError(
          typeof data?.error === "string"
            ? data.error
            : "Could not send your booking request. Review your details and try again.",
        );
        return;
      }

      setSubmittedAck(data as PublicBookingAckDto);
      toast.info("Booking request received. Waiting for host confirmation.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError(
        "Unable to send right now. Check your internet connection and click Send request again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyReference(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedReference(true);
      toast.success("Booking reference copied.");
    } catch {
      setCopiedReference(false);
    }
  }

  const browseHref = `/book?${syncedQuery}`;
  const roomHref = `/book/${room.roomId}?${syncedQuery}`;
  const checkInTimeLabel = formatStayTime(availability.checkInTimeManila);
  const checkOutTimeLabel = formatStayTime(availability.checkOutTimeManila);

  if (submittedAck) {
    const ackAdults = submittedAck.adultsCount ?? adults;
    const ackChildren = submittedAck.childrenCount ?? children;

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
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8"
        >
          <PublicBookingBackLink href={browseHref} label="All rooms" />

          <div className="mb-6 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">Waiting for host confirmation</Badge>
              </div>
              <h1 className="font-book-serif text-3xl font-normal tracking-[0.02em] text-foreground sm:text-4xl">
                Booking request received
              </h1>
              <p className="text-sm text-muted-foreground">
                Thank you, {submittedAck.guestName}. The host will review your
                stay request and contact you directly.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-xl border border-border bg-surface px-4 py-2.5 font-mono text-sm font-semibold text-foreground">
                {submittedAck.referenceCode}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => handleCopyReference(submittedAck.referenceCode)}
              >
                {copiedReference ? "Copied" : "Copy reference"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card
              className={cn(
                "rounded-2xl border-0 p-6",
                PUBLIC_BOOKING_CARD_ELEVATED,
              )}
            >
              <h2 className="border-b border-border pb-3 text-lg font-semibold text-foreground">
                Stay summary
              </h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Room</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {submittedAck.roomTitle}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Room setup</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {getScopeLabel(submittedAck.scope)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Dates</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {formatManilaDate(submittedAck.checkInDateManila)} to{" "}
                    {formatManilaDate(submittedAck.checkOutDateManila)} (
                    {submittedAck.nights}{" "}
                    {submittedAck.nights === 1 ? "night" : "nights"})
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Guests</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {formatGuestsSummary(ackAdults, ackChildren)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Nightly rate
                  </dt>
                  <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                    {formatPhpCurrency(submittedAck.quotedDailyRate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Estimated total
                  </dt>
                  <dd className="mt-0.5 text-base font-semibold text-foreground tabular-nums">
                    {formatPhpCurrency(submittedAck.quotedTotalAmount)}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card
              className={cn(
                "rounded-2xl border-0 p-6",
                PUBLIC_BOOKING_CARD_ELEVATED,
              )}
            >
              <h2 className="border-b border-border pb-3 text-lg font-semibold text-foreground">
                Guest details sent
              </h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Full name</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {submittedAck.guestName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Age &amp; sex
                  </dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {submittedAck.guestAge ?? "-"}
                    {submittedAck.guestSex
                      ? `, ${getGuestSexLabel(submittedAck.guestSex)}`
                      : ""}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Address</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {submittedAck.guestAddress ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Contact no.</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {submittedAck.guestPhone ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd className="mt-0.5 font-medium text-foreground break-all">
                    {submittedAck.guestEmail ?? "-"}
                  </dd>
                </div>
              </dl>

              <Alert tone="info" className="mt-5">
                No payment is collected online. Once the host approves your
                request, a confirmation email will be sent to your email
                address.
              </Alert>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/book#track"
                  className={buttonClasses({
                    variant: "primary",
                    size: "md",
                    className: "rounded-xl",
                  })}
                >
                  Track booking status
                </Link>
                <Link
                  href={browseHref}
                  className={buttonClasses({
                    variant: "secondary",
                    size: "md",
                    className: "rounded-xl",
                  })}
                >
                  Browse other rooms
                </Link>
              </div>
            </Card>
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
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8"
      >
        <PublicBookingBackLink href={roomHref} label={room.title} />

        <div className="mb-6 grid gap-1 border-b border-border pb-5">
          <h1 className="font-book-serif text-3xl font-normal tracking-[0.02em] text-foreground sm:text-4xl">
            Request to book {room.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Check your stay dates and fill in the guest information below.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_27rem]"
        >
          <div className="min-w-0 space-y-6">
            {submitError && (
              <Alert tone="danger" role="alert" title="Request not sent">
                {submitError}
              </Alert>
            )}

            {dateError && (
              <Alert tone="danger" role="alert" title="Date check failed">
                {dateError}
              </Alert>
            )}

            {roomUnavailableOnRefresh && (
              <Alert tone="warning" role="status">
                This room is no longer listed for online booking. Return to{" "}
                <Link href={browseHref} className="font-medium underline">
                  all open rooms
                </Link>
                .
              </Alert>
            )}

            <Card
              className={cn(
                "rounded-2xl border-0 p-6",
                PUBLIC_BOOKING_CARD_ELEVATED,
              )}
            >
              <div className="border-b border-border pb-3">
                <h2 className="text-lg font-semibold text-foreground">
                  1. When &amp; who
                </h2>
                <p className="text-xs text-muted-foreground">
                  Confirm your dates and how many adults and children are
                  staying.
                </p>
              </div>

              <div className="mt-4">
                <PublicStayDateRangePicker
                  roomId={room.roomId}
                  checkIn={draftCheckIn}
                  checkOut={draftCheckOut}
                  initialUnavailableDates={initialUnavailableDates}
                  initialLoadedUntil={initialCalendarLoadedUntil}
                  loading={loadingDates}
                  checkInId="req-check-in"
                  checkOutId="req-check-out"
                  checkInRef={checkInRef}
                  checkOutRef={checkOutRef}
                  checkInError={fieldErrors.checkIn}
                  checkOutError={fieldErrors.checkOut}
                  onRangeSelect={(nextCheckIn, nextCheckOut) => {
                    setDraftCheckIn(nextCheckIn);
                    setDraftCheckOut(nextCheckOut);
                    setDateError(null);
                    clearFieldError("checkIn");
                    clearFieldError("checkOut");
                    void refreshDates(nextCheckIn, nextCheckOut);
                  }}
                />
              </div>

              <div className="mt-4 border-t border-border pt-2 divide-y divide-border">
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

              {!status.available && !roomUnavailableOnRefresh && (
                <div className="mt-4">
                  <Alert tone="warning">{status.detail}</Alert>
                </div>
              )}
            </Card>

            <Card
              className={cn(
                "rounded-2xl border-0 p-6",
                PUBLIC_BOOKING_CARD_ELEVATED,
              )}
            >
              <div className="border-b border-border pb-3">
                <h2 className="text-lg font-semibold text-foreground">
                  2. Guest information
                </h2>
                <p className="text-xs text-muted-foreground">
                  Required details for check-in records and host confirmation.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 content-start gap-x-4 gap-y-4 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <Field
                    id="req-guest-name"
                    label="Full name"
                    required
                    error={fieldErrors.guestName}
                  >
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        ref={guestNameRef}
                        autoComplete="name"
                        placeholder="Juan Dela Cruz"
                        maxLength={120}
                        value={guestName}
                        onChange={(event) => {
                          setGuestName(event.target.value);
                          clearFieldError("guestName");
                        }}
                      />
                    )}
                  </Field>
                </div>

                <div className="sm:col-span-2">
                  <Field
                    id="req-guest-age"
                    label="Age"
                    required
                    error={fieldErrors.guestAge}
                  >
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        ref={guestAgeRef}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={120}
                        placeholder="28"
                        value={guestAge}
                        onChange={(event) => {
                          setGuestAge(event.target.value);
                          clearFieldError("guestAge");
                        }}
                      />
                    )}
                  </Field>
                </div>

                <div className="grid min-w-0 content-start gap-1.5 sm:col-span-4">
                  <span
                    id="req-guest-sex-label"
                    className="text-[13px] leading-4 font-medium text-foreground"
                  >
                    Male / Female
                    <span aria-hidden="true" className="ml-1 text-primary">
                      *
                    </span>
                    <span className="sr-only"> (required)</span>
                  </span>

                  <div
                    role="radiogroup"
                    aria-labelledby="req-guest-sex-label"
                    aria-required="true"
                    aria-invalid={fieldErrors.guestSex ? true : undefined}
                    className={cn(
                      "inline-grid min-h-10 w-fit grid-cols-2 rounded-control border bg-surface p-0.5 sm:min-h-9",
                      fieldErrors.guestSex
                        ? "border-danger"
                        : "border-control-border",
                    )}
                  >
                    {GUEST_SEX_OPTIONS.map((option, index) => {
                      const selected = guestSex === option;
                      return (
                        <label
                          key={option}
                          className={cn(
                            "flex cursor-pointer items-center justify-center rounded-[2px] px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-(--duration-control) ease-(--ease-control) focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-primary sm:text-[13px]",
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground hover:bg-surface-muted/70",
                          )}
                        >
                          <input
                            ref={index === 0 ? guestSexMaleRef : undefined}
                            type="radio"
                            name="guestSex"
                            value={option}
                            checked={selected}
                            onChange={() => {
                              setGuestSex(option);
                              clearFieldError("guestSex");
                            }}
                            className="sr-only"
                          />
                          <span>{GUEST_SEX_LABELS[option]}</span>
                        </label>
                      );
                    })}
                  </div>

                  {fieldErrors.guestSex && (
                    <p
                      role="alert"
                      className="flex items-start gap-1.5 text-[13px] leading-4 font-medium text-danger"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-px inline-grid size-3.5 shrink-0 place-items-center rounded-full bg-danger text-[10px] leading-none font-semibold text-primary-foreground"
                      >
                        !
                      </span>
                      <span>{fieldErrors.guestSex}</span>
                    </p>
                  )}
                </div>

                <div className="sm:col-span-12">
                  <Field
                    id="req-guest-address"
                    label="Address"
                    required
                    error={fieldErrors.guestAddress}
                  >
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        ref={guestAddressRef}
                        autoComplete="street-address"
                        placeholder="Barangay, city, or street address"
                        maxLength={250}
                        value={guestAddress}
                        onChange={(event) => {
                          setGuestAddress(event.target.value);
                          clearFieldError("guestAddress");
                        }}
                      />
                    )}
                  </Field>
                </div>

                <div className="sm:col-span-6">
                  <Field
                    id="req-guest-phone"
                    label="Contact no."
                    required
                    error={fieldErrors.guestPhone}
                  >
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        ref={guestPhoneRef}
                        type="tel"
                        autoComplete="tel"
                        placeholder="0917 123 4567"
                        maxLength={40}
                        value={guestPhone}
                        onChange={(event) => {
                          setGuestPhone(event.target.value);
                          clearFieldError("guestPhone");
                        }}
                      />
                    )}
                  </Field>
                </div>

                <div className="sm:col-span-6">
                  <Field
                    id="req-guest-email"
                    label="Email"
                    required
                    description="Used for booking confirmation and status tracking"
                    error={fieldErrors.guestEmail}
                  >
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        ref={guestEmailRef}
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="name@example.com"
                        maxLength={160}
                        value={guestEmail}
                        onChange={(event) => {
                          setGuestEmail(event.target.value);
                          clearFieldError("guestEmail");
                        }}
                      />
                    )}
                  </Field>
                </div>

                <div className="sm:col-span-12">
                  <Field
                    id="req-guest-notes"
                    label="Note for the host (optional)"
                    description="Arrival time or special request"
                  >
                    {(fieldProps) => (
                      <Textarea
                        {...fieldProps}
                        rows={3}
                        maxLength={500}
                        placeholder="Estimated arrival time or any request for your stay"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                      />
                    )}
                  </Field>
                </div>
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <Checkbox
                  ref={consentRef}
                  checked={privacyConsentAccepted}
                  aria-invalid={Boolean(fieldErrors.consent)}
                  onChange={(event) => {
                    setPrivacyConsentAccepted(event.target.checked);
                    clearFieldError("consent");
                  }}
                  label="I confirm that these guest details are accurate so the host can review my booking request."
                />
                {fieldErrors.consent && (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {fieldErrors.consent}
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <BackLink href={roomHref} size="md">
                  {room.title}
                </BackLink>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={submitting || loadingDates}
                  disabled={roomUnavailableOnRefresh || !status.available}
                  className="rounded-xl px-6"
                >
                  {loadingDates ? "Checking dates" : "Send booking request"}
                </Button>
              </div>
            </Card>
          </div>

          <aside className="min-w-0">
            <Card
              className={cn(
                "rounded-2xl border-0 p-5 lg:sticky lg:top-24",
                PUBLIC_BOOKING_CARD_FOCAL,
              )}
            >
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                  {coverPhoto ? (
                    <img
                      src={coverPhoto.url}
                      alt={coverPhoto.caption ?? `${room.title} photo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No photo
                    </div>
                  )}
                </div>
                <div className="grid min-w-0 gap-1">
                  <h2 className="truncate text-base font-semibold text-foreground">
                    {room.title}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {getScopeLabel(room.scope)}
                  </span>
                </div>
              </div>

              <dl className="mt-4 grid gap-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Check-in</dt>
                  <dd className="font-medium text-foreground">
                    {formatManilaDate(draftCheckIn)}
                    {checkInTimeLabel ? `, ${checkInTimeLabel}` : ""}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Check-out</dt>
                  <dd className="font-medium text-foreground">
                    {formatManilaDate(draftCheckOut)}
                    {checkOutTimeLabel ? `, ${checkOutTimeLabel}` : ""}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Guests</dt>
                  <dd className="font-medium text-foreground">
                    {formatGuestsSummary(adults, children)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    {formatPhpCurrency(room.dailyRate)} x {effectiveNights}{" "}
                    {effectiveNights === 1 ? "night" : "nights"}
                  </span>
                  <span className="tabular-nums">
                    {formatPhpCurrency(effectiveTotalAmount)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-base font-semibold text-foreground">
                  <span>Estimated total</span>
                  <span className="tabular-nums">
                    {formatPhpCurrency(effectiveTotalAmount)}
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-background px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                Sending this request does not charge you or hold the room right
                away. Rooms are reserved only after the host confirms your
                request.
              </div>
            </Card>
          </aside>
        </form>
      </main>

      <PublicBookingFooter
        propertyName={availability.propertyName}
        propertyAddress={availability.propertyAddress}
        contactPhone={availability.contactPhone}
      />
    </div>
  );
}
