"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { InventoryActionResult } from "@/features/rooms/actions";
import type { RoomTypeDto, RoomWithBedsDto } from "@/features/rooms/schemas";
import { formatPhpCurrency } from "@/lib/money";

export function EditRoomTypeDialog({
  roomType,
  pending,
  state,
  onClose,
  onSubmit,
}: {
  roomType: RoomTypeDto | null;
  pending: boolean;
  state: InventoryActionResult;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <Dialog
      open={roomType !== null}
      onClose={onClose}
      dismissDisabled={pending}
      title={roomType ? `Edit ${roomType.name}` : "Edit room type"}
      description="Updating a room type applies to future rooms using it. Existing rooms keep their saved rates."
    >
      {roomType && (
        <form
          key={roomType.id}
          action={onSubmit}
          className="grid gap-4"
          noValidate
        >
          <input type="hidden" name="roomTypeId" value={roomType.id} />
          <input
            type="hidden"
            name="expectedVersion"
            value={roomType.version}
          />
          {state.status === "error" && (
            <Alert tone="danger" role="alert">
              {state.message}
            </Alert>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="edit-room-type-name"
              label="Room type name"
              required
              className="sm:col-span-2"
              error={
                state.status === "error" ? state.fieldErrors.name : undefined
              }
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  name="name"
                  defaultValue={roomType.name}
                />
              )}
            </Field>
            <Field
              id="edit-room-type-monthly"
              label="Monthly price (₱)"
              required
              error={
                state.status === "error"
                  ? state.fieldErrors.monthlyRate
                  : undefined
              }
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  name="monthlyRate"
                  inputMode="decimal"
                  defaultValue={roomType.monthlyRate}
                />
              )}
            </Field>
            <Field
              id="edit-room-type-daily"
              label="Transient daily rate (₱)"
              error={
                state.status === "error"
                  ? state.fieldErrors.dailyRate
                  : undefined
              }
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  name="dailyRate"
                  inputMode="decimal"
                  defaultValue={roomType.dailyRate ?? ""}
                />
              )}
            </Field>
          </div>
          <Field
            id="edit-room-type-description"
            label="Description"
            error={
              state.status === "error"
                ? state.fieldErrors.description
                : undefined
            }
          >
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                name="description"
                defaultValue={roomType.description ?? ""}
              />
            )}
          </Field>
          <div className="flex flex-wrap justify-end gap-2.5 pt-2">
            <Button variant="secondary" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function CreateRoomForm({
  activeRoomTypes,
  pending,
  state,
  onClose,
  onSubmit,
}: {
  activeRoomTypes: RoomTypeDto[];
  pending: boolean;
  state: InventoryActionResult;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const defaultType = activeRoomTypes[0] ?? null;
  const [selectedTypeId, setSelectedTypeId] = useState(defaultType?.id ?? "");
  const [monthlyRate, setMonthlyRate] = useState(
    defaultType?.monthlyRate ?? "",
  );
  const [dailyRate, setDailyRate] = useState(defaultType?.dailyRate ?? "");

  const selectedType =
    activeRoomTypes.find((rt) => rt.id === selectedTypeId) ?? null;

  function handleRoomTypeChange(nextTypeId: string) {
    setSelectedTypeId(nextTypeId);
    const matched = activeRoomTypes.find((rt) => rt.id === nextTypeId);
    if (matched) {
      setMonthlyRate(matched.monthlyRate);
      setDailyRate(matched.dailyRate ?? "");
    }
  }

  if (activeRoomTypes.length === 0) {
    return (
      <div className="grid gap-4">
        <Alert tone="warning" role="status">
          Create an active room type with its default price before adding a
          room.
        </Alert>
        <div className="flex flex-wrap justify-end gap-2.5 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Link
            href="/rooms/types"
            onClick={onClose}
            className={buttonClasses({ size: "md" })}
          >
            Create room type
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="grid gap-4" noValidate>
      {state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="create-room-number"
          label="Room number"
          required
          error={
            state.status === "error" ? state.fieldErrors.number : undefined
          }
        >
          {(fieldProps) => (
            <Input {...fieldProps} name="number" placeholder="e.g. 101" />
          )}
        </Field>
        <Field
          id="create-room-floor"
          label="Floor"
          error={state.status === "error" ? state.fieldErrors.floor : undefined}
        >
          {(fieldProps) => (
            <Input {...fieldProps} name="floor" placeholder="e.g. Ground" />
          )}
        </Field>
        <Field
          id="create-room-type"
          label="Room type"
          required
          error={
            state.status === "error" ? state.fieldErrors.roomTypeId : undefined
          }
        >
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="roomTypeId"
              value={selectedTypeId}
              onChange={(e) => handleRoomTypeChange(e.target.value)}
            >
              {activeRoomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name} ({formatPhpCurrency(rt.monthlyRate)}/mo)
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          id="create-room-capacity"
          label="Bed capacity"
          required
          error={
            state.status === "error" ? state.fieldErrors.capacity : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              defaultValue="1"
            />
          )}
        </Field>
        <Field
          id="create-room-monthly"
          label="Base monthly rate (₱)"
          required
          description={
            selectedType
              ? `Auto-filled from ${selectedType.name} (${formatPhpCurrency(selectedType.monthlyRate)}/mo).`
              : undefined
          }
          error={
            state.status === "error"
              ? state.fieldErrors.baseMonthlyRate
              : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="baseMonthlyRate"
              inputMode="decimal"
              value={monthlyRate}
              onChange={(e) => setMonthlyRate(e.target.value)}
              placeholder="4500.00"
            />
          )}
        </Field>
        <Field
          id="create-room-daily"
          label="Transient daily rate (₱)"
          error={
            state.status === "error"
              ? state.fieldErrors.transientDailyRate
              : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="transientDailyRate"
              inputMode="decimal"
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
              placeholder="Optional"
            />
          )}
        </Field>
      </div>

      <Field
        id="create-room-notes"
        label="Notes"
        error={state.status === "error" ? state.fieldErrors.notes : undefined}
      >
        {(fieldProps) => (
          <Textarea
            {...fieldProps}
            name="notes"
            placeholder="Optional ventilation, cr, or bunk layout notes"
          />
        )}
      </Field>

      <div className="flex flex-wrap justify-end gap-2.5 pt-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : "Save room"}
        </Button>
      </div>
    </form>
  );
}

