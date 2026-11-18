"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useBrowserOnline } from "@/components/features/offline/offline-status-bar";
import {
  formatOfflineOperationType,
  OfflineVaultUnlockCard,
} from "@/components/features/offline/offline-vault-unlock";
import { DaisyBrand } from "@/components/layout/daisy-brand";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableEmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Table,
  TableBody,
  TableCardHeader,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatManilaDateTime } from "@/lib/dates";
import {
  getBrowserOfflineDb,
  getVaultCustody,
  inspectAndRequestStorageQuota,
  listDecryptedNeedsAttention,
  listDecryptedProjections,
  type DecryptedEntityView,
  type NeedsAttentionView,
  type StorageQuotaStatus,
} from "@/offline/client";
import {
  discardNeedsAttentionOperation,
  enqueueOfflineOperationAtomic,
  keepMineNeedsAttentionOperation,
} from "@/offline/db";
import {
  getOfflineSyncStatus,
  syncOfflineWorkspace,
  type SyncStatusSummary,
} from "@/offline/sync-engine";

const SNAPSHOT_CATEGORIES = [
  { key: "tenant", label: "Tenants" },
  { key: "room", label: "Rooms & beds" },
  { key: "invoice", label: "Open bills" },
  { key: "transient_reservation", label: "Short stays" },
  { key: "maintenance_request", label: "Maintenance" },
  { key: "notice", label: "Notices" },
] as const;

function VaultLockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

function SyncQueueIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 12a8 8 0 1 1-2.35-5.65" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

function summarizeRecordTitle(item: DecryptedEntityView): string {
  const data = item.data;
  const candidate =
    data.fullName ??
    data.invoiceNumber ??
    data.receiptNumber ??
    data.title ??
    data.number ??
    data.guestName ??
    item.entityId;
  return String(candidate);
}

function summarizeRecordSubtitle(item: DecryptedEntityView): string {
  const data = item.data;
  if (typeof data.phone === "string" && data.phone) return data.phone;
  if (typeof data.status === "string" && data.status) return data.status;
  if (typeof data.category === "string" && data.category) return data.category;
  return item.entityType;
}

