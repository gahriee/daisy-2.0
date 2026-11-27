"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BackLink, Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import {
  approveBookingRequestAction,
  rejectBookingRequestAction,
  withdrawBookingRequestAction,
  type TransientActionResult,
} from "@/features/transients/actions";
import {
  BOOKING_REQUEST_STATUS_LABELS,
  GUEST_SEX_LABELS,
  type BookingRequestDetailDto,
} from "@/features/transients/schemas";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";

export function BookingRequestDetail({
  detail,
}: {
  detail: BookingRequestDetailDto;
}) {
  const router = useRouter();
  const { request, room, availableBedsForDates, matchingGuests } = detail;
  const [existingGuestId, setExistingGuestId] = useState("");
  const [confirmedRate, setConfirmedRate] = useState(
    request.currentDailyRate ?? request.quotedDailyRate,
  );
  const [confirmRateChange, setConfirmRateChange] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawFeedback, setWithdrawFeedback] =
    useState<TransientActionResult>({ status: "idle" });
  const [confirmAction, setConfirmAction] = useState<
    "approve" | "reject" | "withdraw" | null
  >(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const approveFormRef = useRef<HTMLFormElement>(null);
  const rejectFormRef = useRef<HTMLFormElement>(null);
  const confirmBypassRef = useRef<"approve" | "reject" | null>(null);

  const [approveState, approveAction, approving] = useActionState(
    async (
      prev: TransientActionResult,
      formData: FormData,
    ): Promise<TransientActionResult> => {
      const res = await approveBookingRequestAction(prev, formData);
      if (res.status === "saved") {
        toast.success(res.message);
        router.refresh();
      }
      return res;
    },
    { status: "idle" },
  );

  const [rejectState, rejectAction, rejecting] = useActionState(
    async (
      prev: TransientActionResult,
      formData: FormData,
    ): Promise<TransientActionResult> => {
      const res = await rejectBookingRequestAction(prev, formData);
      if (res.status === "saved") {
        toast.success(res.message);
        router.refresh();
      }
      return res;
    },
    { status: "idle" },
  );

  async function handleWithdraw() {
    if (withdrawing) return;
    setWithdrawError(null);
    setWithdrawing(true);
    try {
      const res = await withdrawBookingRequestAction({
        requestId: request.id,
        expectedVersion: request.version,
        reason: "Visitor withdrew request.",
      });
      setWithdrawFeedback(res);
      if (res.status === "saved") {
        setConfirmAction(null);
        toast.success(res.message);
        router.refresh();
      } else if (res.status === "error") {
        setWithdrawError(res.message);
      }
    } finally {
      setWithdrawing(false);
    }
  }

  const canApprove =
    request.status === "PENDING" &&
    (request.scope === "WHOLE_ROOM"
      ? detail.wholeRoomAvailableForDates
      : availableBedsForDates.length > 0);

  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-2">
        <BackLink href="/transients/stays">Stays &amp; requests</BackLink>
        <header className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-muted-foreground">
              {request.referenceCode}
            </span>
            <Badge
              tone={
                request.status === "PENDING"
                  ? "warning"
                  : request.status === "APPROVED"
                    ? "success"
                    : "neutral"
              }
            >
              {BOOKING_REQUEST_STATUS_LABELS[request.status]}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {request.guestName}
          </h1>
          <div className="grid gap-0.5 text-sm text-muted-foreground tabular-nums">
            <span>{room.number}</span>
            <span>
              {formatManilaDate(request.checkInDateManila)} &rarr;{" "}
              {formatManilaDate(request.checkOutDateManila)} ({request.nights}{" "}
              {request.nights === 1 ? "night" : "nights"})
            </span>
          </div>
        </header>
      </div>

      {withdrawFeedback.status === "error" && (
        <Alert tone="danger" role="alert">
          {withdrawFeedback.message}
        </Alert>
      )}

      {request.rateChangedSinceSubmit && (
        <Alert tone="warning" title="Nightly rate changed since submission">
          The visitor saw an indicative rate of{" "}
          {formatPhpCurrency(request.quotedDailyRate)} / night, while the room
          is now {formatPhpCurrency(request.currentDailyRate ?? "0")} / night.
          Review and confirm the final rate before approving.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="grid gap-4 p-5">
          <h2 className="text-base font-semibold text-foreground">
            Inquiry details
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Contact no.</dt>
              <dd className="font-medium text-foreground">
                {request.guestPhone ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="font-medium text-foreground">
                {request.guestEmail ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Age</dt>
              <dd className="font-medium text-foreground tabular-nums">
                {request.guestAge ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Sex</dt>
              <dd className="font-medium text-foreground">
                {request.guestSex ? GUEST_SEX_LABELS[request.guestSex] : "—"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Address</dt>
              <dd className="font-medium text-foreground">
                {request.guestAddress ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Guests</dt>
              <dd className="font-medium text-foreground tabular-nums">
                {request.adultsCount !== null && request.childrenCount !== null
                  ? `${request.adultsCount} ${request.adultsCount === 1 ? "adult" : "adults"}, ${request.childrenCount} ${request.childrenCount === 1 ? "child" : "children"} (${request.partySize} total)`
                  : request.partySize}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Indicative quote
              </dt>
              <dd className="font-semibold text-foreground tabular-nums">
                {formatPhpCurrency(request.quotedTotalAmount)} (
                {formatPhpCurrency(request.quotedDailyRate)}/night)
              </dd>
            </div>
          </dl>

          {request.notes && (
            <div className="grid gap-1 border-t border-border pt-3 text-sm text-foreground">
              <p className="text-xs font-medium text-muted-foreground">
                Visitor note
              </p>
              <p>{request.notes}</p>
            </div>
          )}

          <div className="grid gap-0.5 border-t border-border pt-3 text-sm">
            <p className="font-medium text-foreground">
              Live room check ({formatManilaDate(request.checkInDateManila)}{" "}
              &rarr; {formatManilaDate(request.checkOutDateManila)})
            </p>
            <p className="text-xs text-muted-foreground">
              {canApprove
                ? `Room ${room.number} is currently free for these dates.`
                : `Room ${room.number} is already booked for these dates.`}
            </p>
          </div>
        </Card>

        {request.status === "PENDING" ? (
          <div className="grid gap-6">
            <Card className="grid gap-4 p-5">
              <h2 className="text-base font-semibold text-foreground">
                Approve &amp; reserve room
              </h2>

              <form
                ref={approveFormRef}
                action={approveAction}
                onSubmit={(e) => {
                  if (confirmBypassRef.current === "approve") {
                    confirmBypassRef.current = null;
                    return;
                  }
                  e.preventDefault();
                  if (!e.currentTarget.reportValidity()) return;
                  setConfirmAction("approve");
                }}
                className="grid gap-4"
              >
                <input type="hidden" name="requestId" value={request.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={request.version}
                />
                {request.scope === "BED" && (
                  <input
                    type="hidden"
                    name="bedId"
                    value={availableBedsForDates[0]?.id ?? ""}
                  />
                )}

                {approveState.status === "error" && (
                  <Alert tone="danger" role="alert">
                    {approveState.message}
                  </Alert>
                )}

                {matchingGuests.length > 0 && (
                  <Field
                    id="approve-guest"
                    label="Match existing transient guest (optional)"
                  >
                    {(fieldProps) => (
                      <Select
                        {...fieldProps}
                        name="existingGuestId"
                        value={existingGuestId}
                        onChange={(e) => setExistingGuestId(e.target.value)}
                      >
                        <option value="">
                          Create new transient guest ({request.guestName})
                        </option>
                        {matchingGuests.map((guest) => (
                          <option key={guest.id} value={guest.id}>
                            Link to {guest.fullName} (
                            {guest.phone ?? guest.email})
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}

                <Field
                  id="approve-rate"
                  label="Confirmed nightly rate (PHP)"
                  required
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      name="confirmedDailyRate"
                      value={confirmedRate}
                      onChange={(e) => setConfirmedRate(e.target.value)}
                      required
                    />
                  )}
                </Field>

                {request.rateChangedSinceSubmit && (
                  <Checkbox
                    name="confirmRateChange"
                    checked={confirmRateChange}
                    onChange={(e) => setConfirmRateChange(e.target.checked)}
                    label="Confirm rate adjustment with guest"
                  />
                )}

                <p className="text-xs text-muted-foreground">
                  Approving automatically creates and issues the stay invoice.
                </p>

                <Button
                  type="submit"
                  loading={approving}
                  disabled={!canApprove}
                >
                  Approve request &amp; reserve
                </Button>
              </form>
            </Card>

            <Card className="grid gap-4 p-5">
              <h2 className="text-base font-semibold text-foreground">
                Reject or withdraw
              </h2>
              <form
                ref={rejectFormRef}
                action={rejectAction}
                onSubmit={(e) => {
                  if (confirmBypassRef.current === "reject") {
                    confirmBypassRef.current = null;
                    return;
                  }
                  e.preventDefault();
                  if (!e.currentTarget.reportValidity()) return;
                  setConfirmAction("reject");
                }}
                className="grid gap-3"
              >
                <input type="hidden" name="requestId" value={request.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={request.version}
                />
                {rejectState.status === "error" && (
                  <Alert tone="danger" role="alert">
                    {rejectState.message}
                  </Alert>
                )}
                <Field id="reject-reason" label="Rejection reason" required>
                  {(fieldProps) => (
                    <Textarea
                      {...fieldProps}
                      name="reason"
                      rows={2}
                      maxLength={300}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Room fully booked for requested nights"
                      required
                    />
                  )}
                </Field>
                <div className="flex flex-wrap justify-between gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    loading={withdrawing}
                    onClick={() => {
                      setWithdrawError(null);
                      setConfirmAction("withdraw");
                    }}
                  >
                    Mark withdrawn
                  </Button>
                  <Button type="submit" variant="danger" loading={rejecting}>
                    Reject request
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        ) : (
          <Card className="grid gap-3 p-5 content-start">
            <h2 className="text-base font-semibold text-foreground">
              Review outcome
            </h2>
            <div className="grid gap-0.5 text-sm text-muted-foreground">
              <span>
                Status: {BOOKING_REQUEST_STATUS_LABELS[request.status]}
              </span>
              {request.reviewedAt && (
                <span className="tabular-nums">
                  Reviewed {formatManilaDate(request.reviewedAt.slice(0, 10))}
                </span>
              )}
            </div>
            {request.rejectionReason && (
              <p className="text-sm text-foreground">
                Reason: {request.rejectionReason}
              </p>
            )}
            {request.approvedReservationId && (
              <Link
                href="/transients/stays"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Manage stay in Stays &amp; reservations
              </Link>
            )}
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => {
          if (withdrawing) return;
          setWithdrawError(null);
          setConfirmAction(null);
        }}
        onConfirm={() => {
          if (confirmAction === "approve") {
            setConfirmAction(null);
            confirmBypassRef.current = "approve";
            approveFormRef.current?.requestSubmit();
          } else if (confirmAction === "reject") {
            setConfirmAction(null);
            confirmBypassRef.current = "reject";
            rejectFormRef.current?.requestSubmit();
          } else if (confirmAction === "withdraw") {
            void handleWithdraw();
          }
        }}
        title={
          confirmAction === "approve"
            ? "Approve request & create reservation?"
            : confirmAction === "reject"
              ? "Reject booking request?"
              : "Mark request as withdrawn?"
        }
        description={
          confirmAction === "approve"
            ? "Approving creates a confirmed transient reservation and reserves the dates for this guest."
            : confirmAction === "reject"
              ? "Rejecting closes this request permanently with your reason on record."
              : "Marking withdrawn closes this booking request as cancelled by visitor request."
        }
        details={
          confirmAction === "approve" ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Guest</span>
                <span className="font-medium text-foreground">
                  {request.guestName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Confirmed rate</span>
                <span className="font-semibold text-foreground">
                  {confirmedRate ? `₱${confirmedRate}/night` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Invoice</span>
                <span className="text-foreground">Issued automatically</span>
              </div>
            </>
          ) : confirmAction === "reject" && rejectReason.trim() ? (
            <div className="grid gap-0.5">
              <span className="text-xs text-muted-foreground">Reason</span>
              <span className="text-foreground">{rejectReason.trim()}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Guest</span>
              <span className="font-medium text-foreground">
                {request.guestName}
              </span>
            </div>
          )
        }
        errorMessage={confirmAction === "withdraw" ? withdrawError : null}
        confirmLabel={
          confirmAction === "approve"
            ? "Approve & reserve"
            : confirmAction === "reject"
              ? "Reject request"
              : "Mark withdrawn"
        }
        confirmVariant={confirmAction === "approve" ? "primary" : "danger"}
        loading={confirmAction === "withdraw" && withdrawing}
      />
    </div>
  );
}
