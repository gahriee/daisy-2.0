"use client";

import { useActionState, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Dialog } from "@/components/ui/dialog";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  SearchFilterBar,
  SearchFilterInput,
} from "@/components/ui/search-filter";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreateRoomDialog,
  EditRoomDialog,
} from "@/components/features/rooms/room-dialogs";
import {
  archiveBedAction,
  archiveRoomAction,
  createBedAction,
  createRoomAction,
  restoreBedAction,
  restoreRoomAction,
  updateBedAction,
  updateRoomAction,
  type InventoryActionResult,
} from "@/features/rooms/actions";
import {
  BED_STATUS_LABELS,
  EDITABLE_BED_STATUSES,
  type BedDto,
  type BedStatusValue,
  type InventoryOverviewDto,
  type RoomWithBedsDto,
} from "@/features/rooms/schemas";
import { formatPhpCurrency } from "@/lib/money";

const BED_BADGE_TONE: Record<
  BedStatusValue,
  "success" | "info" | "warning" | "neutral"
> = {
  AVAILABLE: "success",
  OCCUPIED: "info",
  MAINTENANCE: "warning",
  ARCHIVED: "neutral",
};

type InventoryViewFilter = "active" | "available" | "archived" | "all";

type ActiveModalState =
  | { kind: "none" }
  | { kind: "create-room" }
  | { kind: "edit-room"; room: RoomWithBedsDto }
  | { kind: "create-bed"; room: RoomWithBedsDto }
  | { kind: "edit-bed"; room: RoomWithBedsDto; bed: BedDto };

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

