"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  OfflineSnapshotBanner,
  useOfflineSnapshotState,
} from "@/components/features/offline/offline-vault-unlock";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { MetricCard } from "@/components/ui/metric-card";
import {
  SearchFilterBar,
  SearchFilterInput,
} from "@/components/ui/search-filter";
import {
  RowActionMenu,
  type RowActionItem,
} from "@/components/ui/row-action-menu";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { toast } from "@/components/ui/toaster";
import { archiveRoomAction, restoreRoomAction } from "@/features/rooms/actions";
import {
  BED_STATUS_LABELS,
  BED_STATUSES,
  type BedStatusValue,
  type InventoryOverviewDto,
  type RoomBuildingValue,
  type RoomWithBedsDto,
} from "@/features/rooms/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatPhpCurrency } from "@/lib/money";
import type { SortColumnDef } from "@/lib/table-sort";
import { loadRoomsOverviewFromVault } from "@/offline/snapshot-selectors-extra";

const STATUS_BADGE_TONE: Record<
  BedStatusValue,
  "success" | "info" | "warning" | "neutral"
> = {
  AVAILABLE: "success",
  OCCUPIED: "info",
  MAINTENANCE: "warning",
  ARCHIVED: "neutral",
};

type StatusFilter = "ALL" | BedStatusValue;
type ListingFilter = "ALL" | "PUBLISHED" | "HIDDEN";

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

function deriveRoomStatus(room: RoomWithBedsDto): BedStatusValue {
  if (room.archivedAt !== null) return "ARCHIVED";
  const activeBeds = room.beds.filter((bed) => bed.archivedAt === null);
  if (activeBeds.some((bed) => bed.status === "OCCUPIED")) return "OCCUPIED";
  if (activeBeds.some((bed) => bed.status === "MAINTENANCE")) {
    return "MAINTENANCE";
  }
  return "AVAILABLE";
}

