"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { OfflineSyncBadge } from "@/components/features/offline/offline-vault-unlock";
import { StayDateRangePicker } from "@/components/features/transients/public-stay-date-range-picker";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SavedFeedbackTone } from "@/components/ui/toaster";
import {
  cancelTransientAction,
  createTransientGuestAction,
  createTransientReservationAction,
  updateTransientPolicyNoteAction,
  type TransientActionResult,
} from "@/features/transients/actions";
import { computeTransientNights } from "@/features/transients/calculations";
import {
  ALLOCATION_SCOPE_LABELS,
  CreateTransientGuestSyncPayloadSchema,
  CreateTransientReservationSyncPayloadSchema,
  TRANSIENT_RESERVATION_STATUS_LABELS,
  type TransientGuestDto,
  type TransientReservationDto,
  type TransientReservationStatusValue,
  type TransientRoomOptionDto,
} from "@/features/transients/schemas";
import {
  addManilaDays,
  formatManilaDate,
  formatManilaDateTime,
  toManilaDate,
} from "@/lib/dates";
import {
  formatMoneyDecimal,
  formatPhpCurrency,
  parseMoneyDecimal,
} from "@/lib/money";
import type { OfflineEntitySyncBadge } from "@/offline/snapshot-selectors";
import {
  getOfflineVaultClientState,
  OfflineVaultLockedError,
  submitOfflineCapableMutation,
} from "@/offline/workspace-bridge";

function mapTransientIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export function CreateTransientGuestDialog({
  open,
  offlineMode = false,
  onClose,
  onRequireVaultUnlock,
  onSaved,
}: {
  open: boolean;
  offlineMode?: boolean;
  onClose: () => void;
  onRequireVaultUnlock?: () => void;
  onSaved: (message: string, tone?: SavedFeedbackTone) => void | Promise<void>;
}) {
  const [state, submitAction, pending] = useActionState(
    async (
      prev: TransientActionResult,
      formData: FormData,
    ): Promise<TransientActionResult> => {
      const vault = await getOfflineVaultClientState();
      const useOfflineBridge =
        offlineMode ||
        !vault.online ||
        (vault.vaultUnlocked && Boolean(vault.deviceId));

      if (useOfflineBridge) {
        const parsed = CreateTransientGuestSyncPayloadSchema.safeParse({
          fullName: String(formData.get("fullName") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          email: String(formData.get("email") ?? ""),
          notes: String(formData.get("notes") ?? ""),
        });
        if (!parsed.success) {
          return {
            status: "error",
            message:
              parsed.error.issues[0]?.message ??
              "Review guest fields before saving.",
            fieldErrors: mapTransientIssues(parsed.error.issues),
          };
        }
        try {
          const entityId = crypto.randomUUID();
          const nowIso = new Date().toISOString();
          const res = await submitOfflineCapableMutation({
            type: "transient_guest.create",
            entityId,
            baseVersion: 0,
            payload: parsed.data,
            projectionPayload: {
              id: entityId,
              ...parsed.data,
              archivedAt: null,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            syncedMessage: "Guest added.",
            queuedMessage: "Guest saved on this device (waiting to go online).",
          });
          onClose();
          await onSaved(
            res.delivery === "needs_attention" ? res.reason : res.message,
            res.delivery === "needs_attention"
              ? "warning"
              : res.delivery === "queued"
                ? "info"
                : "success",
          );
          return { status: "saved", message: "Saved.", entityId };
        } catch (error) {
          if (error instanceof OfflineVaultLockedError) {
            onRequireVaultUnlock?.();
          }
          return {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not save guest locally.",
            fieldErrors: {},
          };
        }
      }

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
      dismissDisabled={pending}
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
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
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
  offlineMode = false,
  guests,
  rooms,
  reservations = [],
  onClose,
  onRequireVaultUnlock,
  onSaved,
}: {
  open: boolean;
  offlineMode?: boolean;
  guests: TransientGuestDto[];
  rooms: TransientRoomOptionDto[];
  reservations?: TransientReservationDto[];
  onClose: () => void;
  onRequireVaultUnlock?: () => void;
  onSaved: (message: string, tone?: SavedFeedbackTone) => void | Promise<void>;
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [partySize, setPartySize] = useState("1");
  const [dailyRateOverride, setDailyRateOverride] = useState("");
  const [tentative, setTentative] = useState(false);
  const [issueInvoiceImmediately, setIssueInvoiceImmediately] = useState(false);

  const roomUnavailableDates = useMemo(() => {
    if (!roomId) return [] as string[];
    const blocked = new Set<string>();
    for (const stay of reservations) {
      if (stay.roomId !== roomId) continue;
      if (
        stay.status !== "TENTATIVE" &&
        stay.status !== "CONFIRMED" &&
        stay.status !== "CHECKED_IN"
      ) {
        continue;
      }
      let cursor = stay.checkInDateManila;
      let guard = 0;
      while (cursor < stay.checkOutDateManila && guard < 366) {
        blocked.add(cursor);
        cursor = addManilaDays(cursor, 1);
        guard += 1;
      }
    }
    return Array.from(blocked).sort();
  }, [reservations, roomId]);

  const [state, submitAction, pending] = useActionState(
    async (
      prev: TransientActionResult,
      formData: FormData,
    ): Promise<TransientActionResult> => {
      const vault = await getOfflineVaultClientState();
      const useOfflineBridge =
        offlineMode ||
        !vault.online ||
        (vault.vaultUnlocked && Boolean(vault.deviceId));

      if (useOfflineBridge) {
        const parsed = CreateTransientReservationSyncPayloadSchema.safeParse({
          guestId,
          roomId,
          bedId: null,
          scope: "WHOLE_ROOM",
          checkInDateManila: checkInDate,
          checkOutDateManila: checkOutDate,
          partySize,
          dailyRateOverride,
          notes: String(formData.get("notes") ?? ""),
          tentative: offlineMode || !vault.online ? true : tentative,
          issueInvoiceImmediately:
            offlineMode || !vault.online ? false : issueInvoiceImmediately,
        });
        if (!parsed.success) {
          return {
            status: "error",
            message:
              parsed.error.issues[0]?.message ??
              "Review stay details before booking.",
            fieldErrors: mapTransientIssues(parsed.error.issues),
          };
        }
        try {
          const entityId = crypto.randomUUID();
          const nowIso = new Date().toISOString();
          const selectedGuest = activeGuests.find((g) => g.id === guestId);
          const stayNights = computeTransientNights(
            parsed.data.checkInDateManila,
            parsed.data.checkOutDateManila,
          );
          const rateStr =
            parsed.data.dailyRateOverride ??
            selectedRoom?.resolvedDailyRate ??
            "0.00";
          const totalCentavos = parseMoneyDecimal(rateStr) * BigInt(stayNights);

          const res = await submitOfflineCapableMutation({
            type: "transient_reservation.create",
            entityId,
            baseVersion: 0,
            payload: parsed.data,
            projectionPayload: {
              id: entityId,
              guestId: parsed.data.guestId,
              guestName: selectedGuest?.fullName ?? "Transient guest",
              guestPhone: selectedGuest?.phone ?? null,
              guestEmail: selectedGuest?.email ?? null,
              roomId: parsed.data.roomId,
              roomNumber: selectedRoom?.number ?? "—",
              roomTypeName: selectedRoom?.roomTypeName ?? "Transient",
              bedId: null,
              bedNumber: null,
              scope: "WHOLE_ROOM",
              checkInDateManila: parsed.data.checkInDateManila,
              checkOutDateManila: parsed.data.checkOutDateManila,
              nights: stayNights,
              partySize: parsed.data.partySize,
              dailyRate: rateStr,
              totalAmount: formatMoneyDecimal(totalCentavos),
              status: "TENTATIVE",
              notes: parsed.data.notes,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            syncedMessage: "Short stay reserved.",
            queuedMessage:
              "Short stay saved on this device (waiting to confirm once online).",
          });
          onClose();
          await onSaved(
            res.delivery === "needs_attention" ? res.reason : res.message,
            res.delivery === "needs_attention"
              ? "warning"
              : res.delivery === "queued"
                ? "info"
                : "success",
          );
          return { status: "saved", message: "Saved.", entityId };
        } catch (error) {
          if (error instanceof OfflineVaultLockedError) {
            onRequireVaultUnlock?.();
          }
          return {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not save stay locally.",
            fieldErrors: {},
          };
        }
      }

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
      dismissDisabled={pending || calendarOpen}
      maxWidthClassName="max-w-xl"
      title="Book short stay"
      description="Reserves the room across your chosen check-in and check-out times."
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
          <StayDateRangePicker
            className="sm:col-span-2"
            checkInId="stay-checkin"
            checkOutId="stay-checkout"
            checkInName="checkInDateManila"
            checkOutName="checkOutDateManila"
            checkIn={checkInDate}
            checkOut={checkOutDate}
            unavailableDates={roomUnavailableDates}
            showUnavailableLegend={roomUnavailableDates.length > 0}
            disabled={pending}
            onOpenChange={setCalendarOpen}
            onRangeSelect={(nextCheckIn, nextCheckOut) => {
              setCheckInDate(nextCheckIn);
              setCheckOutDate(nextCheckOut);
            }}
          />

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

        <div className="grid gap-2 border-y border-border py-2.5 text-sm">
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
          {!offlineMode && (
            <Checkbox
              name="issueInvoiceImmediately"
              checked={issueInvoiceImmediately}
              onChange={(e) => setIssueInvoiceImmediately(e.target.checked)}
              label="Create and issue stay invoice right away"
            />
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
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
  onSaved: (message: string, tone?: SavedFeedbackTone) => void | Promise<void>;
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
      dismissDisabled={pending}
      title="Cancel transient stay"
      {...(reservation
        ? {
            description: `Frees Room ${reservation.roomNumber} from ${reservation.guestName}'s reservation.`,
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
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={onClose}
            >
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
  onSaved: (message: string, tone?: SavedFeedbackTone) => void | Promise<void>;
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
      dismissDisabled={pending}
      title="Public transient policy note"
      description="Shown on your public booking page next to check-in/out times so visitors know payment, ID, and house rules before sending a request."
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
              placeholder="Bring one valid ID on arrival. Requests wait for host confirmation before beds are held."
            />
          )}
        </Field>
        <div className="flex flex-wrap justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
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

const RESERVATION_DETAIL_STATUS_TONE: Record<
  TransientReservationStatusValue,
  "warning" | "info" | "success" | "neutral" | "danger"
> = {
  TENTATIVE: "warning",
  CONFIRMED: "info",
  CHECKED_IN: "success",
  CHECKED_OUT: "neutral",
  CANCELLED: "danger",
  NO_SHOW: "danger",
};

export function TransientReservationDetailDialog({
  reservation,
  guest,
  syncBadge,
  onClose,
}: {
  reservation: TransientReservationDto | null;
  guest: TransientGuestDto | null;
  syncBadge?: OfflineEntitySyncBadge;
  onClose: () => void;
}) {
  const guestPhone = reservation?.guestPhone ?? guest?.phone ?? null;
  const guestEmail = reservation?.guestEmail ?? guest?.email ?? null;
  const guestNotes = guest?.notes ?? null;

  return (
    <Dialog
      open={Boolean(reservation)}
      onClose={onClose}
      closeOnBackdrop
      maxWidthClassName="max-w-xl"
      title={
        reservation
          ? `Stay for ${reservation.guestName}`
          : "Reservation details"
      }
      {...(reservation
        ? {
            description: `Room ${reservation.roomNumber} (${reservation.roomTypeName})`,
          }
        : {})}
    >
      {reservation && (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={RESERVATION_DETAIL_STATUS_TONE[reservation.status]}>
              {TRANSIENT_RESERVATION_STATUS_LABELS[reservation.status]}
            </Badge>
            <OfflineSyncBadge badge={syncBadge} />
          </div>

          <section className="grid gap-2.5 border-t border-border pt-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Guest details
            </h3>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Full name</dt>
                <dd className="font-medium text-foreground">
                  {reservation.guestName}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Party size</dt>
                <dd className="text-foreground tabular-nums">
                  {reservation.partySize}{" "}
                  {reservation.partySize === 1 ? "guest" : "guests"}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd className="text-foreground tabular-nums">
                  {guestPhone ?? "—"}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="break-all text-foreground">
                  {guestEmail ?? "—"}
                </dd>
              </div>
              {guestNotes && (
                <div className="grid gap-0.5 sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Guest notes</dt>
                  <dd className="whitespace-pre-wrap text-foreground">
                    {guestNotes}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="grid gap-2.5 border-t border-border pt-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Stay &amp; room
            </h3>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Room</dt>
                <dd className="font-medium text-foreground">
                  Room {reservation.roomNumber} ({reservation.roomTypeName})
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Booking scope</dt>
                <dd className="text-foreground">
                  {ALLOCATION_SCOPE_LABELS[reservation.scope]}
                  {reservation.bedNumber
                    ? ` (Bed ${reservation.bedNumber})`
                    : ""}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Check-in date</dt>
                <dd className="text-foreground tabular-nums">
                  {formatManilaDate(reservation.checkInDateManila)}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">
                  Check-out date
                </dt>
                <dd className="text-foreground tabular-nums">
                  {formatManilaDate(reservation.checkOutDateManila)} (
                  {reservation.nights}{" "}
                  {reservation.nights === 1 ? "night" : "nights"})
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Daily rate</dt>
                <dd className="text-foreground tabular-nums">
                  {formatPhpCurrency(reservation.dailyRate)}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">Stay total</dt>
                <dd className="font-semibold text-foreground tabular-nums">
                  {formatPhpCurrency(reservation.totalAmount)}
                </dd>
              </div>
              {reservation.checkedInAt && (
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Checked in</dt>
                  <dd className="text-foreground tabular-nums">
                    {formatManilaDateTime(new Date(reservation.checkedInAt))}
                  </dd>
                </div>
              )}
              {reservation.checkedOutAt && (
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Checked out</dt>
                  <dd className="text-foreground tabular-nums">
                    {formatManilaDateTime(new Date(reservation.checkedOutAt))}
                  </dd>
                </div>
              )}
              {reservation.cancelledAt && (
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    Cancelled / closed
                  </dt>
                  <dd className="text-foreground tabular-nums">
                    {formatManilaDateTime(new Date(reservation.cancelledAt))}
                  </dd>
                </div>
              )}
              {reservation.notes && (
                <div className="grid gap-0.5 sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Stay notes</dt>
                  <dd className="whitespace-pre-wrap text-foreground">
                    {reservation.notes}
                  </dd>
                </div>
              )}
              {reservation.cancellationReason && (
                <div className="grid gap-0.5 sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    Cancellation / no-show reason
                  </dt>
                  <dd className="whitespace-pre-wrap text-foreground">
                    {reservation.cancellationReason}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="grid gap-2.5 border-t border-border pt-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Billing
            </h3>
            {reservation.activeInvoiceId ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Invoice</dt>
                  <dd className="font-mono font-semibold text-foreground">
                    <Link
                      href={`/billing/${reservation.activeInvoiceId}`}
                      className="underline underline-offset-4 hover:text-primary"
                    >
                      {reservation.activeInvoiceNumber ?? "Draft invoice"}
                    </Link>
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="text-foreground">
                    {reservation.activeInvoiceStatus ?? "—"}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    Invoice total
                  </dt>
                  <dd className="text-foreground tabular-nums">
                    {formatPhpCurrency(reservation.activeInvoiceTotal ?? "0")}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    Remaining balance
                  </dt>
                  <dd className="font-semibold text-foreground tabular-nums">
                    {formatPhpCurrency(reservation.activeInvoiceBalance ?? "0")}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No invoice issued for this stay yet.
              </p>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border pt-4">
            {reservation.activeInvoiceId &&
              reservation.activeInvoiceStatus !== "PAID" && (
                <Link
                  href={`/payments/new?invoiceId=${reservation.activeInvoiceId}`}
                  className={buttonClasses({ variant: "primary", size: "md" })}
                >
                  Collect payment
                </Link>
              )}
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
