"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BackLink, Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import {
  archiveRoomAction,
  createRoomAction,
  restoreRoomAction,
  updateRoomAction,
  type InventoryActionResult,
} from "@/features/rooms/actions";
import type {
  RoomBuildingValue,
  RoomDto,
  RoomTypeDto,
} from "@/features/rooms/schemas";
import { formatPhpCurrency } from "@/lib/money";
import { RoomPhotosEditor } from "./room-photos-editor";

function RoomTypeRateSummary({ roomType }: { roomType: RoomTypeDto | null }) {
  if (!roomType) return null;
  const isTransient = roomType.building === "TRANSIENT";
  return (
    <div className="sm:col-span-2 grid grid-cols-1 gap-0.5 border-t border-border pt-3">
      <div className="grid gap-0.5">
        <span className="text-xs text-muted-foreground">
          {isTransient ? "Default daily rate" : "Default monthly rate"}
        </span>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {formatPhpCurrency(
            isTransient
              ? (roomType.dailyRate ?? "0.00")
              : (roomType.monthlyRate ?? "0.00"),
          )}
        </span>
      </div>
    </div>
  );
}

type EditableRoom = RoomDto & { activeAllocationCount: number };

export function RoomForm({
  mode,
  roomTypes,
  room = null,
  building = "BOARDING",
}: {
  mode: "create" | "edit";
  roomTypes: RoomTypeDto[];
  room?: EditableRoom | null;
  building?: RoomBuildingValue;
}) {
  const router = useRouter();
  const effectiveBuilding = room?.building ?? building;
  const isTransient = effectiveBuilding === "TRANSIENT";
  const basePath = isTransient ? "/transients/rooms" : "/rooms";
  const typesPath = `${basePath}/types`;
  const selectableTypes =
    mode === "edit" && room
      ? roomTypes.filter(
          (rt) => rt.archivedAt === null || rt.id === room.roomTypeId,
        )
      : roomTypes.filter((rt) => rt.archivedAt === null);

  const [selectedTypeId, setSelectedTypeId] = useState(
    room?.roomTypeId ?? selectableTypes[0]?.id ?? "",
  );
  const [syncedRoomVersion, setSyncedRoomVersion] = useState<number | null>(
    room?.version ?? null,
  );
  const [published, setPublished] = useState(
    room?.isTransientPublished ?? false,
  );
  const [capacityInput, setCapacityInput] = useState(
    String(Math.max(1, room?.capacity ?? 1)),
  );
  const [dirty, setDirty] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  if (room && room.version !== syncedRoomVersion) {
    setSyncedRoomVersion(room.version);
    setSelectedTypeId(room.roomTypeId);
    setPublished(room.isTransientPublished);
    setCapacityInput(String(Math.max(1, room.capacity)));
    setDirty(false);
  }
  const parsedCapacity = Number.parseInt(capacityInput, 10);
  const validCapacity =
    Number.isInteger(parsedCapacity) && parsedCapacity >= 1
      ? parsedCapacity
      : null;
  const [photosUploading, setPhotosUploading] = useState(false);
  const [archivePending, startArchiveTransition] = useTransition();

  function handleDiscardChanges() {
    if (!room) return;
    setSelectedTypeId(room.roomTypeId);
    setPublished(room.isTransientPublished);
    setCapacityInput(String(Math.max(1, room.capacity)));
    setDirty(false);
    setResetCount((count) => count + 1);
  }

  const selectedType =
    selectableTypes.find((rt) => rt.id === selectedTypeId) ?? null;

  const isArchived = room ? room.archivedAt !== null : false;

  const [state, submitAction, pending] = useActionState(
    async (
      prev: InventoryActionResult,
      formData: FormData,
    ): Promise<InventoryActionResult> => {
      if (mode === "edit") {
        const result = await updateRoomAction(prev, formData);
        if (result.status === "saved") {
          toast.success(result.message);
          router.refresh();
        }
        return result;
      }

      const result = await createRoomAction(prev, formData);
      if (result.status === "saved") {
        toast.success(result.message);
        router.push(result.roomId ? `${basePath}/${result.roomId}` : basePath);
        router.refresh();
      }
      return result;
    },
    { status: "idle" },
  );

  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function handleArchiveRestore() {
    if (!room || archivePending) return;
    setArchiveError(null);
    startArchiveTransition(async () => {
      const result = isArchived
        ? await restoreRoomAction({
            roomId: room.id,
            expectedVersion: room.version,
          })
        : await archiveRoomAction({
            roomId: room.id,
            expectedVersion: room.version,
          });
      if (result.status === "saved") {
        setArchiveConfirmOpen(false);
        toast.success(result.message);
        router.refresh();
      } else if (result.status === "error") {
        setArchiveError(result.message);
      }
    });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <BackLink href={basePath}>
          {isTransient ? "Transient rooms" : "Rooms"}
        </BackLink>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {mode === "edit" && room ? `Room ${room.number}` : "Add room"}
              </h1>
              {isArchived && <Badge tone="neutral">Archived</Badge>}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {isTransient
                ? mode === "edit"
                  ? "Rates sync from room types. Update room details, public /book visibility, and cropped photos below."
                  : "Choose a room type to apply its daily rate, configure public /book listing options, and upload cropped photos."
                : mode === "edit"
                  ? "Rates are configured on room types. Update room details below."
                  : "Choose a room type to apply its configured monthly rate."}
            </p>
          </div>

          {mode === "edit" && room && (
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                size="md"
                variant={isArchived ? "primary" : "danger"}
                loading={archivePending}
                disabled={!isArchived && room.activeAllocationCount > 0}
                onClick={() => {
                  setArchiveError(null);
                  setArchiveConfirmOpen(true);
                }}
              >
                {isArchived ? "Restore room" : "Archive room"}
              </Button>
              <ConfirmDialog
                open={archiveConfirmOpen}
                onClose={() => {
                  if (!archivePending) {
                    setArchiveError(null);
                    setArchiveConfirmOpen(false);
                  }
                }}
                onConfirm={handleArchiveRestore}
                title={
                  isArchived
                    ? `Restore Room ${room.number}?`
                    : `Archive Room ${room.number}?`
                }
                description={
                  isArchived
                    ? "Restoring makes this room active again for assignments, transient stays, and listings."
                    : "Archiving hides this room from new assignments and transient stays. You can restore it anytime."
                }
                errorMessage={archiveError}
                confirmLabel={isArchived ? "Restore room" : "Archive room"}
                confirmVariant={isArchived ? "primary" : "danger"}
                loading={archivePending}
              />
            </div>
          )}
        </header>
      </div>

      {mode === "create" && selectableTypes.length === 0 ? (
        <Alert tone="warning" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Create an active room type with its default price before adding a
              room.
            </span>
            <Link
              href={typesPath}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Create room type
            </Link>
          </div>
        </Alert>
      ) : (
        <>
          {state.status === "error" && (
            <Alert tone="danger" role="alert">
              {state.message}
            </Alert>
          )}

          <CompactFormScope>
            <form
              key={
                room
                  ? `${room.id}:${room.version}:${resetCount}`
                  : "create-room"
              }
              action={submitAction}
              onInput={() => {
                if (mode === "edit") setDirty(true);
              }}
              onChange={() => {
                if (mode === "edit") setDirty(true);
              }}
              className="grid items-start gap-5 lg:grid-cols-12"
              noValidate
            >
              <input type="hidden" name="building" value={effectiveBuilding} />
              {mode === "edit" && room && (
                <>
                  <input type="hidden" name="roomId" value={room.id} />
                  <input
                    type="hidden"
                    name="expectedVersion"
                    value={room.version}
                  />
                </>
              )}

              <div className="grid gap-5 lg:col-span-8">
                <Card className="grid gap-4">
                  <div className="grid gap-1">
                    <h2 className="text-base font-semibold text-foreground">
                      Room details
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Rates sync from the chosen room type; adjust room type
                      pricing in Room types.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      id="room-number"
                      label="Room number"
                      required
                      error={
                        state.status === "error"
                          ? state.fieldErrors.number
                          : undefined
                      }
                    >
                      {(fieldProps) => (
                        <Input
                          {...fieldProps}
                          name="number"
                          defaultValue={room?.number ?? ""}
                          placeholder="e.g. 101"
                        />
                      )}
                    </Field>

                    <Field
                      id="room-floor"
                      label="Floor"
                      error={
                        state.status === "error"
                          ? state.fieldErrors.floor
                          : undefined
                      }
                    >
                      {(fieldProps) => (
                        <Input
                          {...fieldProps}
                          name="floor"
                          defaultValue={room?.floor ?? ""}
                          placeholder="e.g. Ground"
                        />
                      )}
                    </Field>

                    <Field
                      id="room-type"
                      label="Room type"
                      required
                      error={
                        state.status === "error"
                          ? state.fieldErrors.roomTypeId
                          : undefined
                      }
                    >
                      {(fieldProps) => (
                        <Select
                          {...fieldProps}
                          name="roomTypeId"
                          value={selectedTypeId}
                          onChange={(e) => setSelectedTypeId(e.target.value)}
                        >
                          {selectableTypes.map((rt) => (
                            <option key={rt.id} value={rt.id}>
                              {rt.name}
                              {rt.archivedAt !== null ? " (Archived)" : ""}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>

                    <Field
                      id="room-capacity"
                      label={isTransient ? "Max guests" : "Max occupants"}
                      required
                      description={
                        isTransient
                          ? "Maximum guests allowed for this room on /book."
                          : "Maximum boarders allowed in this room."
                      }
                      error={
                        state.status === "error"
                          ? state.fieldErrors.capacity
                          : undefined
                      }
                    >
                      {(fieldProps) => (
                        <Input
                          {...fieldProps}
                          type="number"
                          inputMode="numeric"
                          name="capacity"
                          min={1}
                          max={50}
                          step={1}
                          value={capacityInput}
                          onChange={(e) => setCapacityInput(e.target.value)}
                          placeholder="e.g. 2"
                        />
                      )}
                    </Field>

                    <RoomTypeRateSummary roomType={selectedType} />
                  </div>

                  <Field
                    id="room-notes"
                    label="Notes"
                    error={
                      state.status === "error"
                        ? state.fieldErrors.notes
                        : undefined
                    }
                  >
                    {(fieldProps) => (
                      <Textarea
                        {...fieldProps}
                        name="notes"
                        defaultValue={room?.notes ?? ""}
                        placeholder="Optional ventilation, private CR, or room inclusions"
                      />
                    )}
                  </Field>
                </Card>

                {isTransient && (
                  <Card className="grid gap-4">
                    {!isArchived && (
                      <input
                        type="hidden"
                        name="hasPublicListingFields"
                        value="1"
                      />
                    )}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="grid gap-1">
                        <h2 className="text-base font-semibold text-foreground">
                          Public /book listing
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Choose whether guests can view and request this room
                          on the unauthenticated /book page. Internal notes stay
                          private.
                        </p>
                      </div>
                      <Badge tone={published ? "success" : "neutral"}>
                        {published ? "Published" : "Hidden"}
                      </Badge>
                    </div>

                    <Checkbox
                      name="isTransientPublished"
                      checked={published}
                      disabled={isArchived || pending}
                      onChange={(e) => setPublished(e.target.checked)}
                      label="Publish this room on /book for public transient requests"
                    />
                    {state.status === "error" &&
                      state.fieldErrors.isTransientPublished && (
                        <p className="text-xs text-danger">
                          {state.fieldErrors.isTransientPublished}
                        </p>
                      )}

                    <Field
                      id="room-transient-title"
                      label="Public title"
                      description={`Optional display name shown on /book. Defaults to Room ${room?.number ?? "number"} when left blank.`}
                      error={
                        state.status === "error"
                          ? state.fieldErrors.transientTitle
                          : undefined
                      }
                    >
                      {(fieldProps) => (
                        <Input
                          {...fieldProps}
                          name="transientTitle"
                          defaultValue={room?.transientTitle ?? ""}
                          maxLength={120}
                          disabled={isArchived || pending}
                          placeholder={
                            room ? `Room ${room.number}` : "e.g. Room 201"
                          }
                        />
                      )}
                    </Field>

                    <Field
                      id="room-transient-description"
                      label="Public summary"
                      description="Guest-facing highlights shown on /book (bed setup, inclusions, view)."
                      error={
                        state.status === "error"
                          ? state.fieldErrors.transientDescription
                          : undefined
                      }
                    >
                      {(fieldProps) => (
                        <Textarea
                          {...fieldProps}
                          name="transientDescription"
                          defaultValue={room?.transientDescription ?? ""}
                          maxLength={600}
                          disabled={isArchived || pending}
                          placeholder="Optional guest-facing overview for /book"
                        />
                      )}
                    </Field>
                  </Card>
                )}

                {isTransient && (
                  <Card className="grid gap-4">
                    <div className="grid gap-1">
                      <h2 className="text-base font-semibold text-foreground">
                        Room photos
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Add one preview card image and optional captioned
                        gallery shots cropped to match the public /book page.
                      </p>
                    </div>

                    <RoomPhotosEditor
                      {...(room
                        ? {
                            roomId: room.id,
                            initialPreviewPhoto: room.previewPhoto,
                            initialGalleryPhotos: room.galleryPhotos,
                          }
                        : {})}
                      disabled={pending}
                      onUploadingChange={setPhotosUploading}
                    />
                  </Card>
                )}
              </div>

              <Card className="grid gap-4 lg:sticky lg:top-6 lg:col-span-4">
                <h2 className="text-base font-semibold text-foreground">
                  Summary
                </h2>

                <dl className="grid gap-2.5 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted-foreground">Room type</dt>
                    <dd className="text-right font-medium text-foreground">
                      {selectedType?.name ?? "None selected"}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {isTransient ? "Max guests" : "Max occupants"}
                    </dt>
                    <dd className="text-right font-medium text-foreground tabular-nums">
                      {validCapacity !== null
                        ? `${validCapacity} ${
                            isTransient
                              ? validCapacity === 1
                                ? "guest"
                                : "guests"
                              : validCapacity === 1
                                ? "occupant"
                                : "occupants"
                          }`
                        : "—"}
                    </dd>
                  </div>
                  {isTransient ? (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Daily rate</dt>
                        <dd className="font-medium text-foreground tabular-nums">
                          {selectedType?.dailyRate
                            ? formatPhpCurrency(selectedType.dailyRate)
                            : "—"}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Public /book</dt>
                        <dd className="text-right font-medium text-foreground">
                          <Badge tone={published ? "success" : "neutral"}>
                            {published ? "Published" : "Hidden"}
                          </Badge>
                        </dd>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Monthly rate</dt>
                      <dd className="font-medium text-foreground tabular-nums">
                        {selectedType?.monthlyRate
                          ? formatPhpCurrency(selectedType.monthlyRate)
                          : "—"}
                      </dd>
                    </div>
                  )}
                  {room && (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">
                        Active allocations
                      </dt>
                      <dd className="font-medium text-foreground tabular-nums">
                        {room.activeAllocationCount}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="hidden gap-2.5 border-t border-border pt-3 lg:grid">
                  <Button
                    type="submit"
                    size="md"
                    loading={pending}
                    disabled={photosUploading}
                  >
                    {pending
                      ? "Saving…"
                      : photosUploading
                        ? "Uploading photos…"
                        : mode === "edit"
                          ? "Save changes"
                          : "Save room"}
                  </Button>
                  {mode === "edit" && dirty && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      disabled={pending || photosUploading}
                      onClick={handleDiscardChanges}
                    >
                      Discard changes
                    </Button>
                  )}
                  <Link
                    href={basePath}
                    className={buttonClasses({
                      variant: "secondary",
                      size: "md",
                    })}
                  >
                    Cancel
                  </Link>
                </div>
              </Card>

              <div className="sticky bottom-0 z-10 -mx-4 grid gap-2 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_20px_-14px_rgb(34_34_34/0.16)] sm:-mx-6 sm:px-6 lg:hidden">
                <Button
                  type="submit"
                  size="md"
                  loading={pending}
                  disabled={photosUploading}
                  className="w-full"
                >
                  {pending
                    ? "Saving…"
                    : photosUploading
                      ? "Uploading photos…"
                      : mode === "edit"
                        ? "Save changes"
                        : "Save room"}
                </Button>
                {mode === "edit" && dirty && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    disabled={pending || photosUploading}
                    onClick={handleDiscardChanges}
                    className="w-full"
                  >
                    Discard changes
                  </Button>
                )}
                <Link
                  href={basePath}
                  className={buttonClasses({
                    variant: "secondary",
                    size: "md",
                    className: "w-full",
                  })}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </CompactFormScope>
        </>
      )}
    </div>
  );
}