function splitStaySummary(summary: string | null): string[] | null {
  if (!summary) return null;
  const lines = summary
    .split(/\r?\n|\s·\s/)
    .map((part) => part.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : null;
}

function deriveRoomStaySummary(room: RoomWithBedsDto): string | null {
  for (const bed of room.beds) {
    if (bed.currentStaySummary) return bed.currentStaySummary;
  }
  return null;
}

type RoomSortKey =
  "room" | "monthlyRate" | "dailyRate" | "listing" | "status" | "stay";

function getRoomDisplayTitle(room: RoomWithBedsDto): string {
  return room.title;
}

function getRoomSummary(room: RoomWithBedsDto): string | null {
  return room.summary?.trim() || null;
}

const ROOM_SORT_COLUMNS: Record<RoomSortKey, SortColumnDef<RoomWithBedsDto>> = {
  room: {
    getValue: (room) => room.title,
  },
  monthlyRate: {
    getValue: (room) => room.baseMonthlyRate ?? "0",
    kind: "money",
    defaultDirection: "desc",
  },
  dailyRate: {
    getValue: (room) => room.transientDailyRate ?? "0",
    kind: "money",
    defaultDirection: "desc",
  },
  listing: {
    getValue: (room) => (room.isTransientPublished ? "Published" : "Hidden"),
  },
  status: { getValue: (room) => BED_STATUS_LABELS[deriveRoomStatus(room)] },
  stay: { getValue: (room) => deriveRoomStaySummary(room) },
};

export function RoomsWorkspace({
  initialOverview,
  building = "BOARDING",
  offlineMode = false,
  initialLastSyncedAt = null,
}: {
  initialOverview: InventoryOverviewDto;
  building?: RoomBuildingValue;
  offlineMode?: boolean;
  initialLastSyncedAt?: string | null;
}) {
  const isTransient = building === "TRANSIENT";
  const basePath = isTransient ? "/transients/rooms" : "/rooms";
  const {
    data: overview,
    online,
    isOfflineView,
    lastSyncedAt,
    pendingCount,
    needsAttentionCount,
    reload,
  } = useOfflineSnapshotState<InventoryOverviewDto>({
    initialData: initialOverview,
    offlineMode,
    initialLastSyncedAt,
    loadFromVault: async (db, key) => {
      const res = await loadRoomsOverviewFromVault(db, key, building);
      return { data: res.overview, lastSyncedAt: res.lastSyncedAt };
    },
    fetchOnline: async () => {
      const response = await fetch(`/api/rooms?building=${building}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Could not refresh rooms right now.");
      }
      return (await response.json()) as InventoryOverviewDto;
    },
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [listingFilter, setListingFilter] = useState<ListingFilter>("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [confirmingRoom, setConfirmingRoom] = useState<RoomWithBedsDto | null>(
    null,
  );
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function reloadInventory() {
    setRefreshing(true);
    try {
      await reload();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Connect to the internet to refresh rooms.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function handleArchiveRestoreRoom(room: RoomWithBedsDto) {
    if (rowPendingId) return;
    setErrorMessage(null);
    setConfirmError(null);
    setRowPendingId(room.id);
    startTransition(async () => {
      try {
        const result =
          room.archivedAt === null
            ? await archiveRoomAction({
                roomId: room.id,
                expectedVersion: room.version,
              })
            : await restoreRoomAction({
                roomId: room.id,
                expectedVersion: room.version,
              });
        if (result.status === "saved") {
          setConfirmingRoom(null);
          toast.success(result.message);
          await reloadInventory();
        } else if (result.status === "error") {
          setConfirmError(result.message);
        }
      } finally {
        setRowPendingId(null);
      }
    });
  }

  const activeRoomsList = overview.rooms.filter((r) => r.archivedAt === null);
  const availableRoomsCount = activeRoomsList.filter(
    (r) => deriveRoomStatus(r) === "AVAILABLE",
  ).length;
  const occupiedRoomsCount = activeRoomsList.filter(
    (r) => deriveRoomStatus(r) === "OCCUPIED",
  ).length;
  const maintenanceRoomsCount = activeRoomsList.filter(
    (r) => deriveRoomStatus(r) === "MAINTENANCE",
  ).length;

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredRooms = overview.rooms.filter((room) => {
    const isRoomArchived = room.archivedAt !== null;
    if (statusFilter === "ARCHIVED") {
      if (!isRoomArchived) return false;
    } else {
      if (isRoomArchived) return false;
      const roomStatus = deriveRoomStatus(room);
      if (statusFilter !== "ALL" && roomStatus !== statusFilter) return false;
    }
    if (
      isTransient &&
      listingFilter === "PUBLISHED" &&
      !room.isTransientPublished
    ) {
      return false;
    }
    if (
      isTransient &&
      listingFilter === "HIDDEN" &&
      room.isTransientPublished
    ) {
      return false;
    }

    if (!normalizedQuery) return true;

    const staySummary = deriveRoomStaySummary(room) ?? "";
    const haystack = [
      room.title,
      room.floor ?? "",
      isTransient ? (room.isTransientPublished ? "published" : "hidden") : "",
      room.summary ?? "",
      staySummary,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  const hasFilters =
    normalizedQuery !== "" ||
    statusFilter !== "ALL" ||
    (isTransient && listingFilter !== "ALL");

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("ALL");
    setListingFilter("ALL");
  }

  const {
    sortedRows: sortedRooms,
    sort,
    sortHeaderProps,
  } = useTableSort(filteredRooms, ROOM_SORT_COLUMNS, {
    key: "room",
    direction: "asc",
  });

  const { paginatedRows: paginatedRooms, paginationProps } = useTablePagination(
    sortedRooms,
    {
      resetKey: `${normalizedQuery}|${statusFilter}|${listingFilter}|${sort?.key ?? ""}|${sort?.direction ?? ""}`,
    },
  );

  function getRoomRowActions(
    room: RoomWithBedsDto,
    isRoomArchived: boolean,
    roomBusy: boolean,
  ): RowActionItem[] {
    return [
      ...(!isRoomArchived
        ? [
            {
              id: "edit",
              label: "Edit",
              href: `${basePath}/${room.id}`,
            },
          ]
        : []),
      {
        id: isRoomArchived ? "restore" : "archive",
        label: isRoomArchived
          ? isOfflineView
            ? "Restore (online only)"
            : "Restore"
          : isOfflineView
            ? "Archive (online only)"
            : "Archive",
        tone: isRoomArchived ? ("default" as const) : ("danger" as const),
        busy: roomBusy,
        disabled:
          isOfflineView || (!isRoomArchived && room.activeAllocationCount > 0),
        onSelect: () => {
          setConfirmError(null);
          setConfirmingRoom(room);
        },
      },
    ];
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {isTransient ? "Transient rooms" : "Boarding House rooms"}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {isTransient
              ? "Manage transient building rooms, daily rates, public listings, and occupancy."
              : "Manage boarding house rooms, monthly room rates, and live occupancy."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            onClick={() => void reloadInventory()}
          >
            {!refreshing && <RefreshIcon />}
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>
          {!isOfflineView && (
            <>
              {isTransient && (
                <Link
                  href="/book"
                  className={buttonClasses({
                    variant: "secondary",
                    size: "md",
                  })}
                >
                  Open /book
                </Link>
              )}
              <Link
                href={`${basePath}/new`}
                className={buttonClasses({ variant: "primary", size: "md" })}
              >
                Add room
              </Link>
            </>
          )}
        </div>
      </header>

      <OfflineSnapshotBanner
        online={online}
        offlineMode={offlineMode}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        needsAttentionCount={needsAttentionCount}
        syncing={refreshing}
        onSyncNow={() => void reloadInventory()}
      />

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      <section
        aria-label="Room summary"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="Active rooms"
          value={activeRoomsList.length}
          description={`${overview.summary.totalRooms} total rooms recorded`}
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
          label="Available rooms"
          value={availableRoomsCount}
          tone="success"
          description="Ready for tenant or transient stay"
          icon={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10" cy="10" r="7" />
              <path d="m7.25 10.25 2 2 3.75-4" />
            </svg>
          }
        />
        <MetricCard
          label="Occupied rooms"
          value={occupiedRoomsCount}
          tone="info"
          description="Active tenant or transient stay"
          icon={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10" cy="7" r="3" />
              <path d="M4.5 16.5a5.5 5.5 0 0 1 11 0" />
            </svg>
          }
        />
        <MetricCard
          label="In maintenance"
          value={maintenanceRoomsCount}
          tone={maintenanceRoomsCount > 0 ? "warning" : "neutral"}
          description="Temporarily held from booking"
          icon={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 3.25 17 16H3L10 3.25Z" />
              <path d="M10 8.5v3.25" />
              <circle cx="10" cy="13.9" r="0.65" fill="currentColor" />
            </svg>
          }
        />
      </section>

      <SearchFilterBar
        aria-label="Find rooms"
        hasActiveFilters={hasFilters}
        onClearAll={clearFilters}
      >
        <div
          className={
            isTransient
              ? "grid grid-cols-1 gap-3 md:grid-cols-3"
              : "grid grid-cols-1 gap-3 md:grid-cols-2"
          }
        >
          <Field id="inventory-search" label="Find a room">
            {({ id }) => (
              <SearchFilterInput
                id={id}
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="Room title, floor, or occupant"
              />
            )}
          </Field>

          <Field id="inventory-status-filter" label="Room status">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                variant="filter"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
              >
                <option value="ALL">All rooms</option>
                {BED_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {BED_STATUS_LABELS[st]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {isTransient && (
            <Field id="inventory-listing-filter" label="Listing status">
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  variant="filter"
                  value={listingFilter}
                  onChange={(e) =>
                    setListingFilter(e.target.value as ListingFilter)
                  }
                >
                  <option value="ALL">All listings</option>
                  <option value="PUBLISHED">Published on /book</option>
                  <option value="HIDDEN">Hidden from /book</option>
                </Select>
              )}
            </Field>
          )}
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
                : "No matching rooms"}
            </EmptyStateTitle>
            <EmptyStateDescription>
              {overview.rooms.length === 0
                ? isTransient
                  ? "Add your first room and set its daily rate to start recording transient stays."
                  : "Add your first room and set its monthly rate to start assigning boarders."
                : "Try clearing what you entered or changing the room status."}
            </EmptyStateDescription>
          </div>
          <EmptyStateActions>
            {overview.rooms.length === 0 ? (
              !isOfflineView && (
                <Link
                  href={`${basePath}/new`}
                  className={buttonClasses({ size: "md" })}
                >
                  Add room
                </Link>
              )
            ) : (
              <Button variant="secondary" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </EmptyStateActions>
        </EmptyState>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6 sm:py-3.5">
            <h2 className="text-sm font-semibold text-foreground">
              Room directory
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filteredRooms.length}{" "}
              {filteredRooms.length === 1 ? "room" : "rooms"}
            </span>
          </div>

          {/* Mobile 360px card layout */}
          <div className="grid divide-y divide-border md:hidden">
            {paginatedRooms.map((room) => {
              const isRoomArchived = room.archivedAt !== null;
              const roomBusy = rowPendingId === room.id;
              const roomStatus = deriveRoomStatus(room);
              const stayLines = splitStaySummary(deriveRoomStaySummary(room));

              const roomTitle = getRoomDisplayTitle(room);
              const roomSummary = getRoomSummary(room);

              return (
                <div key={room.id} className="grid gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid gap-0.5">
                      <Link
                        href={`${basePath}/${room.id}`}
                        className="text-sm font-semibold text-foreground hover:text-primary"
                      >
                        {roomTitle}
                      </Link>
                      {isTransient && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Up to {room.capacity}{" "}
                          {room.capacity === 1 ? "guest" : "guests"}
                        </span>
                      )}
                      {room.floor && (
                        <span className="text-xs text-muted-foreground">
                          {room.floor}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {isTransient && (
                        <Badge
                          tone={
                            room.isTransientPublished ? "success" : "neutral"
                          }
                        >
                          {room.isTransientPublished ? "Published" : "Hidden"}
                        </Badge>
                      )}
                      <Badge tone={STATUS_BADGE_TONE[roomStatus]}>
                        {BED_STATUS_LABELS[roomStatus]}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                    <div className="grid gap-0.5">
                      {isTransient ? (
                        <span>
                          Daily{" "}
                          <strong className="font-semibold text-foreground">
                            {formatPhpCurrency(
                              room.transientDailyRate ?? "0.00",
                            )}
                          </strong>
                        </span>
                      ) : (
                        <span>
                          Monthly{" "}
                          <strong className="font-semibold text-foreground">
                            {formatPhpCurrency(room.baseMonthlyRate ?? "0.00")}
                          </strong>
                        </span>
                      )}
                    </div>
                    <div className="grid gap-0.5 text-right">
                      {stayLines ? (
                        <>
                          <span className="font-medium text-foreground">
                            {stayLines[0]}
                          </span>
                          {stayLines[1] && <span>{stayLines[1]}</span>}
                        </>
                      ) : (
                        <span>No active stay</span>
                      )}
                    </div>
                  </div>

                  {roomSummary && (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {roomSummary}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                    <span className="text-xs text-muted-foreground">
                      Actions
                    </span>
                    <RowActionMenu
                      label={`Actions for ${roomTitle}`}
                      items={getRoomRowActions(room, isRoomArchived, roomBusy)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop data table */}
          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead {...sortHeaderProps("room")}>Room</TableHead>
                  {isTransient ? (
                    <>
                      <TableHead numeric {...sortHeaderProps("dailyRate")}>
                        Daily rate
                      </TableHead>
                      <TableHead {...sortHeaderProps("listing")}>
                        Public /book
                      </TableHead>
                    </>
                  ) : (
                    <TableHead numeric {...sortHeaderProps("monthlyRate")}>
                      Monthly rate
                    </TableHead>
                  )}
                  <TableHead {...sortHeaderProps("status")}>Status</TableHead>
                  <TableHead {...sortHeaderProps("stay")}>
                    Current / next stay
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRooms.map((room) => {
                  const isRoomArchived = room.archivedAt !== null;
                  const roomBusy = rowPendingId === room.id;
                  const roomStatus = deriveRoomStatus(room);
                  const stayLines = splitStaySummary(
                    deriveRoomStaySummary(room),
                  );

                  const roomTitle = getRoomDisplayTitle(room);
                  const roomSummary = getRoomSummary(room);

                  return (
                    <TableRow key={room.id}>
                      <TableCell>
                        <div className="grid gap-0.5">
                          <Link
                            href={`${basePath}/${room.id}`}
                            className="font-semibold text-foreground hover:text-primary"
                          >
                            {roomTitle}
                          </Link>
                          {isTransient && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              Up to {room.capacity}{" "}
                              {room.capacity === 1 ? "guest" : "guests"}
                            </span>
                          )}
                          {room.floor && (
                            <span className="text-xs text-muted-foreground">
                              {room.floor}
                            </span>
                          )}
                          {roomSummary && (
                            <span className="text-xs text-muted-foreground">
                              {roomSummary}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell numeric className="font-medium">
                        {formatPhpCurrency(
                          isTransient
                            ? (room.transientDailyRate ?? "0.00")
                            : (room.baseMonthlyRate ?? "0.00"),
                        )}
                      </TableCell>
                      {isTransient && (
                        <TableCell>
                          <Badge
                            tone={
                              room.isTransientPublished ? "success" : "neutral"
                            }
                          >
                            {room.isTransientPublished ? "Published" : "Hidden"}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge tone={STATUS_BADGE_TONE[roomStatus]}>
                          {BED_STATUS_LABELS[roomStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {stayLines ? (
                          <div className="grid gap-0.5">
                            <span className="font-medium text-foreground">
                              {stayLines[0]}
                            </span>
                            {stayLines[1] && <span>{stayLines[1]}</span>}
                          </div>
                        ) : (
                          "No active stay"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActionMenu
                          label={`Actions for ${roomTitle}`}
                          items={getRoomRowActions(
                            room,
                            isRoomArchived,
                            roomBusy,
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            {...paginationProps}
            label="Rooms table pagination"
          />
        </Card>
      )}
      <ConfirmDialog
        open={confirmingRoom !== null}
        onClose={() => {
          if (rowPendingId) return;
          setConfirmError(null);
          setConfirmingRoom(null);
        }}
        onConfirm={() => {
          if (confirmingRoom) handleArchiveRestoreRoom(confirmingRoom);
        }}
        title={
          confirmingRoom
            ? confirmingRoom.archivedAt === null
              ? `Archive ${confirmingRoom.title}?`
              : `Restore ${confirmingRoom.title}?`
            : "Update room?"
        }
        description={
          confirmingRoom?.archivedAt === null
            ? "Archiving hides this room from new assignments, stays, and active directory filters. You can restore it anytime."
            : "Restoring makes this room active again for assignments, transient stays, and directory views."
        }
        errorMessage={confirmError}
        confirmLabel={
          confirmingRoom?.archivedAt === null ? "Archive" : "Restore"
        }
        confirmVariant={
          confirmingRoom?.archivedAt === null ? "danger" : "primary"
        }
        loading={confirmingRoom !== null && rowPendingId === confirmingRoom.id}
      />
    </div>
  );
}
