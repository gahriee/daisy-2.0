"use client";

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
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import {
  SearchFilterBar,
  SearchFilterInput,
} from "@/components/ui/search-filter";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveRoomTypeAction,
  createRoomTypeAction,
  restoreRoomTypeAction,
  updateRoomTypeAction,
  type InventoryActionResult,
} from "@/features/rooms/actions";
import type {
  InventoryOverviewDto,
  RoomTypeDto,
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
}: {
  initialRoomTypes: RoomTypeDto[];
}) {
  const [roomTypes, setRoomTypes] = useState<RoomTypeDto[]>(initialRoomTypes);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<RoomTypeViewFilter>("active");
  const [editingRoomType, setEditingRoomType] = useState<RoomTypeDto | null>(
    null,
  );
  const [formResetKey, setFormResetKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  async function reloadRoomTypes() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/rooms", { cache: "no-store" });
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: "Could not refresh room types right now.",
        });
        return;
      }
      const fresh = (await response.json()) as InventoryOverviewDto;
      setRoomTypes(fresh.roomTypes);
    } catch {
      setFeedback({
        tone: "danger",
        message: "Connect to the internet to refresh room types.",
      });
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
        setFeedback({ tone: "success", message: result.message });
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
        setFeedback({ tone: "success", message: result.message });
        await reloadRoomTypes();
      }
      return result;
    },
    { status: "idle" },
  );

  function handleArchiveRestore(roomType: RoomTypeDto) {
    if (rowPendingId) return;
    setFeedback(null);
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
          setFeedback({ tone: "success", message: result.message });
          await reloadRoomTypes();
        } else if (result.status === "error") {
          setFeedback({ tone: "danger", message: result.message });
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
      rt.monthlyRate,
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
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Room types
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Create reusable room categories with preset monthly and daily rates.
            Selecting a room type automatically fills pricing when adding a
            room.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            className="border-border bg-surface text-foreground hover:bg-surface-muted"
            onClick={() => void reloadRoomTypes()}
          >
            {!refreshing && <RefreshIcon />}
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>
        </div>
      </header>

      {feedback && (
        <Alert
          tone={feedback.tone}
          role={feedback.tone === "danger" ? "alert" : "status"}
        >
          {feedback.message}
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

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
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
                  placeholder="e.g. Single Aircon, Double Fan"
                />
              )}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              <Field
                id="create-room-type-daily"
                label="Transient daily rate (₱)"
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
                    placeholder="Optional"
                  />
                )}
              </Field>
            </div>

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

        <div className="grid min-w-0 gap-4">
          <SearchFilterBar
            title="Saved room types"
            resultCountText={`${filteredRoomTypes.length} ${
              filteredRoomTypes.length === 1 ? "room type" : "room types"
            } shown`}
            hasActiveFilters={hasFilters}
            onClearAll={() => {
              setSearchQuery("");
              setViewFilter("active");
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="grid min-w-0 gap-2 sm:col-span-2">
                <label
                  htmlFor="room-types-search"
                  className="text-sm font-medium leading-5 text-foreground"
                >
                  Search room types
                </label>
                <SearchFilterInput
                  id="room-types-search"
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder="e.g. Aircon, Fan, 4500, private CR"
                />
              </div>

              <Field id="room-types-view" label="View">
                {(fieldProps) => (
                  <Select
                    {...fieldProps}
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
                    : "Try clearing the search query or switching between active and archived room types."}
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
                    Clear filters
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

                      <p className="text-lg font-semibold tracking-tight text-foreground tabular-nums">
                        {formatPhpCurrency(roomType.monthlyRate)}
                        <span className="text-xs font-normal text-muted-foreground">
                          {" "}
                          / mo
                          {roomType.dailyRate
                            ? ` · ${formatPhpCurrency(roomType.dailyRate)} / day`
                            : ""}
                        </span>
                      </p>

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
                          variant={isArchivedType ? "secondary" : "ghost"}
                          loading={isBusy}
                          disabled={rowPendingId !== null && !isBusy}
                          onClick={() => handleArchiveRestore(roomType)}
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
    </div>
  );
}
