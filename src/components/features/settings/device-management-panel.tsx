"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toaster";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import type { SortColumnDef } from "@/lib/table-sort";

type DeviceSortKey = "device" | "status" | "createdAt" | "lastSeen";

type DeviceSortRow = {
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
};

const DEVICE_SORT_COLUMNS: Record<
  DeviceSortKey,
  SortColumnDef<DeviceSortRow>
> = {
  device: { getValue: (device) => device.label },
  status: {
    getValue: (device) =>
      device.revokedAt
        ? "Removed"
        : device.isCurrent
          ? "Active (this device)"
          : "Active",
  },
  createdAt: {
    getValue: (device) => device.createdAt,
    kind: "date",
    defaultDirection: "desc",
  },
  lastSeen: {
    getValue: (device) => device.lastSeenAt,
    kind: "date",
    defaultDirection: "desc",
  },
};

export type ClientDeviceSummary = {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
};

type DeviceStatusFilter = "all" | "active" | "revoked";

const DEVICE_STATUS_OPTIONS: readonly {
  value: DeviceStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All devices" },
  { value: "active", label: "Active" },
  { value: "revoked", label: "Removed" },
];

const manilaDateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return manilaDateTimeFormatter.format(new Date(iso));
}

export function DeviceManagementPanel({
  initialDevices,
  onDevicesChange,
}: {
  initialDevices: ClientDeviceSummary[];
  onDevicesChange?: (devices: ClientDeviceSummary[]) => void;
}) {
  const [devices, setDevices] = useState<ClientDeviceSummary[]>(initialDevices);
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [registering, setRegistering] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DeviceStatusFilter>("all");

  const currentDevice = devices.find((device) => device.isCurrent);
  const filteredDevices = devices.filter((device) => {
    const isRevoked = device.revokedAt !== null;
    if (statusFilter === "active" && isRevoked) return false;
    if (statusFilter === "revoked" && !isRevoked) return false;
    const q = searchQuery.trim().toLowerCase();
    if (q && !device.label.toLowerCase().includes(q)) return false;
    return true;
  });

  const {
    sortedRows: sortedDevices,
    sortHeaderProps,
    sort,
  } = useTableSort(filteredDevices, DEVICE_SORT_COLUMNS, {
    key: "createdAt",
    direction: "desc",
  });

  const {
    paginatedRows: paginatedDevices,
    paginationProps: devicesPaginationProps,
  } = useTablePagination(sortedDevices, {
    resetKey: `${searchQuery.trim()}|${statusFilter}|${sort?.key ?? ""}|${sort?.direction ?? ""}`,
  });

  const hasFilters = searchQuery.trim() !== "" || statusFilter !== "all";

  async function refreshDevices() {
    const res = await fetch("/api/devices", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { devices?: ClientDeviceSummary[] };
    if (Array.isArray(data.devices)) {
      setDevices(data.devices);
      onDevicesChange?.(data.devices);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (registering) return;
    setLabelError("");
    setErrorMessage("");

    const trimmed = label.trim();
    if (!trimmed) {
      setLabelError("Enter a device name.");
      return;
    }

    setRegistering(true);
    try {
      const response = await fetch("/api/devices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        reused?: boolean;
        label?: string;
      };
      if (!response.ok) {
        setErrorMessage(data.error ?? "Could not add this device.");
        return;
      }
      setLabel("");
      if (data.reused) {
        toast.info(`This browser is already trusted as ${data.label}.`);
      } else {
        toast.success(`Added this browser as ${data.label}.`);
      }
      await refreshDevices();
    } catch {
      setErrorMessage("Connection stopped before adding this device.");
    } finally {
      setRegistering(false);
    }
  }

  const [confirmingDevice, setConfirmingDevice] =
    useState<ClientDeviceSummary | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function handleRevoke(deviceId: string) {
    if (revokingId) return;
    setErrorMessage("");
    setRevokeError(null);
    setRevokingId(deviceId);
    try {
      const response = await fetch(`/api/devices/${deviceId}/revoke`, {
        method: "POST",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setRevokeError(data.error ?? "Could not remove this device.");
        return;
      }
      setConfirmingDevice(null);
      toast.success(
        "Device access removed. This device can no longer save offline changes or upload photos. You will stay signed in.",
      );
      await refreshDevices();
    } catch {
      setRevokeError("Connection stopped while removing device.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="grid gap-5">
      <Card className="grid gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Browser permission
            </h2>
            <p className="max-w-prose text-sm leading-6 text-muted-foreground">
              Offline saving and payment photo uploads only work when you are
              signed in on a trusted browser.
            </p>
          </div>
          <Badge tone={currentDevice ? "success" : "neutral"}>
            {currentDevice
              ? `This browser: ${currentDevice.label}`
              : "Not added yet"}
          </Badge>
        </div>

        {errorMessage && (
          <Alert tone="danger" role="alert">
            {errorMessage}
          </Alert>
        )}

        {!currentDevice && (
          <>
            <Separator />
            <form onSubmit={handleRegister} noValidate className="grid gap-4">
              <Field
                id="device-label"
                label="Add this device"
                description="Give this phone or computer a name you will recognize."
                required
                {...(labelError ? { error: labelError } : {})}
              >
                {(props) => (
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                    <Input
                      {...props}
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder="e.g. Front desk phone"
                      maxLength={60}
                      className="sm:flex-1"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      loading={registering}
                      disabled={registering}
                      className="min-h-10 shrink-0 sm:min-h-9"
                    >
                      {registering ? "Adding…" : "Add device"}
                    </Button>
                  </div>
                )}
              </Field>
            </form>
          </>
        )}
      </Card>

      {devices.length > 0 && (
        <SearchFilterBar
          hasActiveFilters={hasFilters}
          onClearAll={() => {
            setSearchQuery("");
            setStatusFilter("all");
          }}
          aria-label="Find trusted devices"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
            <div className="sm:col-span-2">
              <Field id="devices-search" label="Find a device">
                {(fieldProps) => (
                  <SearchFilterInput
                    {...fieldProps}
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    placeholder="Device name"
                  />
                )}
              </Field>
            </div>

            <Field id="devices-status-filter" label="Status">
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  variant="filter"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as DeviceStatusFilter)
                  }
                >
                  {DEVICE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </SearchFilterBar>
      )}

      {devices.length === 0 ? (
        <EmptyState
          aria-labelledby="devices-empty-title"
          className="items-center justify-items-center py-12 text-center"
        >
          <Image
            src="/illustrations/adjust-settings.svg"
            alt=""
            width={717}
            height={800}
            unoptimized
            aria-hidden="true"
            className="h-auto w-32 select-none sm:w-40"
          />
          <div className="grid justify-items-center gap-1.5">
            <EmptyStateTitle id="devices-empty-title">
              No trusted devices yet
            </EmptyStateTitle>
            <EmptyStateDescription>
              Add this browser above so this device can save offline updates and
              upload payment photos.
            </EmptyStateDescription>
          </div>
        </EmptyState>
      ) : filteredDevices.length === 0 ? (
        <EmptyState
          aria-labelledby="devices-filtered-empty-title"
          className="items-center justify-items-center py-12 text-center"
        >
          <Image
            src="/illustrations/document-search.svg"
            alt=""
            width={799}
            height={618}
            unoptimized
            aria-hidden="true"
            className="h-auto w-36 select-none sm:w-44"
          />
          <div className="grid justify-items-center gap-1.5">
            <EmptyStateTitle id="devices-filtered-empty-title">
              No matching devices
            </EmptyStateTitle>
            <EmptyStateDescription>
              Clear your search or change the status filter to see all devices.
            </EmptyStateDescription>
          </div>
          <EmptyStateActions>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
            >
              Clear
            </Button>
          </EmptyStateActions>
        </EmptyState>
      ) : (
        <section
          aria-labelledby="devices-table-heading"
          className="overflow-hidden rounded-panel border border-border bg-surface"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
            <div className="grid gap-0.5">
              <h2
                id="devices-table-heading"
                className="text-sm font-semibold text-foreground"
              >
                Trusted devices
              </h2>
              <p className="text-xs text-muted-foreground">
                Removing a device stops it from saving updates or uploading
                photos right away.
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {filteredDevices.length} of {devices.length}{" "}
              {devices.length === 1 ? "device" : "devices"}
            </span>
          </div>

          <ul className="divide-y divide-border md:hidden">
            {paginatedDevices.map((device) => {
              const isRevoked = device.revokedAt !== null;
              return (
                <li key={device.id} className="grid gap-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {device.label}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {device.isCurrent && <Badge tone="info">Current</Badge>}
                      <Badge tone={isRevoked ? "danger" : "success"}>
                        {isRevoked ? "Removed" : "Active"}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid gap-0.5 text-xs text-muted-foreground tabular-nums">
                    <span>Added {formatTimestamp(device.createdAt)}</span>
                    <span>Last seen {formatTimestamp(device.lastSeenAt)}</span>
                    {isRevoked && (
                      <span>Removed {formatTimestamp(device.revokedAt)}</span>
                    )}
                  </div>
                  {!isRevoked && (
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        className="text-danger"
                        size="sm"
                        loading={revokingId === device.id}
                        disabled={revokingId !== null}
                        onClick={() => {
                          setRevokeError(null);
                          setConfirmingDevice(device);
                        }}
                      >
                        {revokingId === device.id ? "Removing…" : "Remove"}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead {...sortHeaderProps("device")}>Device</TableHead>
                  <TableHead {...sortHeaderProps("status")}>Status</TableHead>
                  <TableHead {...sortHeaderProps("createdAt")}>Added</TableHead>
                  <TableHead {...sortHeaderProps("lastSeen")}>
                    Last seen
                  </TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDevices.map((device) => {
                  const isRevoked = device.revokedAt !== null;
                  return (
                    <TableRow key={device.id}>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{device.label}</span>
                          {device.isCurrent && (
                            <Badge tone="info">Current</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone={isRevoked ? "danger" : "success"}>
                          {isRevoked ? "Removed" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatTimestamp(device.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {isRevoked
                          ? `Removed ${formatTimestamp(device.revokedAt)}`
                          : formatTimestamp(device.lastSeenAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isRevoked ? (
                          <Button
                            variant="secondary"
                            className="text-danger"
                            size="sm"
                            loading={revokingId === device.id}
                            disabled={revokingId !== null}
                            onClick={() => {
                              setRevokeError(null);
                              setConfirmingDevice(device);
                            }}
                          >
                            {revokingId === device.id ? "Removing…" : "Remove"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            {...devicesPaginationProps}
            label="Devices table pagination"
          />
        </section>
      )}
      <ConfirmDialog
        open={confirmingDevice !== null}
        onClose={() => {
          if (revokingId !== null) return;
          setRevokeError(null);
          setConfirmingDevice(null);
        }}
        onConfirm={() => {
          if (confirmingDevice) void handleRevoke(confirmingDevice.id);
        }}
        title={
          confirmingDevice
            ? `Remove access for "${confirmingDevice.label}"?`
            : "Remove device access?"
        }
        description="This device will no longer be allowed to save updates or upload photos. You will stay signed in."
        warningMessage={
          confirmingDevice?.isCurrent
            ? "This is the browser you are using right now. Removing it stops offline saving on this device until you add it again."
            : undefined
        }
        errorMessage={revokeError}
        confirmLabel="Remove access"
        confirmVariant="danger"
        loading={
          confirmingDevice !== null && revokingId === confirmingDevice.id
        }
      />
    </div>
  );
}