export function OfflineVaultWorkspace() {
  const online = useBrowserOnline();
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncStatusSummary>({
    pendingCount: 0,
    needsAttentionCount: 0,
    syncingCount: 0,
    lastSyncedAt: null,
    watermark: null,
    hasCursor: false,
    rebootstrapRequired: false,
  });
  const [quota, setQuota] = useState<StorageQuotaStatus>({
    persisted: null,
    usageBytes: null,
    quotaBytes: null,
    nearQuota: false,
  });
  const [projections, setProjections] = useState<DecryptedEntityView[]>([]);
  const [needsAttention, setNeedsAttention] = useState<NeedsAttentionView[]>(
    [],
  );
  const [activeCategory, setActiveCategory] = useState<string>("tenant");
  const [draftTenantName, setDraftTenantName] = useState("");
  const [draftTenantPhone, setDraftTenantPhone] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  async function reloadMetadataAndUnlockedViews() {
    const db = getBrowserOfflineDb();
    const custody = getVaultCustody();
    const [status, authMeta, quotaStatus] = await Promise.all([
      getOfflineSyncStatus(db),
      db.vaultMeta.get("auth"),
      inspectAndRequestStorageQuota(),
    ]);
    setSyncSummary(status);
    setQuota(quotaStatus);
    if (authMeta?.key === "auth") {
      setDeviceId(authMeta.deviceId);
    }

    if (custody.isUnlocked()) {
      const key = custody.getKey();
      const [projList, attentionList] = await Promise.all([
        listDecryptedProjections(db, key),
        listDecryptedNeedsAttention(db, key),
      ]);
      setProjections(projList);
      setNeedsAttention(attentionList);
      setUnlocked(true);
    } else {
      setUnlocked(false);
      setProjections([]);
      setNeedsAttention([]);
    }
  }

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {});
    }

    let cancelled = false;
    async function hydrateInitial() {
      try {
        const db = getBrowserOfflineDb();
        const custody = getVaultCustody();
        const [status, authMeta, quotaStatus] = await Promise.all([
          getOfflineSyncStatus(db),
          db.vaultMeta.get("auth"),
          inspectAndRequestStorageQuota(),
        ]);
        if (cancelled) return;
        setSyncSummary(status);
        setQuota(quotaStatus);
        if (authMeta?.key === "auth") {
          setDeviceId(authMeta.deviceId);
        }
        if (custody.isUnlocked()) {
          const key = custody.getKey();
          const [projList, attentionList] = await Promise.all([
            listDecryptedProjections(db, key),
            listDecryptedNeedsAttention(db, key),
          ]);
          if (cancelled) return;
          setProjections(projList);
          setNeedsAttention(attentionList);
          setUnlocked(true);
        }
      } catch {
        // Ignore IDB errors in restricted environments
      }
    }

    void hydrateInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleLockVault() {
    getVaultCustody().lock();
    setUnlocked(false);
    setProjections([]);
    setNeedsAttention([]);
    setStatusNotice("Offline copy locked for privacy.");
  }

  function handleSyncNow() {
    setErrorMessage(null);
    setStatusNotice(null);

    startBusy(async () => {
      try {
        if (!navigator.onLine) {
          throw new Error(
            "You are offline. Changes stay saved on this device until your internet comes back.",
          );
        }
        const db = getBrowserOfflineDb();
        const key = getVaultCustody().getKey();
        const res = await syncOfflineWorkspace({
          db,
          key,
          ownerToken: crypto.randomUUID(),
        });
        await reloadMetadataAndUnlockedViews();

        if (res.status === "already_running") {
          setStatusNotice(
            "Another browser tab is already updating this device.",
          );
        } else if (res.status === "rate_limited") {
          setErrorMessage(
            `Too many updates at once. Try again in ${res.retryAfterSeconds ?? 10} seconds.`,
          );
        } else {
          setStatusNotice(
            `Saved ${res.appliedCount} pending change(s) and received ${res.pulledCount} update(s).`,
          );
        }
      } catch (error) {
        setUnlocked(getVaultCustody().isUnlocked());
        setErrorMessage(
          error instanceof Error ? error.message : "Update could not finish.",
        );
      }
    });
  }

  function handleQueueTenantDraft(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusNotice(null);

    startBusy(async () => {
      try {
        if (!deviceId) {
          throw new Error(
            "Add this device in Settings -> Trusted devices before saving offline changes.",
          );
        }
        const fullName = draftTenantName.trim();
        const phone = draftTenantPhone.trim();
        if (!fullName || !phone) {
          throw new Error("Enter full name and phone number.");
        }
        const db = getBrowserOfflineDb();
        const key = getVaultCustody().getKey();
        const entityId = crypto.randomUUID();
        const opId = crypto.randomUUID();

        await enqueueOfflineOperationAtomic(db, key, {
          opId,
          deviceId,
          type: "tenant.create",
          entityId,
          baseVersion: 0,
          payload: { fullName, phone },
          projectionPayload: { fullName, phone, status: "Saved on device" },
        });

        setDraftTenantName("");
        setDraftTenantPhone("");
        await reloadMetadataAndUnlockedViews();
        setStatusNotice(
          "Saved on this device. Tap Update now when online to confirm.",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not save draft on this device.",
        );
      }
    });
  }

  function handleKeepMine(opId: string) {
    setErrorMessage(null);
    setStatusNotice(null);
    startBusy(async () => {
      try {
        const db = getBrowserOfflineDb();
        const key = getVaultCustody().getKey();
        await keepMineNeedsAttentionOperation(db, key, {
          supersededOpId: opId,
          newOpId: crypto.randomUUID(),
        });
        await reloadMetadataAndUnlockedViews();
        setStatusNotice(
          "Marked your saved change to try again. Tap Update now when ready.",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not mark this change to try again.",
        );
      }
    });
  }

  function handleDiscard(opId: string) {
    setErrorMessage(null);
    setStatusNotice(null);
    startBusy(async () => {
      try {
        const db = getBrowserOfflineDb();
        const key = getVaultCustody().getKey();
        await discardNeedsAttentionOperation(db, key, opId);
        await reloadMetadataAndUnlockedViews();
        setStatusNotice(
          "Removed your draft and restored the latest saved record.",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not remove draft.",
        );
      }
    });
  }

  const filteredProjections = projections.filter((p) => {
    if (activeCategory === "room") {
      return p.entityType === "room" || p.entityType === "bed";
    }
    return p.entityType === activeCategory;
  });

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <DaisyBrand show="lockup" />
          <Badge tone={online ? "success" : "warning"}>
            {online ? "Online" : "Offline"}
          </Badge>
          <Badge
            tone={
              syncSummary.needsAttentionCount > 0
                ? "danger"
                : syncSummary.pendingCount > 0
                  ? "warning"
                  : "neutral"
            }
          >
            {syncSummary.pendingCount > 0
              ? `${syncSummary.pendingCount} saved on device`
              : syncSummary.lastSyncedAt
                ? "Up to date"
                : "Not updated yet"}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Dashboard
          </Link>
          {unlocked && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleLockVault}
                disabled={busy}
              >
                Lock copy
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={busy}
                disabled={busy || !online}
                onClick={handleSyncNow}
              >
                Update now
              </Button>
            </>
          )}
        </div>
      </header>

      <section className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Offline copy &amp; pending changes
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Private copy saved in this browser. Offline entries show as Saved on
          this device until confirmed online. Official receipts, check-ins, and
          bills are confirmed once updated.
        </p>
      </section>

      {quota.persisted === false && (
        <Alert tone="warning" role="status">
          Browser storage may be cleared by your device when space is low.
          Update regularly while online so saved changes are not lost.
        </Alert>
      )}

      {quota.nearQuota && (
        <Alert tone="danger" role="alert">
          Device storage is over 80% full. Update pending items while online
          before taking large payment photos.
        </Alert>
      )}

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      {statusNotice && (
        <Alert tone="success" role="status">
          {statusNotice}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Connection"
          value={online ? "Online" : "Offline"}
          description="Shows whether internet is connected"
          icon={<SyncQueueIcon />}
          tone={online ? "success" : "warning"}
        />
        <MetricCard
          label="Waiting to save"
          value={syncSummary.pendingCount}
          description="Saved on this device until updated online"
          icon={<SyncQueueIcon />}
          tone={syncSummary.pendingCount > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Needs attention"
          value={syncSummary.needsAttentionCount}
          description="Offline changes that need your review"
          icon={<VaultLockIcon />}
          tone={syncSummary.needsAttentionCount > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Last updated"
          value={
            syncSummary.lastSyncedAt
              ? formatManilaDateTime(new Date(syncSummary.lastSyncedAt))
              : "Never"
          }
          description={
            syncSummary.watermark
              ? `Update #${syncSummary.watermark}`
              : "Tap Update now while online to save a copy"
          }
          icon={<VaultLockIcon />}
        />
      </div>

      {!unlocked ? (
        <OfflineVaultUnlockCard onUnlocked={reloadMetadataAndUnlockedViews} />
      ) : (
        <div className="grid gap-6">
          {needsAttention.length > 0 && (
            <Card className="overflow-hidden">
              <TableCardHeader
                title="Needs attention"
                description="Review offline changes that could not be saved before trying again."
              />
              <div className="grid divide-y divide-border">
                {needsAttention.map(({ record, envelope }) => (
                  <div
                    key={record.opId}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="grid gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="danger">Needs attention</Badge>
                        <span className="text-xs font-medium text-muted-foreground">
                          {formatOfflineOperationType(envelope.type)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {record.reason ?? "Needs your review before saving."}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {record.status !== "blocked" && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleKeepMine(record.opId)}
                        >
                          Keep mine
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleDiscard(record.opId)}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <form onSubmit={handleQueueTenantDraft} className="grid gap-4">
              <div className="grid gap-0.5">
                <h2 className="text-sm font-semibold text-foreground">
                  Quick offline tenant entry
                </h2>
                <p className="text-xs text-muted-foreground">
                  Saved privately on this device until your next Update now.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="offline-tenant-name" label="Full name" required>
                  {(props) => (
                    <Input
                      {...props}
                      value={draftTenantName}
                      onChange={(e) => setDraftTenantName(e.target.value)}
                    />
                  )}
                </Field>
                <Field id="offline-tenant-phone" label="Phone number" required>
                  {(props) => (
                    <Input
                      {...props}
                      value={draftTenantPhone}
                      onChange={(e) => setDraftTenantPhone(e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                >
                  Save on this device
                </Button>
              </div>
            </form>
          </Card>

          <Tabs
            value={activeCategory}
            onValueChange={setActiveCategory}
            variant="underline"
            className="grid gap-4"
          >
            <TabsList
              aria-label="Records saved on this device"
              className="overflow-x-auto"
            >
              {SNAPSHOT_CATEGORIES.map((cat) => (
                <TabsTrigger
                  key={cat.key}
                  value={cat.key}
                  className="whitespace-nowrap"
                >
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={activeCategory}>
              <Card className="overflow-hidden">
                <TableCardHeader
                  title={
                    SNAPSHOT_CATEGORIES.find((c) => c.key === activeCategory)
                      ?.label ?? "Saved records"
                  }
                  description={
                    syncSummary.lastSyncedAt
                      ? `Last updated on ${formatManilaDateTime(new Date(syncSummary.lastSyncedAt))}`
                      : "No offline copy saved yet."
                  }
                />
                {filteredProjections.length === 0 ? (
                  <TableEmptyState
                    illustration="sweet-home"
                    title="No saved records here"
                    description="Tap Update now while online to save the latest records for offline viewing."
                  />
                ) : (
                  <Table containerClassName="rounded-none border-0">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Record</TableHead>
                        <TableHead>Detail</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProjections.map((item) => (
                        <TableRow key={item.key}>
                          <TableCell className="font-medium text-foreground">
                            {summarizeRecordTitle(item)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {summarizeRecordSubtitle(item)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              tone={
                                item.hasConflict
                                  ? "danger"
                                  : item.isPendingLocal
                                    ? "warning"
                                    : "success"
                              }
                            >
                              {item.hasConflict
                                ? "Needs attention"
                                : item.isPendingLocal
                                  ? "Saved on this device"
                                  : "Up to date"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </main>
  );
}
