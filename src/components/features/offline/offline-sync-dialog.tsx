"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, CountPill } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { formatManilaDateTime } from "@/lib/dates";
import {
  ensureTrustedDeviceVaultUnlocked,
  getBrowserOfflineDb,
  getVaultCustody,
  inspectAndRequestStorageQuota,
  listDecryptedNeedsAttention,
  listDecryptedPendingOutbox,
  listDecryptedProjections,
  type NeedsAttentionView,
  type StorageQuotaStatus,
  type TrustedDeviceUnlockResult,
} from "@/offline/client";
import { isTrustedDeviceVaultKeyMetadata } from "@/offline/crypto";
import {
  getOfflineSyncStatus,
  syncOfflineWorkspace,
  type SyncStatusSummary,
} from "@/offline/sync-engine";
import {
  DAISY_OFFLINE_VAULT_EVENT,
  notifyOfflineVaultChanged,
  resolveNeedsAttentionDiscard,
  resolveNeedsAttentionKeepMine,
} from "@/offline/workspace-bridge";
import {
  formatOfflineOperationType,
  VaultPassphraseForm,
} from "./offline-vault-unlock";

/**
 * Flat workspace-overlay sync and offline vault modal triggered from the
 * Topbar status pills or inline workspace banners with zero nested containers.
 */
