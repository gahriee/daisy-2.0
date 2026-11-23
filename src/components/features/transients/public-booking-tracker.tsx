"use client";

import { useState, type FormEvent } from "react";
import { PUBLIC_BOOKING_CARD_FOCAL } from "@/components/features/transients/public-booking-chrome";
import { ScrollReveal } from "@/components/features/transients/public-booking-scrollytelling";
import { SelfDrawingLine } from "@/components/features/transients/public-booking-visual-fx";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { GrabBookingLinkButton } from "@/components/ui/property-map-pin";
import {
  buildGrabBookingUrl,
  buildMapDirectionsUrl,
  formatGuestsSummary,
  formatStayTime,
  getScopeLabel,
} from "@/features/transients/public-booking-view";
import type { PublicBookingStatusDto } from "@/features/transients/schemas";
import { cn } from "@/lib/cn";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";

function resolveTrackingPresentation(booking: PublicBookingStatusDto): {
  badgeTone: "info" | "success" | "warning" | "danger" | "neutral";
  badgeLabel: string;
  headline: string;
  detail: string;
  stepIndex: number;
  terminalNegative: boolean;
} {
  if (booking.status === "PENDING") {
    return {
      badgeTone: "info",
      badgeLabel: "Pending review",
      headline: "Waiting for host confirmation",
      detail:
        "We have received your request. Once the host approves it, you will receive a confirmation email.",
      stepIndex: 1,
      terminalNegative: false,
    };
  }

  if (booking.status === "REJECTED") {
    return {
      badgeTone: "danger",
      badgeLabel: "Not approved",
      headline: "This booking request was declined",
      detail:
        booking.rejectionReason ||
        "The host could not accommodate these dates. Feel free to browse other open dates or rooms.",
      stepIndex: 2,
      terminalNegative: true,
    };
  }

  if (booking.status === "WITHDRAWN") {
    return {
      badgeTone: "neutral",
      badgeLabel: "Withdrawn",
      headline: "This booking request was withdrawn",
      detail: "No room is currently held under this reference number.",
      stepIndex: 2,
      terminalNegative: true,
    };
  }

  // APPROVED — inspect linked reservation status if present
  if (booking.reservationStatus === "CHECKED_IN") {
    return {
      badgeTone: "success",
      badgeLabel: "Checked in",
      headline: "Currently checked in",
      detail: "Welcome! Your stay is currently active.",
      stepIndex: 3,
      terminalNegative: false,
    };
  }

  if (booking.reservationStatus === "CHECKED_OUT") {
    return {
      badgeTone: "neutral",
      badgeLabel: "Checked out",
      headline: "Stay completed",
      detail: "Thank you for staying with us.",
      stepIndex: 3,
      terminalNegative: false,
    };
  }

  if (
    booking.reservationStatus === "CANCELLED" ||
    booking.reservationStatus === "NO_SHOW"
  ) {
    return {
      badgeTone: "warning",
      badgeLabel:
        booking.reservationStatus === "NO_SHOW" ? "No-show" : "Cancelled",
      headline: "Reservation no longer active",
      detail:
        "This reservation was closed. Contact the front desk if you need help rebooking.",
      stepIndex: 2,
      terminalNegative: true,
    };
  }

  return {
    badgeTone: "success",
    badgeLabel: "Confirmed",
    headline: "Your booking is confirmed",
    detail:
      "The host has approved your stay and reserved your room. A confirmation email has been sent to your email address.",
    stepIndex: 2,
    terminalNegative: false,
  };
}

/**
 * Public booking status tracker (`#track`) embedded on `/book`. Requires BOTH
 * the reference code (`REQ-...`) and submitted email address so no guest data
 * can be enumerated from a reference alone.
 */