export function RoomsWorkspace({
  initialOverview,
}: {
  initialOverview: InventoryOverviewDto;
}) {
  const [overview, setOverview] =
    useState<InventoryOverviewDto>(initialOverview);
  const [searchQuery, setSearchQuery] = useState("");
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>("ALL");
  const [viewFilter, setViewFilter] = useState<InventoryViewFilter>("active");
  const [modal, setModal] = useState<ActiveModalState>({ kind: "none" });
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function reloadInventory() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/rooms", { cache: "no-store" });
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: "Could not refresh room inventory right now.",
        });
        return;
      }
      const fresh = (await response.json()) as InventoryOverviewDto;
      setOverview(fresh);
    } catch {
      setFeedback({
        tone: "danger",
        message: "Connect to the internet to refresh room inventory.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  const [createRoomState, submitCreateRoom, createRoomPending] = useActionState(
    async (
      prev: InventoryActionResult,
      formData: FormData,
    ): Promise<InventoryActionResult> => {
      const result = await createRoomAction(prev, formData);
      if (result.status === "saved") {
        setModal({ kind: "none" });
        setFeedback({ tone: "success", message: result.message });
        await reloadInventory();
      }
      return result;
    },
    { status: "idle" },
  );

  const [updateRoomState, submitUpdateRoom, updateRoomPending] = useActionState(
    async (
      prev: InventoryActionResult,
      formData: FormData,
    ): Promise<InventoryActionResult> => {
      const result = await updateRoomAction(prev, formData);
      if (result.status === "saved") {
        setModal({ kind: "none" });
        setFeedback({ tone: "success", message: result.message });
        await reloadInventory();
      }
      return result;
    },
    { status: "idle" },
  );

  const [createBedState, submitCreateBed, createBedPending] = useActionState(
    async (
      prev: InventoryActionResult,
      formData: FormData,
    ): Promise<InventoryActionResult> => {
      const result = await createBedAction(prev, formData);
      if (result.status === "saved") {
        setModal({ kind: "none" });
        setFeedback({ tone: "success", message: result.message });
        await reloadInventory();
      }
      return result;
    },
    { status: "idle" },
  );

  const [updateBedState, submitUpdateBed, updateBedPending] = useActionState(
    async (
      prev: InventoryActionResult,
      formData: FormData,
    ): Promise<InventoryActionResult> => {
      const result = await updateBedAction(prev, formData);
      if (result.status === "saved") {
        setModal({ kind: "none" });
        setFeedback({ tone: "success", message: result.message });
        await reloadInventory();
      }
      return result;
    },
    { status: "idle" },
  );

  function handleArchiveRestoreRoom(room: RoomWithBedsDto) {
    if (rowPendingId) return;
    setFeedback(null);
    setRowPendingId(room.id);
    startTransition(async () => {
      try {
        const res =
          room.archivedAt === null
            ? await archiveRoomAction({
                roomId: room.id,
                expectedVersion: room.version,
              })
            : await restoreRoomAction({
                roomId: room.id,
                expectedVersion: room.version,
              });
        if (res.status === "saved") {
          setFeedback({ tone: "success", message: res.message });
          await reloadInventory();
        } else if (res.status === "error") {
          setFeedback({ tone: "danger", message: res.message });
        }
      } finally {
        setRowPendingId(null);
      }
    });
  }

  function handleArchiveRestoreBed(bed: BedDto) {
    if (rowPendingId) return;
    setFeedback(null);
    setRowPendingId(bed.id);
    startTransition(async () => {
      try {
        const res =
          bed.archivedAt === null
            ? await archiveBedAction({
                bedId: bed.id,
                expectedVersion: bed.version,
              })
            : await restoreBedAction({
                bedId: bed.id,
                expectedVersion: bed.version,
              });
        if (res.status === "saved") {
          setFeedback({ tone: "success", message: res.message });
          await reloadInventory();
        } else if (res.status === "error") {
          setFeedback({ tone: "danger", message: res.message });
        }
      } finally {
        setRowPendingId(null);
      }
    });
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredRooms = overview.rooms.filter((room) => {
    const isArchived = room.archivedAt !== null;
    if (viewFilter === "active" && isArchived) return false;
    if (viewFilter === "archived" && !isArchived) return false;
    if (viewFilter === "available") {
      if (isArchived) return false;
      const hasAvailable = room.beds.some(
        (bed) => bed.archivedAt === null && bed.status === "AVAILABLE",
      );
      if (!hasAvailable) return false;
    }

    if (roomTypeFilter !== "ALL" && room.roomTypeId !== roomTypeFilter)
      return false;

    if (!normalizedQuery) return true;
    const roomHaystack = [
      room.number,
      room.floor ?? "",
      room.roomTypeName,
      room.notes ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (roomHaystack.includes(normalizedQuery)) return true;

    return room.beds.some((bed) =>
      [
        bed.number,
        bed.label ?? "",
        bed.currentStaySummary ?? "",
        BED_STATUS_LABELS[bed.status],
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  });

  const hasFilters =
    normalizedQuery !== "" ||
    roomTypeFilter !== "ALL" ||
    viewFilter !== "active";

  const summary = overview.summary;
  const activeRoomTypes = overview.roomTypes.filter(
    (rt) => rt.archivedAt === null,
  );

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Rooms &amp; beds
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage boarding rooms, bed capacity, and live bed availability
            protected by database allocation rules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            className="border-border bg-surface text-foreground hover:bg-surface-muted"
            onClick={() => void reloadInventory()}
          >
            {!refreshing && <RefreshIcon />}
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>
          <Button size="md" onClick={() => setModal({ kind: "create-room" })}>
            Add room
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
        aria-label="Inventory summary"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="Active rooms"
          value={summary.activeRooms}
          description={
            summary.totalRooms > summary.activeRooms
              ? `${summary.totalRooms - summary.activeRooms} archived of ${summary.totalRooms} total`
              : `${summary.totalRooms} total rooms in inventory`
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
              <path d="M10.5 10h.01" />
            </svg>
          }
        />
        <MetricCard
          label="Active beds"
          value={summary.totalActiveBeds}
          description={
            summary.activeRooms === 0
              ? "Total beds across active rooms"
              : `Across ${summary.activeRooms} active ${summary.activeRooms === 1 ? "room" : "rooms"}`
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
              <path d="M3 15.5v-8" />
              <path d="M3 12.5h14v3" />
              <path d="M17 12.5v-2a2 2 0 0 0-2-2H8.5v4" />
              <circle cx="5.75" cy="9.5" r="1.25" />
            </svg>
          }
        />
        <MetricCard
          label="Available now"
          value={summary.availableBeds}
          tone="success"
          description={
            summary.availableBeds === 0
              ? "No vacant beds ready right now"
              : "Vacant beds ready for move-in"
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
              <circle cx="10" cy="10" r="6.75" />
              <path d="m7.25 10.25 1.85 1.85 3.65-3.85" />
            </svg>
          }
        />
        <MetricCard
          label="Occupied / Maintenance"
          value={summary.occupiedBeds}
          tone={summary.maintenanceBeds > 0 ? "warning" : "neutral"}
          description={
            summary.maintenanceBeds > 0
              ? `${summary.maintenanceBeds} in maintenance right now`
              : "Currently assigned, 0 in maintenance"
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
              <path d="M12.2 4.3a3.5 3.5 0 0 0-4.4 4.4l-3.9 3.9a1.25 1.25 0 0 0 1.77 1.77l3.9-3.9a3.5 3.5 0 0 0 4.4-4.4l-1.9 1.9-1.77-1.77 1.9-1.9Z" />
            </svg>
          }
        />
      </section>

      <SearchFilterBar
        title="Filter rooms & beds"
        resultCountText={`${filteredRooms.length} ${
          filteredRooms.length === 1 ? "room" : "rooms"
        } shown`}
        hasActiveFilters={hasFilters}
        onClearAll={() => {
          setSearchQuery("");
          setRoomTypeFilter("ALL");
          setViewFilter("active");
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="grid min-w-0 gap-2 md:col-span-2">
            <label
              htmlFor="inventory-search"
              className="text-sm font-medium leading-5 text-foreground"
            >
              Search rooms or beds
            </label>
            <SearchFilterInput
              id="inventory-search"
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="e.g. 101, Upper bunk, Single, occupied"
            />
          </div>

          <Field id="inventory-room-type" label="Room type">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                value={roomTypeFilter}
                onChange={(e) => setRoomTypeFilter(e.target.value)}
              >
                <option value="ALL">All types</option>
                {overview.roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                    {rt.archivedAt !== null ? " (Archived)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="inventory-view-filter" label="Inventory view">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                value={viewFilter}
                onChange={(e) =>
                  setViewFilter(e.target.value as InventoryViewFilter)
                }
              >
                <option value="active">Active rooms</option>
                <option value="available">With available beds</option>
                <option value="archived">Archived rooms</option>
                <option value="all">All rooms</option>
              </Select>
            )}
          </Field>
        </div>
      </SearchFilterBar>

      {filteredRooms.length === 0 ? (
        <EmptyState>
          <Image
            src={
              overview.rooms.length === 0
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
              {overview.rooms.length === 0
                ? "No rooms configured yet"
                : "No matching rooms or beds"}
            </EmptyStateTitle>
            <EmptyStateDescription>
              {overview.rooms.length === 0
                ? "Add your first room and beds to start tracking availability, monthly rates, and tenant assignments."
                : "Try clearing a filter or searching by a different room number, bed label, or status."}
            </EmptyStateDescription>
          </div>
          <EmptyStateActions>
            {overview.rooms.length === 0 ? (
              activeRoomTypes.length === 0 ? (
                <Link
                  href="/rooms/types"
                  className={buttonClasses({ size: "md" })}
                >
                  Create room type
                </Link>
              ) : (
                <Button onClick={() => setModal({ kind: "create-room" })}>
                  Add room
                </Button>
              )
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchQuery("");
                  setRoomTypeFilter("ALL");
                  setViewFilter("active");
                }}
              >
                Clear filters
              </Button>
            )}
          </EmptyStateActions>
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {filteredRooms.map((room) => {
            const activeBedCount = room.beds.filter(
              (bed) => bed.archivedAt === null,
            ).length;
            const visibleBeds =
              viewFilter === "active" || viewFilter === "available"
                ? room.beds.filter((bed) => bed.archivedAt === null)
                : room.beds;
            const isArchivedRoom = room.archivedAt !== null;
            const isRowBusy = rowPendingId === room.id;

            return (
              <Card key={room.id} className="overflow-hidden p-0 sm:p-0">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-background/45 px-4 py-3.5 sm:px-6 sm:py-4">
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground tabular-nums">
                        Room {room.number}
                      </h2>
                      <Badge tone={isArchivedRoom ? "neutral" : "info"}>
                        {room.roomTypeName}
                      </Badge>
                      {room.floor && (
                        <span className="text-xs text-muted-foreground">
                          Floor {room.floor}
                        </span>
                      )}
                      {isArchivedRoom && <Badge tone="neutral">Archived</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {activeBedCount} / {room.capacity}{" "}
                      {room.capacity === 1 ? "bed" : "beds"} active · Base{" "}
                      {formatPhpCurrency(room.baseMonthlyRate)}/mo
                      {room.transientDailyRate
                        ? ` · Daily ${formatPhpCurrency(room.transientDailyRate)}`
                        : ""}
                    </p>
                    {room.notes && (
                      <p className="text-xs text-muted-foreground">
                        {room.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!isArchivedRoom && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={activeBedCount >= room.capacity}
                          onClick={() => setModal({ kind: "create-bed", room })}
                        >
                          Add bed
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setModal({ kind: "edit-room", room })}
                        >
                          Edit room
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant={isArchivedRoom ? "secondary" : "ghost"}
                      loading={isRowBusy}
                      disabled={
                        !isArchivedRoom && room.activeAllocationCount > 0
                      }
                      onClick={() => handleArchiveRestoreRoom(room)}
                    >
                      {isArchivedRoom ? "Restore room" : "Archive"}
                    </Button>
                  </div>
                </div>

                {!isArchivedRoom && room.activeAllocationCount > 0 && (
                  <div className="border-b border-border bg-info-surface/40 px-4 py-2 text-xs text-info sm:px-6">
                    Archival is blocked while {room.activeAllocationCount}{" "}
                    active or upcoming{" "}
                    {room.activeAllocationCount === 1
                      ? "allocation"
                      : "allocations"}{" "}
                    remain on this room.
                  </div>
                )}

                {visibleBeds.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-muted-foreground sm:px-6">
                    <span>
                      {room.beds.length === 0
                        ? "No beds added to this room yet."
                        : "All beds in this room are archived."}
                    </span>
                    {!isArchivedRoom && activeBedCount < room.capacity && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setModal({ kind: "create-bed", room })}
                      >
                        Add first bed
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Mobile bed list (360 px safe) */}
                    <div className="grid divide-y divide-border md:hidden">
                      {visibleBeds.map((bed) => {
                        const isBedArchived = bed.archivedAt !== null;
                        const bedBusy = rowPendingId === bed.id;
                        return (
                          <div key={bed.id} className="grid gap-2.5 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="grid gap-0.5">
                                <span className="text-sm font-semibold text-foreground tabular-nums">
                                  Bed {bed.number}
                                  {bed.label ? ` · ${bed.label}` : ""}
                                </span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {formatPhpCurrency(bed.monthlyRate)}/mo
                                  {bed.dailyRate
                                    ? ` · ${formatPhpCurrency(bed.dailyRate)}/day`
                                    : ""}
                                </span>
                              </div>
                              <Badge tone={BED_BADGE_TONE[bed.status]}>
                                {BED_STATUS_LABELS[bed.status]}
                              </Badge>
                            </div>

                            {bed.currentStaySummary && (
                              <p className="text-xs text-muted-foreground">
                                {bed.currentStaySummary}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {!isBedArchived && !isArchivedRoom && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    setModal({ kind: "edit-bed", room, bed })
                                  }
                                >
                                  Edit
                                </Button>
                              )}
                              {(!isBedArchived || !isArchivedRoom) && (
                                <Button
                                  size="sm"
                                  variant={
                                    isBedArchived ? "secondary" : "ghost"
                                  }
                                  loading={bedBusy}
                                  disabled={
                                    !isBedArchived &&
                                    bed.activeAllocationCount > 0
                                  }
                                  onClick={() => handleArchiveRestoreBed(bed)}
                                >
                                  {isBedArchived ? "Restore" : "Archive"}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block">
                      <Table containerClassName="rounded-none border-0">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bed</TableHead>
                            <TableHead numeric>Monthly rate</TableHead>
                            <TableHead numeric>Daily rate</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Current / upcoming stay</TableHead>
                            <TableHead className="text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleBeds.map((bed) => {
                            const isBedArchived = bed.archivedAt !== null;
                            const bedBusy = rowPendingId === bed.id;
                            return (
                              <TableRow key={bed.id}>
                                <TableCell className="font-medium tabular-nums">
                                  <div>Bed {bed.number}</div>
                                  {bed.label && (
                                    <div className="text-xs font-normal text-muted-foreground">
                                      {bed.label}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell numeric>
                                  {formatPhpCurrency(bed.monthlyRate)}
                                </TableCell>
                                <TableCell numeric>
                                  {bed.dailyRate
                                    ? formatPhpCurrency(bed.dailyRate)
                                    : "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge tone={BED_BADGE_TONE[bed.status]}>
                                    {BED_STATUS_LABELS[bed.status]}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {bed.currentStaySummary ?? "No active hold"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="inline-flex items-center justify-end gap-2">
                                    {!isBedArchived && !isArchivedRoom && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                          setModal({
                                            kind: "edit-bed",
                                            room,
                                            bed,
                                          })
                                        }
                                      >
                                        Edit
                                      </Button>
                                    )}
                                    {(!isBedArchived || !isArchivedRoom) && (
                                      <Button
                                        size="sm"
                                        variant={
                                          isBedArchived ? "secondary" : "ghost"
                                        }
                                        loading={bedBusy}
                                        disabled={
                                          !isBedArchived &&
                                          bed.activeAllocationCount > 0
                                        }
                                        onClick={() =>
                                          handleArchiveRestoreBed(bed)
                                        }
                                      >
                                        {isBedArchived ? "Restore" : "Archive"}
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <CreateRoomDialog
        open={modal.kind === "create-room"}
        activeRoomTypes={activeRoomTypes}
        pending={createRoomPending}
        state={createRoomState}
        onClose={() => setModal({ kind: "none" })}
        onSubmit={submitCreateRoom}
      />

      <EditRoomDialog
        room={modal.kind === "edit-room" ? modal.room : null}
        roomTypes={overview.roomTypes}
        pending={updateRoomPending}
        state={updateRoomState}
        onClose={() => setModal({ kind: "none" })}
        onSubmit={submitUpdateRoom}
      />

      {/* Create Bed Dialog */}
      <Dialog
        open={modal.kind === "create-bed"}
        onClose={() => setModal({ kind: "none" })}
        dismissDisabled={createBedPending}
        title={
          modal.kind === "create-bed"
            ? `Add bed to Room ${modal.room.number}`
            : "Add bed"
        }
        description="Assign a bed code and rate for monthly or daily stays."
      >
        {modal.kind === "create-bed" && (
          <form
            key={modal.room.id}
            action={submitCreateBed}
            className="grid gap-4"
            noValidate
          >
            <input type="hidden" name="roomId" value={modal.room.id} />
            {createBedState.status === "error" && (
              <Alert tone="danger" role="alert">
                {createBedState.message}
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="create-bed-number"
                label="Bed number"
                required
                error={
                  createBedState.status === "error"
                    ? createBedState.fieldErrors.number
                    : undefined
                }
              >
                {(fieldProps) => (
                  <Input {...fieldProps} name="number" placeholder="e.g. A" />
                )}
              </Field>
              <Field id="create-bed-label" label="Label (optional)">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    name="label"
                    placeholder="e.g. Lower bunk"
                  />
                )}
              </Field>
              <Field
                id="create-bed-monthly"
                label="Monthly rate (₱)"
                required
                error={
                  createBedState.status === "error"
                    ? createBedState.fieldErrors.monthlyRate
                    : undefined
                }
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    name="monthlyRate"
                    inputMode="decimal"
                    defaultValue={modal.room.baseMonthlyRate}
                  />
                )}
              </Field>
              <Field id="create-bed-daily" label="Daily rate (₱)">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    name="dailyRate"
                    inputMode="decimal"
                    defaultValue={modal.room.transientDailyRate ?? ""}
                  />
                )}
              </Field>
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 pt-2">
              <Button
                variant="secondary"
                disabled={createBedPending}
                onClick={() => setModal({ kind: "none" })}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createBedPending}>
                {createBedPending ? "Saving…" : "Save bed"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Edit Bed Dialog */}
      <Dialog
        open={modal.kind === "edit-bed"}
        onClose={() => setModal({ kind: "none" })}
        dismissDisabled={updateBedPending}
        title={
          modal.kind === "edit-bed"
            ? `Edit Bed ${modal.bed.number} (Room ${modal.room.number})`
            : "Edit bed"
        }
        description="Adjust bed label, pricing, or serviceability."
      >
        {modal.kind === "edit-bed" && (
          <form
            key={modal.bed.id}
            action={submitUpdateBed}
            className="grid gap-4"
            noValidate
          >
            <input type="hidden" name="bedId" value={modal.bed.id} />
            <input
              type="hidden"
              name="expectedVersion"
              value={modal.bed.version}
            />
            {updateBedState.status === "error" && (
              <Alert tone="danger" role="alert">
                {updateBedState.message}
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="edit-bed-number"
                label="Bed number"
                required
                error={
                  updateBedState.status === "error"
                    ? updateBedState.fieldErrors.number
                    : undefined
                }
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    name="number"
                    defaultValue={modal.bed.number}
                  />
                )}
              </Field>
              <Field id="edit-bed-label" label="Label (optional)">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    name="label"
                    defaultValue={modal.bed.label ?? ""}
                    placeholder="Optional"
                  />
                )}
              </Field>
              <Field
                id="edit-bed-monthly"
                label="Monthly rate (₱)"
                required
                error={
                  updateBedState.status === "error"
                    ? updateBedState.fieldErrors.monthlyRate
                    : undefined
                }
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    name="monthlyRate"
                    inputMode="decimal"
                    defaultValue={modal.bed.monthlyRate}
                  />
                )}
              </Field>
              <Field id="edit-bed-daily" label="Daily rate (₱)">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    name="dailyRate"
                    inputMode="decimal"
                    defaultValue={modal.bed.dailyRate ?? ""}
                  />
                )}
              </Field>
              <Field
                id="edit-bed-status"
                label="Availability status"
                description={
                  modal.bed.activeAllocationCount > 0
                    ? "Occupied state follows active allocations."
                    : undefined
                }
              >
                {(fieldProps) => (
                  <Select
                    {...fieldProps}
                    name="status"
                    defaultValue={
                      modal.bed.status === "MAINTENANCE"
                        ? "MAINTENANCE"
                        : "AVAILABLE"
                    }
                  >
                    {EDITABLE_BED_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {BED_STATUS_LABELS[st]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2.5 pt-2">
              <Button
                variant="secondary"
                disabled={updateBedPending}
                onClick={() => setModal({ kind: "none" })}
              >
                Cancel
              </Button>
              <Button type="submit" loading={updateBedPending}>
                {updateBedPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
