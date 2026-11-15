"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelTransientAction,
  createTransientGuestAction,
  createTransientReservationAction,
  updateTransientPolicyNoteAction,
  type TransientActionResult,
} from "@/features/transients/actions";
import { computeTransientNights } from "@/features/transients/calculations";
import type {
  TransientGuestDto,
  TransientReservationDto,
  TransientRoomOptionDto,
} from "@/features/transients/schemas";
import { addManilaDays, toManilaDate } from "@/lib/dates";
import { formatPhpCurrency, parseMoneyDecimal } from "@/lib/money";

export function CreateTransientGuestDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [state, submitAction, pending] = useActionState(
    async (
      prev: TransientActionResult,
      formData: FormData,
    ): Promise<TransientActionResult> => {
      const res = await createTransientGuestAction(prev, formData);
      if (res.status === "saved") {
        onClose();
        await onSaved(res.message);
      }
      return res;
    },
    { status: "idle" },
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add transient guest"
      description="Store contact details separately from boarders so repeat short stays can be booked cleanly."
    >
      <form action={submitAction} className="grid gap-4">
        {state.status === "error" && (
          <Alert tone="danger" role="alert">
            {state.message}
          </Alert>
        )}

        <Field
          id="guest-full-name"
          label="Full name"
          required
          error={
            state.status === "error" ? state.fieldErrors.fullName : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="fullName"
              maxLength={120}
              placeholder="e.g. Marco Reyes"
              required
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="guest-phone"
            label="Phone number"
            description="Phone or email is required."
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="phone"
                maxLength={40}
                placeholder="e.g. +63 917 000 0000"
              />
            )}
          </Field>

          <Field id="guest-email" label="Email address">
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="email"
                name="email"
                maxLength={160}
                placeholder="guest@domain.example"
              />
            )}
          </Field>
        </div>

        <Field id="guest-notes" label="Notes (optional)">
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              name="notes"
              rows={3}
              maxLength={500}
              placeholder="Arrival preference, ID note, or stay remarks"
            />
          )}
        </Field>

        <div className="flex flex-wrap justify-end gap-2.5 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save guest
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function CreateTransientReservationDialog({
  open,
  guests,
  rooms,
  onClose,
  onSaved,
}: {
  open: boolean;
  guests: TransientGuestDto[];
  rooms: TransientRoomOptionDto[];
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const activeGuests = guests.filter((g) => !g.archivedAt);
  const eligibleRooms = rooms.filter((r) => Boolean(r.resolvedDailyRate));
  const defaultToday = toManilaDate(new Date());

  const [guestId, setGuestId] = useState(activeGuests[0]?.id ?? "");
  const [roomId, setRoomId] = useState(eligibleRooms[0]?.id ?? "");
  const selectedRoom =
    eligibleRooms.find((r) => r.id === roomId) ?? eligibleRooms[0] ?? null;

  const [checkInDate, setCheckInDate] = useState(defaultToday);
  const [checkOutDate, setCheckOutDate] = useState(
    addManilaDays(defaultToday, 1),
  );
  const [partySize, setPartySize] = useState("1");
  const [dailyRateOverride, setDailyRateOverride] = useState("");
  const [tentative, setTentative] = useState(false);
  const [issueInvoiceImmediately, setIssueInvoiceImmediately] = useState(false);

  const [state, submitAction, pending] = useActionState(
    async (
      prev: TransientActionResult,
      formData: FormData,
    ): Promise<TransientActionResult> => {
      const res = await createTransientReservationAction(prev, formData);
      if (res.status === "saved") {
        onClose();
        await onSaved(res.message);
      }
      return res;
    },
    { status: "idle" },
  );

  function handleRoomChange(nextRoomId: string) {
    setRoomId(nextRoomId);
  }

  let nights = 0;
  try {
    nights = computeTransientNights(checkInDate, checkOutDate);
  } catch {
    nights = 0;
  }

  let estimatedCentavos = BigInt(0);
  try {
    const rawRate = dailyRateOverride.trim() || selectedRoom?.resolvedDailyRate;
    if (rawRate && nights > 0) {
      estimatedCentavos = parseMoneyDecimal(rawRate) * BigInt(nights);
    }
  } catch {
    estimatedCentavos = BigInt(0);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-xl"
      title="Book transient stay"
      description="Creates a room allocation across the scheduled check-in and check-out times."
    >
      <form action={submitAction} className="grid gap-4">
        <input type="hidden" name="scope" value="WHOLE_ROOM" />
        <input type="hidden" name="bedId" value="" />
        {state.status === "error" && (
          <Alert tone="danger" role="alert">
            {state.message}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="stay-guest" label="Transient guest" required>
            {(fieldProps) => (
              <Select
                {...fieldProps}
                name="guestId"
                value={guestId}
                onChange={(e) => setGuestId(e.target.value)}
                required
              >
                {activeGuests.length === 0 && (
                  <option value="">No active guests yet</option>
                )}
                {activeGuests.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="stay-room" label="Room" required>
            {(fieldProps) => (
              <Select
                {...fieldProps}
                name="roomId"
                value={roomId}
                onChange={(e) => handleRoomChange(e.target.value)}
                required
              >
                {eligibleRooms.length === 0 && (
                  <option value="">Configure room daily rate first</option>
                )}
                {eligibleRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    Room {room.number} ({room.roomTypeName}) —{" "}
                    {formatPhpCurrency(room.resolvedDailyRate ?? "0")} / night
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="stay-checkin" label="Check-in date" required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="date"
                name="checkInDateManila"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                required
              />
            )}
          </Field>

          <Field id="stay-checkout" label="Check-out date" required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="date"
                name="checkOutDateManila"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                required
              />
            )}
          </Field>

          <Field id="stay-party" label="Guests" required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="number"
                name="partySize"
                min={1}
                max={20}
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                required
              />
            )}
          </Field>

          <Field
            id="stay-rate"
            label="Nightly rate override"
            {...(selectedRoom?.resolvedDailyRate
              ? {
                  description: `Default: ${formatPhpCurrency(selectedRoom.resolvedDailyRate)}`,
                }
              : {})}
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="dailyRateOverride"
                value={dailyRateOverride}
                onChange={(e) => setDailyRateOverride(e.target.value)}
                placeholder={selectedRoom?.resolvedDailyRate ?? "0.00"}
              />
            )}
          </Field>
        </div>

        <Field id="stay-notes" label="Stay notes (optional)">
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              name="notes"
              rows={2}
              maxLength={500}
              placeholder="Flight arrival time, requests, or remarks"
            />
          )}
        </Field>

        <div className="grid gap-2 rounded-control border border-border bg-surface-muted px-3.5 py-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {nights > 0 ? (
              <div className="grid gap-0.5 text-muted-foreground">
                <span>
                  {nights} {nights === 1 ? "night" : "nights"}
                </span>
                <span>Room {selectedRoom?.number ?? "—"}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">
                Select valid check-out date
              </span>
            )}
            <span className="font-semibold text-foreground tabular-nums">
              {estimatedCentavos > BigInt(0)
                ? formatPhpCurrency(estimatedCentavos)
                : "—"}
            </span>
          </div>
          <Checkbox
            name="tentative"
            checked={tentative}
            onChange={(e) => setTentative(e.target.checked)}
            label="Save as tentative hold instead of confirmed"
          />
          <Checkbox
            name="issueInvoiceImmediately"
            checked={issueInvoiceImmediately}
            onChange={(e) => setIssueInvoiceImmediately(e.target.checked)}
            label="Create and issue stay invoice right away"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2.5 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={pending}
            disabled={activeGuests.length === 0 || eligibleRooms.length === 0}
          >
            Create stay
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function CancelTransientDialog({
  reservation,
  onClose,
  onSaved,
}: {
  reservation: TransientReservationDto | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [state, submitAction, pending] = useActionState(
    async (
      prev: TransientActionResult,
      formData: FormData,
    ): Promise<TransientActionResult> => {
      const res = await cancelTransientAction(prev, formData);
      if (res.status === "saved") {
        onClose();
        await onSaved(res.message);
      }
      return res;
    },
    { status: "idle" },
  );

  return (
    <Dialog
      open={Boolean(reservation)}
      onClose={onClose}
      title="Cancel transient stay"
      {...(reservation
        ? {
            description: `Releases Room ${reservation.roomNumber} allocation for ${reservation.guestName}.`,
          }
        : {})}
    >
      {reservation && (
        <form action={submitAction} className="grid gap-4">
          <input type="hidden" name="reservationId" value={reservation.id} />
          <input
            type="hidden"
            name="expectedVersion"
            value={reservation.version}
          />
          {state.status === "error" && (
            <Alert tone="danger" role="alert">
              {state.message}
            </Alert>
          )}
          <Field id="cancel-reason" label="Cancellation reason (optional)">
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                name="reason"
                rows={3}
                maxLength={300}
                placeholder="Guest rescheduled or cancelled in advance"
              />
            )}
          </Field>
          <div className="flex flex-wrap justify-end gap-2.5 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Keep stay
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              Cancel stay
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function TransientPolicyNoteDialog({
  open,
  initialNote,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialNote: string | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [note, setNote] = useState(initialNote ?? "");
  const [state, submitAction, pending] = useActionState(
    async (
      prev: TransientActionResult,
      formData: FormData,
    ): Promise<TransientActionResult> => {
      const res = await updateTransientPolicyNoteAction(prev, formData);
      if (res.status === "saved") {
        onClose();
        await onSaved(res.message);
      }
      return res;
    },
    { status: "idle" },
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Public transient policy note"
      description="Shown on /book next to check-in/out times so visitors know payment, ID, and house rules before submitting a request."
    >
      <form action={submitAction} className="grid gap-4">
        {state.status === "error" && (
          <Alert tone="danger" role="alert">
            {state.message}
          </Alert>
        )}
        <Field id="policy-note" label="Policy note">
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              name="transientPolicyNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Bring one valid ID on arrival. Requests wait for Owner confirmation before beds are held."
            />
          )}
        </Field>
        <div className="flex flex-wrap justify-end gap-2.5 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save policy note
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
