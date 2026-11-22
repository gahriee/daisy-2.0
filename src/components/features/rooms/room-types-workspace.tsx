"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useActionState, useState, useTransition } from "react";
import Image from "next/image";
import { EditRoomTypeDialog } from "@/components/features/rooms/room-dialogs";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import {
  SearchFilterBar,
  SearchFilterInput,
} from "@/components/ui/search-filter";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import {
  archiveRoomTypeAction,
  createRoomTypeAction,
  restoreRoomTypeAction,
  updateRoomTypeAction,
  type InventoryActionResult,
} from "@/features/rooms/actions";
import {
  ROOM_BUILDING_LABELS,
  type InventoryOverviewDto,
  type RoomBuildingValue,
  type RoomTypeDto,
} from "@/features/rooms/schemas";
import { formatPhpCurrency } from "@/lib/money";

type RoomTypeViewFilter = "active" | "archived" | "all";

function RefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16.25 10a6.25 6.25 0 1 1-1.6-4.18" />
      <path d="M16.5 3.5v3.25h-3.25" />
    </svg>
  );
}

/**
 * Dedicated workspace for creating, pricing, updating, archiving, and
 * restoring reusable room types used across room creation.
 */
export function RoomTypesWorkspace({
  initialRoomTypes,
  building = "BOARDING",
}: {
  initialRoomTypes: RoomTypeDto[];
  building?: RoomBuildingValue;
}) {
  const isTransient = building === "TRANSIENT";
  const [roomTypes, setRoomTypes] = useState<RoomTypeDto[]>(initialRoomTypes);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<RoomTypeViewFilter>("active");
  const [editingRoomType, setEditingRoomType] = useState<RoomTypeDto | null>(
    null,
  );
  const [formResetKey, setFormResetKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function reloadRoomTypes() {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/rooms?building=${building}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setErrorMessage("Could not refresh room types right now.");
        return;
      }
      const fresh = (await response.json()) as InventoryOverviewDto;
      setRoomTypes(fresh.roomTypes);
    } catch {
      setErrorMessage("Connect to the internet to refresh room types.");
    } finally {
      setRefreshing(false);
    }
  }

  const [createState, submitCreateRoomType, createPending] = useActionState(
    async (
      prev: InventoryActionResult,
      formData: FormData,
    ): Promise<InventoryActionResult> => {
      const result = await createRoomTypeAction(prev, formData);
      if (result.status === "saved") {
        setFormResetKey((prevKey) => prevKey + 1);
        toast.success(result.message);
        await reloadRoomTypes();
      }
      return result;
    },
    { status: "idle" },
  );

  const [updateState, submitUpdateRoomType, updatePending] = useActionState(
    async (
      prev: InventoryActionResult,
      formData: FormData,
    ): Promise<InventoryActionResult> => {
      const result = await updateRoomTypeAction(prev, formData);
      if (result.status === "saved") {
        setEditingRoomType(null);
        toast.success(result.message);
        await reloadRoomTypes();
      }
      return result;
    },
    { status: "idle" },
  );

  const [confirmingRoomType, setConfirmingRoomType] =
    useState<RoomTypeDto | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function handleArchiveRestore(roomType: RoomTypeDto) {
    if (rowPendingId) return;
    setErrorMessage(null);
    setConfirmError(null);
    setRowPendingId(roomType.id);
    startTransition(async () => {
      try {
        const result =
          roomType.archivedAt === null
            ? await archiveRoomTypeAction({
                roomTypeId: roomType.id,
                expectedVersion: roomType.version,
              })
            : await restoreRoomTypeAction({
                roomTypeId: roomType.id,
                expectedVersion: roomType.version,
              });

        if (result.status === "saved") {
          setConfirmingRoomType(null);
          toast.success(result.message);
          await reloadRoomTypes();
        } else if (result.status === "error") {
          setConfirmError(result.message);
        }
      } finally {
        setRowPendingId(null);
      }
    });
  }

  const activeRoomTypes = roomTypes.filter((rt) => rt.archivedAt === null);
  const archivedRoomTypes = roomTypes.filter((rt) => rt.archivedAt !== null);
  const totalLinkedRooms = activeRoomTypes.reduce(
    (sum, rt) => sum + rt.activeRoomCount,
    0,
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredRoomTypes = roomTypes.filter((rt) => {
    if (viewFilter === "active" && rt.archivedAt !== null) return false;
    if (viewFilter === "archived" && rt.archivedAt === null) return false;
    if (!normalizedQuery) return true;

    const haystack = [
      rt.name,
      rt.monthlyRate ?? "",
      rt.dailyRate ?? "",
      rt.description ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const hasFilters = normalizedQuery !== "" || viewFilter !== "active";

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {isTransient ? "Transient room types" : "Boarding room types"}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Create reusable {ROOM_BUILDING_LABELS[building].toLowerCase()} room
            categories with preset{" "}
            {isTransient ? "daily rates" : "monthly prices"}. Selecting a room
            type automatically fills pricing when adding a room.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            onClick={() => void reloadRoomTypes()}
          >
            {!refreshing && <RefreshIcon />}
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>
        </div>
      </header>

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      <section
        aria-label="Room type summary"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-3"
      >
        <MetricCard
          label="Active room types"
          value={activeRoomTypes.length}
          description={
            activeRoomTypes.length === 0
              ? "Add a room type before creating rooms"
              : "Available for selection when adding rooms"
          }
          icon={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3.5 9.5 9.5 3.5h5.75a1.25 1.25 0 0 1 1.25 1.25V10.5l-6 6-7-7Z" />
              <circle cx="13" cy="7" r="1" />
            </svg>
          }
        />
        <MetricCard
          label="Rooms linked"
          value={totalLinkedRooms}
          tone="info"
          description={
            totalLinkedRooms === 0
              ? "No rooms assigned to a type yet"
              : "Active rooms assigned a room type"
          }
          icon={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4.5 16.5V4.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v12" />
              <path d="M13.5 7.5h2a1 1 0 0 1 1 1v8" />
              <path d="M2.5 16.5h15" />
            </svg>
          }
        />
        <MetricCard
          label="Archived types"
          value={archivedRoomTypes.length}
          tone={archivedRoomTypes.length > 0 ? "warning" : "neutral"}
          description={
            archivedRoomTypes.length === 0
              ? "All room types are currently active"
              : "Hidden from new room selection"
          }
          icon={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="14" height="3.5" rx="1" />
              <path d="M4.5 7.5v8A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5v-8" />
              <path d="M8.25 11.25h3.5" />
            </svg>
          }
        />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <CompactFormScope>
          <Card className="grid gap-4 p-5 sm:p-6">
            <div className="grid gap-1">
              <h2 className="text-base font-semibold text-foreground">
                Create room type
              </h2>
              <p className="text-xs leading-5 text-muted-foreground">
                Set the category name and preset rate in Philippine pesos.
              </p>
            </div>

            <form
              key={formResetKey}
              action={submitCreateRoomType}
              className="grid gap-4"
              noValidate
            >
              <input type="hidden" name="building" value={building} />
              {isTransient ? (
                <input type="hidden" name="monthlyRate" value="" />
              ) : (
                <input type="hidden" name="dailyRate" value="" />
              )}
              {createState.status === "error" && (
                <Alert tone="danger" role="alert">
                  {createState.message}
                </Alert>
              )}

              <Field
                id="create-room-type-name"
                label="Room type name"
                required
                error={
                  createState.status === "error"
                    ? createState.fieldErrors.name
                    : undefined
                }
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    name="name"
                    placeholder={
                      isTransient
                        ? "e.g. Private Transient Suite, Barkada Loft"
                        : "e.g. Single Aircon, Double Fan"
                    }
                  />
                )}
              </Field>

              {isTransient ? (
                <Field
                  id="create-room-type-daily"
                  label="Daily rate (₱)"
                  required
                  error={
                    createState.status === "error"
                      ? createState.fieldErrors.dailyRate
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      name="dailyRate"
                      inputMode="decimal"
                      placeholder="650.00"
                    />
                  )}
                </Field>
              ) : (
                <Field
                  id="create-room-type-monthly"
                  label="Monthly price (₱)"
                  required
                  error={
                    createState.status === "error"
                      ? createState.fieldErrors.monthlyRate
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      name="monthlyRate"
                      inputMode="decimal"
                      placeholder="4500.00"
                    />
                  )}
                </Field>
              )}

              <Field
                id="create-room-type-description"
                label="Description"
                error={
                  createState.status === "error"
                    ? createState.fieldErrors.description
                    : undefined
                }
              >
                {(fieldProps) => (
                  <Textarea
                    {...fieldProps}
                    name="description"
                    placeholder="Optional inclusions, amenities, or room setup notes"
                  />
                )}
              </Field>

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                <Button
                  type="submit"
                  loading={createPending}
                  className="w-full sm:w-auto"
                >
                  {createPending ? "Saving…" : "Save room type"}
                </Button>
              </div>
            </form>
          </Card>
        </CompactFormScope>

        <div className="grid min-w-0 gap-4">
          <SearchFilterBar
            aria-label="Find room types"
            hasActiveFilters={hasFilters}
            onClearAll={() => {
              setSearchQuery("");
              setViewFilter("active");
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field
                id="room-types-search"
                label="Find a room type"
                className="sm:col-span-2"
              >
                {({ id }) => (
                  <SearchFilterInput
                    id={id}
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    placeholder="e.g. Aircon, Fan, 4500, private CR"
                  />
                )}
              </Field>

              <Field id="room-types-view" label="View">
                {(fieldProps) => (
                  <Select
                    {...fieldProps}
                    variant="filter"
                    value={viewFilter}
                    onChange={(e) =>
                      setViewFilter(e.target.value as RoomTypeViewFilter)
                    }
                  >
                    <option value="active">Active types</option>
                    <option value="archived">Archived types</option>
                    <option value="all">All types</option>
                  </Select>
                )}
              </Field>
            </div>
          </SearchFilterBar>

          {filteredRoomTypes.length === 0 ? (
            <EmptyState>
              <Image
                src={
                  roomTypes.length === 0
                    ? "/illustrations/sweet-home.svg"
                    : "/illustrations/document-search.svg"
                }
                alt=""
                width={176}
                height={128}
                className="h-28 w-auto"
              />
              <div className="grid gap-1.5">
                <EmptyStateTitle>
                  {roomTypes.length === 0
                    ? "No room types created yet"
                    : "No matching room types"}
                </EmptyStateTitle>
                <EmptyStateDescription>
                  {roomTypes.length === 0
                    ? "Use the form alongside to define your first room category and preset monthly rate."
                    : "Try clearing what you entered or switching between active and archived room types."}
                </EmptyStateDescription>
              </div>
              {hasFilters && (
                <EmptyStateActions>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearchQuery("");
                      setViewFilter("active");
                    }}
                  >
                    Clear
                  </Button>
                </EmptyStateActions>
              )}
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {filteredRoomTypes.map((roomType) => {
                const isArchivedType = roomType.archivedAt !== null;
                const isBusy = rowPendingId === roomType.id;

                return (
                  <Card
                    key={roomType.id}
                    className="flex flex-col justify-between gap-4 p-4 sm:p-5"
                  >
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-semibold text-foreground">
                          {roomType.name}
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <Badge tone="neutral" className="tabular-nums">
                            {roomType.activeRoomCount}{" "}
                            {roomType.activeRoomCount === 1 ? "room" : "rooms"}
                          </Badge>
                          {isArchivedType && (
                            <Badge tone="neutral">Archived</Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-0.5 tabular-nums">
                        {isTransient ? (
                          <p className="text-lg font-semibold tracking-tight text-foreground">
                            {formatPhpCurrency(roomType.dailyRate ?? "0.00")}{" "}
                            <span className="text-xs font-normal text-muted-foreground">
                              / day
                            </span>
                          </p>
                        ) : (
                          <p className="text-lg font-semibold tracking-tight text-foreground">
                            {formatPhpCurrency(roomType.monthlyRate ?? "0.00")}{" "}
                            <span className="text-xs font-normal text-muted-foreground">
                              / mo
                            </span>
                          </p>
                        )}
                      </div>

                      {roomType.description && (
                        <p className="text-xs leading-5 text-muted-foreground">
                          {roomType.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {!isArchivedType && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingRoomType(roomType)}
                          >
                            Edit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          className={
                            !isArchivedType ? "text-danger" : undefined
                          }
                          loading={isBusy}
                          disabled={rowPendingId !== null && !isBusy}
                          onClick={() => {
                            setConfirmError(null);
                            setConfirmingRoomType(roomType);
                          }}
                        >
                          {isArchivedType ? "Restore" : "Archive"}
                        </Button>
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        v{roomType.version}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <EditRoomTypeDialog
        roomType={editingRoomType}
        pending={updatePending}
        state={updateState}
        onClose={() => setEditingRoomType(null)}
        onSubmit={submitUpdateRoomType}
      />
      <ConfirmDialog
        open={confirmingRoomType !== null}
        onClose={() => {
          if (rowPendingId) return;
          setConfirmError(null);
          setConfirmingRoomType(null);
        }}
        onConfirm={() => {
          if (confirmingRoomType) handleArchiveRestore(confirmingRoomType);
        }}
        title={
          confirmingRoomType
            ? confirmingRoomType.archivedAt === null
              ? `Archive room type "${confirmingRoomType.name}"?`
              : `Restore room type "${confirmingRoomType.name}"?`
            : "Update room type?"
        }
        description={
          confirmingRoomType?.archivedAt === null
            ? "Archiving hides this room type when creating new rooms. Existing rooms keep their current pricing."
            : "Restoring makes this room type available again for new and updated rooms."
        }
        errorMessage={confirmError}
        confirmLabel={
          confirmingRoomType?.archivedAt === null ? "Archive" : "Restore"
        }
        confirmVariant={
          confirmingRoomType?.archivedAt === null ? "danger" : "primary"
        }
        loading={
          confirmingRoomType !== null && rowPendingId === confirmingRoomType.id
        }
      />
    </div>
  );
}
