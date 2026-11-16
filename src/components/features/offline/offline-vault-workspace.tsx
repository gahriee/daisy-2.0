"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useBrowserOnline } from "@/components/features/offline/offline-status-bar";
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
  unlockOrInitializeOfflineVault,
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
  { key: "invoice", label: "Open invoices" },
  { key: "transient_reservation", label: "Transient stays" },
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
  const [passphrase, setPassphrase] = useState("");
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

  function handleUnlockSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusNotice(null);

    startBusy(async () => {
      try {
        const db = getBrowserOfflineDb();
        const custody = getVaultCustody();
        const res = await unlockOrInitializeOfflineVault({
          db,
          custody,
          passphrase,
          isOnline: navigator.onLine,
        });
        setPassphrase("");
        setUnlocked(true);
        setDeviceId(res.deviceId);
        await reloadMetadataAndUnlockedViews();
        setStatusNotice(
          res.initializedNew
            ? "Offline vault initialized on this device."
            : "Offline vault unlocked in memory.",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not unlock the offline vault.",
        );
      }
    });
  }

  function handleLockVault() {
    getVaultCustody().lock();
    setUnlocked(false);
    setProjections([]);
    setNeedsAttention([]);
    setStatusNotice("Offline vault locked and key cleared from memory.");
  }

  function handleSyncNow() {
    setErrorMessage(null);
    setStatusNotice(null);

    startBusy(async () => {
      try {
        if (!navigator.onLine) {
          throw new Error(
            "You are offline. Queued work stays saved on this device until connection returns.",
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
          setStatusNotice("Another tab is already syncing this device.");
        } else if (res.status === "rate_limited") {
          setErrorMessage(
            `Sync throttled briefly. Retry in ${res.retryAfterSeconds ?? 10} seconds.`,
          );
        } else {
          setStatusNotice(
            `Synced ${res.appliedCount} queued change(s) and applied ${res.pulledCount} server update(s).`,
          );
        }
      } catch (error) {
        setUnlocked(getVaultCustody().isUnlocked());
        setErrorMessage(
          error instanceof Error ? error.message : "Sync could not complete.",
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
            "Register this device in Settings -> Trusted devices before queueing offline edits.",
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
          "Saved on this device (pending server confirmation on next Sync now).",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not save draft locally.",
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
          "Re-queued as a fresh operation against current snapshot version. Run Sync now when ready.",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not re-queue operation.",
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
          "Discarded conflicting local draft and restored confirmed snapshot view.",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not discard draft.",
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
                ? "Synced"
                : "Not synced"}
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
                Lock vault
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={busy}
                disabled={busy || !online}
                onClick={handleSyncNow}
              >
                Sync now
              </Button>
            </>
          )}
        </div>
      </header>

      <section className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Offline vault &amp; sync queue
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Encrypted local workspace backed by IndexedDB. Unsynced entries show
          as Saved on this device until accepted by the server; confirmed
          receipts, check-ins, and official invoices always come from Synced
          state.
        </p>
      </section>

      {quota.persisted === false && (
        <Alert tone="warning" role="status">
          Browser persistent storage is not guaranteed on this device. Run Sync
          now regularly so queued entries are not lost by storage eviction.
        </Alert>
      )}

      {quota.nearQuota && (
        <Alert tone="danger" role="alert">
          Device storage is above 80% capacity. Sync pending items before
          capturing large proof photos.
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
          description="Network state stays separate from sync confirmation"
          icon={<SyncQueueIcon />}
          tone={online ? "success" : "warning"}
        />
        <MetricCard
          label="Pending outbox"
          value={syncSummary.pendingCount}
          description="Queued locally as Saved on this device"
          icon={<SyncQueueIcon />}
          tone={syncSummary.pendingCount > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Needs attention"
          value={syncSummary.needsAttentionCount}
          description="Conflicts or blocked drafts requiring manual choice"
          icon={<VaultLockIcon />}
          tone={syncSummary.needsAttentionCount > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Last synced"
          value={
            syncSummary.lastSyncedAt
              ? formatManilaDateTime(new Date(syncSummary.lastSyncedAt))
              : "Never"
          }
          description={
            syncSummary.watermark
              ? `Snapshot sequence ${syncSummary.watermark}`
              : "Run Sync now online to download initial snapshot"
          }
          icon={<VaultLockIcon />}
        />
      </div>

      {!unlocked ? (
        <Card className="max-w-lg p-6">
          <form onSubmit={handleUnlockSubmit} className="grid gap-4">
            <div className="grid gap-1">
              <h2 className="text-base font-semibold text-foreground">
                Unlock offline vault
              </h2>
              <p className="text-sm text-muted-foreground">
                Enter your device passphrase (minimum 8 characters) to derive
                your in-memory AES-GCM key. Auto-locks after 15 minutes of
                inactivity.
              </p>
            </div>
            <Field id="vault-passphrase" label="Vault passphrase" required>
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={busy}
                disabled={busy}
              >
                Unlock vault
              </Button>
              <Link
                href="/settings/devices"
                className={buttonClasses({ variant: "secondary", size: "md" })}
              >
                Trusted devices
              </Link>
            </div>
          </form>
        </Card>
      ) : (
        <div className="grid gap-6">
          {needsAttention.length > 0 && (
            <Card className="overflow-hidden">
              <TableCardHeader
                title="Needs attention"
                description="Review blocked or conflicting offline drafts before retrying."
              />
              <div className="grid divide-y divide-border">
                {needsAttention.map(({ record, envelope }) => (
                  <div
                    key={record.opId}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="grid gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="danger">{record.status}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {envelope.type}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {record.reason ?? "Requires manual resolution."}
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
                  Quick offline tenant draft
                </h2>
                <p className="text-xs text-muted-foreground">
                  Encrypted locally and queued until next Sync now.
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
              aria-label="Offline cached records"
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
                      ?.label ?? "Snapshot"
                  }
                  description={
                    syncSummary.lastSyncedAt
                      ? `Offline snapshot last confirmed at ${formatManilaDateTime(new Date(syncSummary.lastSyncedAt))}`
                      : "No server snapshot downloaded yet."
                  }
                />
                {filteredProjections.length === 0 ? (
                  <TableEmptyState
                    illustration="sweet-home"
                    title="No cached records here"
                    description="Run Sync now while online to download the latest Owner snapshot for offline viewing."
                  />
                ) : (
                  <Table containerClassName="rounded-none border-0">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Record</TableHead>
                        <TableHead>Detail</TableHead>
                        <TableHead>Sync state</TableHead>
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
                                  : "Synced"}
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
