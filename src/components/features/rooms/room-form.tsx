"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
    <div className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-control border border-border bg-background px-3 py-2">
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
  justCreated = false,
  building = "BOARDING",
}: {
  mode: "create" | "edit";
  roomTypes: RoomTypeDto[];
  room?: EditableRoom | null;
  justCreated?: boolean;
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
  const [photosUploading, setPhotosUploading] = useState(false);
  const [archivePending, startArchiveTransition] = useTransition();
  const [statusFeedback, setStatusFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(justCreated ? { tone: "success", message: "Room added." } : null);

  const selectedType =
    selectableTypes.find((rt) => rt.id === selectedTypeId) ?? null;

  const isArchived = room ? room.archivedAt !== null : false;

  const [state, submitAction, pending] = useActionState(
    async (
      prev: InventoryActionResult,
      formData: FormData,
    ): Promise<InventoryActionResult> => {
      setStatusFeedback(null);
      if (mode === "edit") {
        const result = await updateRoomAction(prev, formData);
        if (result.status === "saved") {
          setStatusFeedback({ tone: "success", message: result.message });
          router.refresh();
        }
        return result;
      }

      const result = await createRoomAction(prev, formData);
      if (result.status === "saved") {
        router.push(
          result.roomId ? `${basePath}/${result.roomId}?created=1` : basePath,
        );
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
    setStatusFeedback(null);
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
        setStatusFeedback({ tone: "success", message: result.message });
        router.refresh();
      } else if (result.status === "error") {
        setArchiveError(result.message);
      }
    });
  }

  return (
    <div className="grid gap-5">
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
                ? "Rates are configured on room types. Update room details or manage cropped photos for /book."
                : "Choose a room type to apply its configured rates, and upload cropped photos for /book."
              : mode === "edit"
                ? "Rates are configured on room types. Update room details below."
                : "Choose a room type to apply its configured monthly rate."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={basePath}
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Back to rooms
          </Link>
          {mode === "edit" && room && (
            <>
              {isTransient && (
                <Link
                  href={`/transients/listings/${room.id}`}
                  className={buttonClasses({
                    variant: "secondary",
                    size: "md",
                  })}
                >
                  Transient listing
                </Link>
              )}
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
            </>
          )}
        </div>
      </header>

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
          {statusFeedback && (
            <Alert
              tone={statusFeedback.tone}
              role={statusFeedback.tone === "danger" ? "alert" : "status"}
            >
              {statusFeedback.message}
            </Alert>
          )}

          {state.status === "error" && (
            <Alert tone="danger" role="alert">
              {state.message}
            </Alert>
          )}

          <CompactFormScope>
            <form
              key={room ? `${room.id}:${room.version}` : "create-room"}
              action={submitAction}
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
              <input
                type="hidden"
                name="capacity"
                value={String(Math.max(1, room?.capacity ?? 1))}
              />

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
                      className="sm:col-span-2"
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
                  {isTransient ? (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Daily rate</dt>
                      <dd className="font-medium text-foreground tabular-nums">
                        {selectedType?.dailyRate
                          ? formatPhpCurrency(selectedType.dailyRate)
                          : "—"}
                      </dd>
                    </div>
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

                <div className="grid gap-2.5 border-t border-border pt-3">
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
            </form>
          </CompactFormScope>
        </>
      )}
    </div>
  );
}
