"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
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
import {
  SearchFilterBar,
  SearchFilterChips,
  SearchFilterInput,
  type FilterChipOption,
} from "@/components/ui/search-filter";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ClientDeviceSummary = {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
};

type DeviceStatusFilter = "all" | "active" | "revoked";

const DEVICE_FILTER_OPTIONS: readonly FilterChipOption<DeviceStatusFilter>[] = [
  { value: "all", label: "All devices" },
  { value: "active", label: "Active" },
  { value: "revoked", label: "Revoked" },
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
  const [statusMessage, setStatusMessage] = useState("");
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
    setStatusMessage("");
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
        setErrorMessage(data.error ?? "Could not register this device.");
        return;
      }
      setLabel("");
      setStatusMessage(
        data.reused
          ? `This browser is already registered as ${data.label}.`
          : `Registered this browser as ${data.label}.`,
      );
      await refreshDevices();
    } catch {
      setErrorMessage("Connection interrupted before registration finished.");
    } finally {
      setRegistering(false);
    }
  }

  async function handleRevoke(deviceId: string) {
    if (revokingId) return;
    setStatusMessage("");
    setErrorMessage("");
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
        setErrorMessage(data.error ?? "Could not revoke device.");
        return;
      }
      setStatusMessage(
        "Device revoked. Its next sync or upload request will be denied; your sign-in session remains active.",
      );
      await refreshDevices();
    } catch {
      setErrorMessage("Connection interrupted while revoking device.");
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
              Browser authorization
            </h2>
            <p className="max-w-prose text-sm leading-6 text-muted-foreground">
              Sync and proof uploads require both an active Owner session and a
              non-revoked HttpOnly device cookie.
            </p>
          </div>
          <Badge tone={currentDevice ? "success" : "neutral"}>
            {currentDevice
              ? `This browser: ${currentDevice.label}`
              : "This browser not registered"}
          </Badge>
        </div>

        {statusMessage && (
          <Alert tone="success" role="status">
            {statusMessage}
          </Alert>
        )}
        {errorMessage && (
          <Alert tone="danger" role="alert">
            {errorMessage}
          </Alert>
        )}

        {!currentDevice && (
          <>
            <Separator />
            <form onSubmit={handleRegister} noValidate className="grid gap-4">
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Field
                  id="device-label"
                  label="Register this browser"
                  description="Name this phone or computer so you can recognize it later."
                  required
                  {...(labelError ? { error: labelError } : {})}
                >
                  {(props) => (
                    <Input
                      {...props}
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder="e.g. Owner phone"
                      maxLength={60}
                    />
                  )}
                </Field>
                <Button
                  type="submit"
                  loading={registering}
                  disabled={registering}
                >
                  {registering ? "Registering…" : "Register device"}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>

      {devices.length > 0 && (
        <SearchFilterBar
          title="Filter devices"
          resultCountText={`${filteredDevices.length} of ${devices.length} shown`}
          hasActiveFilters={hasFilters}
          onClearAll={() => {
            setSearchQuery("");
            setStatusFilter("all");
          }}
          aria-label="Filter registered devices"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <SearchFilterInput
              aria-label="Search registered devices"
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Search device name…"
            />
            <SearchFilterChips
              label="Filter by device status"
              options={DEVICE_FILTER_OPTIONS}
              value={statusFilter}
              onValueChange={setStatusFilter}
            />
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
              No devices registered yet
            </EmptyStateTitle>
            <EmptyStateDescription>
              Register this browser above to receive an HttpOnly device cookie
              for offline sync and attachment uploads.
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
              Clear the device filter or search text to see all registered
              browsers.
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
              Clear filters
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
                Registered Owner devices
              </h2>
              <p className="text-xs text-muted-foreground">
                Revoking a device immediately blocks its next sync or upload.
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {filteredDevices.length} of {devices.length}{" "}
              {devices.length === 1 ? "device" : "devices"}
            </span>
          </div>

          <ul className="grid gap-3 p-3 md:hidden">
            {filteredDevices.map((device) => {
              const isRevoked = device.revokedAt !== null;
              return (
                <li key={device.id}>
                  <Card className="grid gap-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {device.label}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {device.isCurrent && <Badge tone="info">Current</Badge>}
                        <Badge tone={isRevoked ? "danger" : "success"}>
                          {isRevoked ? "Revoked" : "Active"}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Added {formatTimestamp(device.createdAt)} · Last seen{" "}
                      {formatTimestamp(device.lastSeenAt)}
                      {isRevoked &&
                        ` · Revoked ${formatTimestamp(device.revokedAt)}`}
                    </p>
                    {!isRevoked && (
                      <div className="flex justify-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={revokingId === device.id}
                          disabled={revokingId !== null}
                          onClick={() => handleRevoke(device.id)}
                        >
                          {revokingId === device.id ? "Revoking…" : "Revoke"}
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>

          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <tr>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added (Manila)</TableHead>
                  <TableHead>Last seen (Manila)</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {filteredDevices.map((device) => {
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
                          {isRevoked ? "Revoked" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatTimestamp(device.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {isRevoked
                          ? `Revoked ${formatTimestamp(device.revokedAt)}`
                          : formatTimestamp(device.lastSeenAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isRevoked ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={revokingId === device.id}
                            disabled={revokingId !== null}
                            onClick={() => handleRevoke(device.id)}
                          >
                            {revokingId === device.id ? "Revoking…" : "Revoke"}
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
        </section>
      )}
    </div>
  );
}
