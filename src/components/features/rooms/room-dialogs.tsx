"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { InventoryActionResult } from "@/features/rooms/actions";
import type { RoomTypeDto } from "@/features/rooms/schemas";

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
  const formRef = useRef<HTMLFormElement | null>(null);
  const roomTypeKey = roomType ? `${roomType.id}:${roomType.version}` : null;
  const [trackedKey, setTrackedKey] = useState<string | null>(roomTypeKey);
  const [dirty, setDirty] = useState(false);

  if (roomTypeKey !== trackedKey) {
    setTrackedKey(roomTypeKey);
    setDirty(false);
  }

  function syncDirtyState() {
    if (!roomType || !formRef.current) {
      setDirty(false);
      return;
    }
    const data = new FormData(formRef.current);
    const name = String(data.get("name") ?? "");
    const description = String(data.get("description") ?? "");
    const rateChanged =
      roomType.building === "BOARDING"
        ? String(data.get("monthlyRate") ?? "") !== (roomType.monthlyRate ?? "")
        : String(data.get("dailyRate") ?? "") !== (roomType.dailyRate ?? "");
    setDirty(
      name !== roomType.name ||
        description !== (roomType.description ?? "") ||
        rateChanged,
    );
  }

  function handleDiscardChanges() {
    formRef.current?.reset();
    setDirty(false);
  }

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
          ref={formRef}
          key={roomTypeKey}
          action={onSubmit}
          onInput={syncDirtyState}
          onChange={syncDirtyState}
          className="grid gap-4"
          noValidate
        >
          <input type="hidden" name="roomTypeId" value={roomType.id} />
          <input
            type="hidden"
            name="expectedVersion"
            value={roomType.version}
          />
          <input type="hidden" name="building" value={roomType.building} />
          {roomType.building === "BOARDING" ? (
            <input type="hidden" name="dailyRate" value="" />
          ) : (
            <input type="hidden" name="monthlyRate" value="" />
          )}
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
            {roomType.building === "BOARDING" ? (
              <Field
                id="edit-room-type-monthly"
                label="Monthly price (₱)"
                required
                className="sm:col-span-2"
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
                    defaultValue={roomType.monthlyRate ?? ""}
                  />
                )}
              </Field>
            ) : (
              <Field
                id="edit-room-type-daily"
                label="Transient daily rate (₱)"
                required
                className="sm:col-span-2"
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
            )}
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
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={handleDiscardChanges}
              >
                Discard changes
              </Button>
            )}
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