export function CreateRoomDialog({
  open,
  activeRoomTypes,
  pending,
  state,
  onClose,
  onSubmit,
}: {
  open: boolean;
  activeRoomTypes: RoomTypeDto[];
  pending: boolean;
  state: InventoryActionResult;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissDisabled={pending}
      title="Add room"
      description="Select a room type to populate its default price automatically."
    >
      {open && (
        <CreateRoomForm
          key={activeRoomTypes.map((rt) => rt.id).join(",")}
          activeRoomTypes={activeRoomTypes}
          pending={pending}
          state={state}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  );
}

function EditRoomForm({
  room,
  roomTypes,
  pending,
  state,
  onClose,
  onSubmit,
}: {
  room: RoomWithBedsDto;
  roomTypes: RoomTypeDto[];
  pending: boolean;
  state: InventoryActionResult;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const selectableTypes = roomTypes.filter(
    (rt) => rt.archivedAt === null || rt.id === room.roomTypeId,
  );
  const [selectedTypeId, setSelectedTypeId] = useState(room.roomTypeId);
  const [monthlyRate, setMonthlyRate] = useState(room.baseMonthlyRate);
  const [dailyRate, setDailyRate] = useState(room.transientDailyRate ?? "");

  function handleRoomTypeChange(nextTypeId: string) {
    setSelectedTypeId(nextTypeId);
    const matched = selectableTypes.find((rt) => rt.id === nextTypeId);
    if (matched) {
      setMonthlyRate(matched.monthlyRate);
      setDailyRate(matched.dailyRate ?? "");
    }
  }

  return (
    <form key={room.id} action={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" name="roomId" value={room.id} />
      <input type="hidden" name="expectedVersion" value={room.version} />
      {state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="edit-room-number"
          label="Room number"
          required
          error={
            state.status === "error" ? state.fieldErrors.number : undefined
          }
        >
          {(fieldProps) => (
            <Input {...fieldProps} name="number" defaultValue={room.number} />
          )}
        </Field>
        <Field id="edit-room-floor" label="Floor">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="floor"
              defaultValue={room.floor ?? ""}
              placeholder="Optional"
            />
          )}
        </Field>
        <Field
          id="edit-room-type"
          label="Room type"
          required
          error={
            state.status === "error" ? state.fieldErrors.roomTypeId : undefined
          }
        >
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="roomTypeId"
              value={selectedTypeId}
              onChange={(e) => handleRoomTypeChange(e.target.value)}
            >
              {selectableTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name} ({formatPhpCurrency(rt.monthlyRate)}/mo)
                  {rt.archivedAt !== null ? " · Archived" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          id="edit-room-capacity"
          label="Bed capacity"
          required
          error={
            state.status === "error" ? state.fieldErrors.capacity : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              defaultValue={String(room.capacity)}
            />
          )}
        </Field>
        <Field
          id="edit-room-monthly"
          label="Base monthly rate (₱)"
          required
          error={
            state.status === "error"
              ? state.fieldErrors.baseMonthlyRate
              : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="baseMonthlyRate"
              inputMode="decimal"
              value={monthlyRate}
              onChange={(e) => setMonthlyRate(e.target.value)}
            />
          )}
        </Field>
        <Field id="edit-room-daily" label="Transient daily rate (₱)">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="transientDailyRate"
              inputMode="decimal"
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field id="edit-room-notes" label="Notes">
        {(fieldProps) => (
          <Textarea
            {...fieldProps}
            name="notes"
            defaultValue={room.notes ?? ""}
          />
        )}
      </Field>
      <div className="flex flex-wrap justify-end gap-2.5 pt-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export function EditRoomDialog({
  room,
  roomTypes,
  pending,
  state,
  onClose,
  onSubmit,
}: {
  room: RoomWithBedsDto | null;
  roomTypes: RoomTypeDto[];
  pending: boolean;
  state: InventoryActionResult;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <Dialog
      open={room !== null}
      onClose={onClose}
      dismissDisabled={pending}
      title={room ? `Edit Room ${room.number}` : "Edit room"}
      description="Update room rates, room type, or capacity. Existing active assignments keep their snapshot rate."
    >
      {room && (
        <EditRoomForm
          room={room}
          roomTypes={roomTypes}
          pending={pending}
          state={state}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  );
}