export function OfflineSyncDialog({
  open,
  onClose,
  online,
}: {
  open: boolean;
  onClose: () => void;
  online: boolean;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [trustedDeviceMode, setTrustedDeviceMode] = useState(false);
  const [autoUnlockState, setAutoUnlockState] =
    useState<TrustedDeviceUnlockResult | null>(null);
  const [vaultConfigured, setVaultConfigured] = useState<boolean | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [cachedCount, setCachedCount] = useState(0);
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
  const [needsAttention, setNeedsAttention] = useState<NeedsAttentionView[]>(
    [],
  );
  const [pendingOutbox, setPendingOutbox] = useState<NeedsAttentionView[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<NeedsAttentionView | null>(
    null,
  );
  const [busy, startBusy] = useTransition();

  const reloadModalState = useCallback(async () => {
    try {
      const db = getBrowserOfflineDb();
      const custody = getVaultCustody();
      const unlockRes = await ensureTrustedDeviceVaultUnlocked({
        db,
        custody,
        isOnline: navigator.onLine,
      });
      setAutoUnlockState(unlockRes);

      const [status, authMeta, cryptoMeta, quotaStatus] = await Promise.all([
        getOfflineSyncStatus(db),
        db.vaultMeta.get("auth"),
        db.vaultMeta.get("crypto"),
        inspectAndRequestStorageQuota(),
      ]);
      setSyncSummary(status);
      setQuota(quotaStatus);
      setVaultConfigured(cryptoMeta?.key === "crypto");
      setTrustedDeviceMode(
        cryptoMeta?.key === "crypto" &&
          isTrustedDeviceVaultKeyMetadata(cryptoMeta.metadata),
      );
      setDeviceId(authMeta?.key === "auth" ? authMeta.deviceId : null);

      if (custody.isUnlocked()) {
        const key = custody.getKey();
        const [projList, attentionList, pendingList] = await Promise.all([
          listDecryptedProjections(db, key),
          listDecryptedNeedsAttention(db, key),
          listDecryptedPendingOutbox(db, key),
        ]);
        setCachedCount(projList.length);
        setNeedsAttention(attentionList);
        setPendingOutbox(pendingList);
        setUnlocked(true);
      } else {
        setCachedCount(0);
        setNeedsAttention([]);
        setPendingOutbox([]);
        setUnlocked(false);
      }
    } catch {
      // Ignore IndexedDB unavailability in restricted contexts.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const initialTimer = window.setTimeout(() => {
      void reloadModalState();
    }, 0);

    const handleVaultChange = () => {
      void reloadModalState();
    };
    window.addEventListener(DAISY_OFFLINE_VAULT_EVENT, handleVaultChange);
    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener(DAISY_OFFLINE_VAULT_EVENT, handleVaultChange);
    };
  }, [open, reloadModalState]);

  function handleClose() {
    if (busy || discardTarget) return;
    setErrorMessage(null);
    onClose();
  }

  function handleSyncNow() {
    setErrorMessage(null);

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
        notifyOfflineVaultChanged();
        await reloadModalState();

        if (res.status === "already_running") {
          toast.info("Another browser tab is already updating this device.");
        } else if (res.status === "rate_limited") {
          setErrorMessage(
            `Too many updates at once. Try again in ${res.retryAfterSeconds ?? 10} seconds.`,
          );
        } else {
          toast.success(
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

  function handleLockVault() {
    getVaultCustody().lock();
    setUnlocked(false);
    setCachedCount(0);
    setNeedsAttention([]);
    setPendingOutbox([]);
    notifyOfflineVaultChanged();
    toast.info("Offline copy locked for privacy.");
  }

  function handleKeepMine(opId: string) {
    setErrorMessage(null);
    startBusy(async () => {
      try {
        await resolveNeedsAttentionKeepMine(opId);
        await reloadModalState();
        toast.info("Marked your saved change to try saving again.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not mark this change to try again.",
        );
      }
    });
  }

  function handleConfirmDiscard() {
    if (!discardTarget) return;
    setErrorMessage(null);
    const targetOpId = discardTarget.record.opId;
    startBusy(async () => {
      try {
        await resolveNeedsAttentionDiscard(targetOpId);
        setDiscardTarget(null);
        await reloadModalState();
        toast.success("Removed your draft and restored the latest saved copy.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not remove draft.",
        );
      }
    });
  }

  const syncBadgeTone =
    syncSummary.needsAttentionCount > 0
      ? "danger"
      : syncSummary.pendingCount > 0
        ? "warning"
        : syncSummary.lastSyncedAt
          ? "success"
          : "neutral";

  const syncBadgeLabel =
    syncSummary.needsAttentionCount > 0
      ? `${syncSummary.needsAttentionCount} needs attention`
      : syncSummary.pendingCount > 0
        ? `${syncSummary.pendingCount} waiting`
        : syncSummary.lastSyncedAt
          ? "Up to date"
          : "Not updated yet";

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      dismissDisabled={busy || discardTarget !== null}
      maxWidthClassName="max-w-xl"
      title="Offline sync"
      description="Keep a private copy on this device when offline."
    >
      <div className="grid gap-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border pb-4">
          <div className="grid gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              Connection
            </dt>
            <dd>
              <Badge tone={online ? "success" : "warning"}>
                {online ? "Online" : "Offline"}
              </Badge>
            </dd>
          </div>

          <div className="grid gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              Status
            </dt>
            <dd>
              <Badge tone={syncBadgeTone}>{syncBadgeLabel}</Badge>
            </dd>
          </div>

          <div className="grid gap-0.5">
            <dt className="text-xs font-medium text-muted-foreground">
              Last updated
            </dt>
            <dd className="text-xs font-medium text-foreground tabular-nums sm:text-sm">
              {syncSummary.lastSyncedAt
                ? formatManilaDateTime(new Date(syncSummary.lastSyncedAt))
                : "Never"}
            </dd>
            {syncSummary.watermark && (
              <dd className="text-[11px] text-muted-foreground tabular-nums">
                Update #{syncSummary.watermark}
              </dd>
            )}
          </div>

          <div className="grid gap-0.5">
            <dt className="text-xs font-medium text-muted-foreground">
              This browser
            </dt>
            <dd className="text-xs font-medium text-foreground sm:text-sm">
              {deviceId ? (
                "Trusted device"
              ) : (
                <Link
                  href="/settings/devices"
                  onClick={handleClose}
                  className="text-primary underline underline-offset-2"
                >
                  Allow in Settings
                </Link>
              )}
            </dd>
            <dd className="text-[11px] text-muted-foreground">
              {!deviceId
                ? "Not trusted yet"
                : trustedDeviceMode && unlocked
                  ? "Auto-sync on (no password needed)"
                  : vaultConfigured === false
                    ? "Ready to set up"
                    : unlocked
                      ? "Unlocked"
                      : "Locked"}
            </dd>
          </div>
        </dl>

        {quota.persisted === false && (
          <Alert tone="warning" role="status">
            Sync regularly while online so saved changes are not cleared when
            storage is low.
          </Alert>
        )}

        {quota.nearQuota && (
          <Alert tone="danger" role="alert">
            Device storage is over 80% full. Sync pending changes before adding
            large photos.
          </Alert>
        )}

        {errorMessage && (
          <Alert tone="danger" role="alert">
            {errorMessage}
          </Alert>
        )}

        {!unlocked ? (
          autoUnlockState?.status === "legacy_passphrase_required" ? (
            <VaultPassphraseForm
              showCancel
              onCancel={handleClose}
              submitSetupLabel={online ? "Save & sync" : "Save password"}
              submitUnlockLabel={online ? "Unlock & sync" : "Unlock"}
              onUnlocked={async ({ initializedNew }) => {
                await reloadModalState();
                toast.success(
                  initializedNew
                    ? online
                      ? "Sync enabled and records updated."
                      : "Sync password saved on this browser."
                    : online
                      ? "Unlocked and synced."
                      : "Offline copy unlocked.",
                );
              }}
            />
          ) : autoUnlockState?.status === "expired" ? (
            <div className="grid gap-3">
              <Alert tone="warning" role="status">
                {autoUnlockState.reason}
              </Alert>
              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={handleClose}>
                  Close
                </Button>
              </div>
            </div>
          ) : autoUnlockState?.status === "needs_online_setup" ? (
            <div className="grid gap-3">
              <Alert tone="info" role="status">
                Connect to the internet once so Daisy can automatically save an
                offline copy on this trusted device.
              </Alert>
              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={handleClose}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <Alert tone="info" role="status">
                Add this browser as a Trusted device in Settings so Daisy can
                automatically keep an offline copy without asking for a
                password.
              </Alert>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={handleClose}>
                  Close
                </Button>
                <Link
                  href="/settings/devices"
                  onClick={handleClose}
                  className={buttonClasses({ variant: "primary", size: "md" })}
                >
                  Open Trusted devices
                </Link>
              </div>
            </div>
          )
        ) : (
          <div className="grid gap-4">
            {needsAttention.length > 0 && (
              <div className="grid gap-2 border-b border-border pb-4">
                <div className="grid gap-0.5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span>Needs attention</span>
                    <CountPill tone="warning">
                      {needsAttention.length}
                    </CountPill>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Review offline changes that could not be saved before
                    retrying.
                  </p>
                </div>

                <div className="divide-y divide-border">
                  {needsAttention.map(({ record, envelope }) => (
                    <div
                      key={record.opId}
                      className="flex flex-col gap-2.5 py-2.5 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="danger">Needs attention</Badge>
                          <span className="text-xs font-medium text-muted-foreground">
                            {formatOfflineOperationType(envelope.type)}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-foreground sm:text-sm">
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
                            className="min-h-11 sm:min-h-9"
                          >
                            Keep mine
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => setDiscardTarget({ record, envelope })}
                          className="min-h-11 text-danger sm:min-h-9"
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingOutbox.length > 0 && (
              <div className="grid gap-2 border-b border-border pb-4">
                <div className="grid gap-0.5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span>Waiting to save online</span>
                    <CountPill tone="warning">{pendingOutbox.length}</CountPill>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Saved on this device and queued to upload when you update
                    online.
                  </p>
                </div>

                <div className="divide-y divide-border">
                  {pendingOutbox.map(({ record, envelope }) => (
                    <div
                      key={record.opId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-1 last:pb-0"
                    >
                      <div className="grid gap-0.5">
                        <span className="text-xs font-medium text-foreground sm:text-sm">
                          {formatOfflineOperationType(envelope.type)}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          Saved on this device{" "}
                          {formatManilaDateTime(new Date(envelope.occurredAt))}
                        </span>
                      </div>
                      <Badge
                        tone={record.status === "syncing" ? "info" : "warning"}
                      >
                        {record.status === "syncing" ? "Saving..." : "Pending"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {cachedCount} saved {cachedCount === 1 ? "record" : "records"}{" "}
                  on this device
                </span>
                <span className="text-xs text-muted-foreground">
                  {syncSummary.pendingCount > 0
                    ? `${syncSummary.pendingCount} change${syncSummary.pendingCount === 1 ? "" : "s"} waiting to save online.`
                    : "All changes on this device are up to date."}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!trustedDeviceMode && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={handleLockVault}
                    className="min-h-11 sm:min-h-9"
                  >
                    Lock copy
                  </Button>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={busy}
                  disabled={busy || !online}
                  onClick={handleSyncNow}
                  className="min-h-11 sm:min-h-9"
                >
                  Update now
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={discardTarget !== null}
        onClose={() => {
          if (!busy) setDiscardTarget(null);
        }}
        onConfirm={handleConfirmDiscard}
        title="Remove offline draft?"
        description={
          discardTarget
            ? `This removes your saved "${formatOfflineOperationType(discardTarget.envelope.type)}" draft and keeps the latest saved record.`
            : undefined
        }
        confirmLabel="Discard draft"
        confirmVariant="danger"
        loading={busy}
      />
    </Dialog>
  );
}
