"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { formatManilaDateTime } from "@/lib/dates";
import {
  getBrowserOfflineDb,
  getVaultCustody,
  inspectAndRequestStorageQuota,
  listDecryptedNeedsAttention,
  listDecryptedProjections,
  type NeedsAttentionView,
  type StorageQuotaStatus,
} from "@/offline/client";
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<NeedsAttentionView | null>(
    null,
  );
  const [busy, startBusy] = useTransition();

  const reloadModalState = useCallback(async () => {
    try {
      const db = getBrowserOfflineDb();
      const custody = getVaultCustody();
      const [status, authMeta, cryptoMeta, quotaStatus] = await Promise.all([
        getOfflineSyncStatus(db),
        db.vaultMeta.get("auth"),
        db.vaultMeta.get("crypto"),
        inspectAndRequestStorageQuota(),
      ]);
      setSyncSummary(status);
      setQuota(quotaStatus);
      setVaultConfigured(cryptoMeta?.key === "crypto");
      setDeviceId(authMeta?.key === "auth" ? authMeta.deviceId : null);

      if (custody.isUnlocked()) {
        const key = custody.getKey();
        const [projList, attentionList] = await Promise.all([
          listDecryptedProjections(db, key),
          listDecryptedNeedsAttention(db, key),
        ]);
        setCachedCount(projList.length);
        setNeedsAttention(attentionList);
        setUnlocked(true);
      } else {
        setCachedCount(0);
        setNeedsAttention([]);
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
    setStatusNotice(null);
    onClose();
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
        notifyOfflineVaultChanged();
        await reloadModalState();

        if (res.status === "already_running") {
          setStatusNotice("Another browser tab is already updating this device.");
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

  function handleLockVault() {
    getVaultCustody().lock();
    setUnlocked(false);
    setCachedCount(0);
    setNeedsAttention([]);
    notifyOfflineVaultChanged();
    setStatusNotice("Offline copy locked for privacy.");
  }

  function handleKeepMine(opId: string) {
    setErrorMessage(null);
    setStatusNotice(null);
    startBusy(async () => {
      try {
        await resolveNeedsAttentionKeepMine(opId);
        await reloadModalState();
        setStatusNotice(
          "Marked your saved change to try saving again.",
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

  function handleConfirmDiscard() {
    if (!discardTarget) return;
    setErrorMessage(null);
    setStatusNotice(null);
    const targetOpId = discardTarget.record.opId;
    startBusy(async () => {
      try {
        await resolveNeedsAttentionDiscard(targetOpId);
        setDiscardTarget(null);
        await reloadModalState();
        setStatusNotice(
          "Removed your draft and restored the latest saved copy.",
        );
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
      title="Offline copy & updates"
      description="Private offline copy saved on this device. Any changes you make offline stay safe here until your internet reconnects."
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
              {vaultConfigured === false
                ? "Offline password not set yet"
                : unlocked
                  ? "Unlocked"
                  : "Locked"}
            </dd>
          </div>
        </dl>

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

        {!unlocked ? (
          <VaultPassphraseForm
            showCancel
            onCancel={handleClose}
            submitSetupLabel={
              online ? "Save password & update" : "Save offline password"
            }
            submitUnlockLabel={online ? "Unlock & update" : "Unlock offline copy"}
            onUnlocked={async ({ initializedNew }) => {
              await reloadModalState();
              setStatusNotice(
                initializedNew
                  ? online
                    ? "Offline password saved and records updated."
                    : "Offline password saved on this browser."
                  : online
                    ? "Offline copy unlocked and updated."
                    : "Offline copy unlocked.",
              );
            }}
          />
        ) : (
          <div className="grid gap-4">
            {needsAttention.length > 0 && (
              <div className="grid gap-2 border-b border-border pb-4">
                <div className="grid gap-0.5">
                  <h3 className="text-sm font-semibold text-foreground">
                    Needs attention ({needsAttention.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Review offline changes that could not be saved before retrying.
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

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {cachedCount} saved{" "}
                  {cachedCount === 1 ? "record" : "records"} on this device
                </span>
                <span className="text-xs text-muted-foreground">
                  {syncSummary.pendingCount > 0
                    ? `${syncSummary.pendingCount} change${syncSummary.pendingCount === 1 ? "" : "s"} waiting to save online.`
                    : "All changes on this device are up to date."}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