export function PublicBookingTracker() {
  const [referenceCode, setReferenceCode] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicBookingStatusDto | null>(null);

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedRef = referenceCode.trim().toUpperCase();
    const trimmedEmail = guestEmail.trim().toLowerCase();

    if (!trimmedRef || !/^REQ-[A-Z0-9]+$/.test(trimmedRef)) {
      setError("Enter a valid booking reference starting with REQ-.");
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError(
        "Enter the email address you used when submitting your request.",
      );
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/public/booking-requests/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceCode: trimmedRef,
          guestEmail: trimmedEmail,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setResult(null);
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Could not find a booking matching those details.",
        );
        return;
      }
      setResult(data as PublicBookingStatusDto);
    } catch {
      setError(
        "Unable to check booking status right now. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  const presentation = result ? resolveTrackingPresentation(result) : null;
  const checkInClock = result ? formatStayTime(result.checkInTimeManila) : "";
  const checkOutClock = result ? formatStayTime(result.checkOutTimeManila) : "";

  return (
    <section
      id="track"
      aria-labelledby="track-booking-heading"
      className="border-t border-border bg-surface px-4 py-14 sm:px-6 lg:px-10 lg:py-20"
    >
      <div className="mx-auto w-full max-w-4xl">
        <ScrollReveal className="mb-8 text-center">
          <h2
            id="track-booking-heading"
            className="font-book-serif text-4xl font-normal tracking-[0.05em] text-foreground uppercase sm:text-5xl"
          >
            Track your booking
          </h2>
          <SelfDrawingLine className="mt-1.5" width={148} />
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Already sent a stay request? Enter your reference number and email
            address to check if your room has been confirmed.
          </p>
        </ScrollReveal>

        <ScrollReveal variant="scale">
          <div
            className={cn("rounded-2xl p-6 sm:p-8", PUBLIC_BOOKING_CARD_FOCAL)}
          >
            <form
              onSubmit={handleLookup}
              noValidate
              className="grid grid-cols-1 items-end gap-4 sm:grid-cols-12"
            >
              <div className="sm:col-span-5">
                <Field id="track-reference" label="Booking reference" required>
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      placeholder="REQ-A1B2C3D4E5F6"
                      autoComplete="off"
                      maxLength={32}
                      value={referenceCode}
                      onChange={(event) => {
                        setReferenceCode(event.target.value.toUpperCase());
                        setError(null);
                      }}
                    />
                  )}
                </Field>
              </div>

              <div className="sm:col-span-5">
                <Field id="track-email" label="Email address" required>
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      maxLength={160}
                      value={guestEmail}
                      onChange={(event) => {
                        setGuestEmail(event.target.value);
                        setError(null);
                      }}
                    />
                  )}
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={loading}
                  className="w-full justify-center rounded-xl"
                >
                  Track
                </Button>
              </div>
            </form>

            {error && (
              <div className="mt-4">
                <Alert tone="danger" role="alert">
                  {error}
                </Alert>
              </div>
            )}

            {result && presentation && (
              <div className="mt-6 border-t border-border pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={presentation.badgeTone}>
                        {presentation.badgeLabel}
                      </Badge>
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        {result.referenceCode}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {presentation.headline}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {presentation.detail}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground sm:min-h-8"
                  >
                    Clear
                  </button>
                </div>

                {/* Progress steps for active/approved requests */}
                {!presentation.terminalNegative && (
                  <ol
                    aria-label="Booking progress"
                    className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-5 text-xs"
                  >
                    {[
                      { label: "Request sent", index: 0 },
                      { label: "Host review", index: 1 },
                      {
                        label:
                          result.reservationStatus === "CHECKED_IN"
                            ? "Checked in"
                            : result.reservationStatus === "CHECKED_OUT"
                              ? "Checked out"
                              : "Confirmed",
                        index: 2,
                      },
                    ].map((step) => {
                      const reached = presentation.stepIndex >= step.index;
                      return (
                        <li key={step.label} className="grid gap-1.5">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "block h-1.5 w-full rounded-full",
                              reached ? "bg-primary" : "bg-border",
                            )}
                          />
                          <span
                            className={cn(
                              "font-medium",
                              reached
                                ? "text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {step.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}

                <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Room</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {result.roomTitle}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Room setup
                    </dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {getScopeLabel(result.scope)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Guests</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {result.adultsCount !== null &&
                      result.childrenCount !== null
                        ? formatGuestsSummary(
                            result.adultsCount,
                            result.childrenCount,
                          )
                        : `${result.partySize} ${result.partySize === 1 ? "guest" : "guests"}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Check-in</dt>
                    <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                      {formatManilaDate(result.checkInDateManila)}
                      {checkInClock ? `, ${checkInClock}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Check-out</dt>
                    <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                      {formatManilaDate(result.checkOutDateManila)}
                      {checkOutClock ? `, ${checkOutClock}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {result.status === "APPROVED"
                        ? "Confirmed total"
                        : "Estimated total"}
                    </dt>
                    <dd className="mt-0.5 font-semibold text-foreground tabular-nums">
                      {formatPhpCurrency(result.quotedTotalAmount)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({result.nights}{" "}
                        {result.nights === 1 ? "night" : "nights"})
                      </span>
                    </dd>
                  </div>
                </dl>

                {(result.contactPhone ||
                  result.propertyAddress ||
                  (result.propertyLatitude !== null &&
                    result.propertyLongitude !== null)) && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
                    <div className="grid gap-1">
                      {result.propertyAddress && (
                        <span>Location: {result.propertyAddress}</span>
                      )}
                      {result.contactPhone && (
                        <span>
                          Questions about your stay? Call the front desk at{" "}
                          <a
                            href={`tel:${result.contactPhone.replace(/[^+\d]/g, "")}`}
                            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                          >
                            {result.contactPhone}
                          </a>
                          .
                        </span>
                      )}
                    </div>

                    {(() => {
                      const directionsUrl = buildMapDirectionsUrl({
                        address: result.propertyAddress,
                        latitude: result.propertyLatitude,
                        longitude: result.propertyLongitude,
                      });
                      const grabUrl = buildGrabBookingUrl({
                        address: result.propertyAddress,
                        latitude: result.propertyLatitude,
                        longitude: result.propertyLongitude,
                        propertyName: result.propertyName,
                      });
                      if (!directionsUrl && !grabUrl) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          {directionsUrl && (
                            <a
                              href={directionsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-primary-hover"
                            >
                              Get directions
                            </a>
                          )}
                          {grabUrl && (
                            <GrabBookingLinkButton href={grabUrl} size="sm" />
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
