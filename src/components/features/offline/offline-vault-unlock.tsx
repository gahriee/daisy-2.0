"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatManilaDateTime } from "@/lib/dates";
import {
  getBrowserOfflineDb,
  getVaultCustody,
  unlockOrInitializeOfflineVault,
} from "@/offline/client";
import type { DaisyOfflineDatabase } from "@/offline/db";
import type { OfflineEntitySyncBadge } from "@/offline/snapshot-selectors";
import {
  DAISY_OFFLINE_VAULT_EVENT,
  getOfflineVaultClientState,
  notifyOfflineVaultChanged,
  triggerForegroundSyncIfUnlocked,
} from "@/offline/workspace-bridge";
import { useBrowserOnline } from "./offline-status-bar";

function UnlockFormBody({
  onUnlocked,
  onCancel,
  showCancel = false,
}: {
  onUnlocked?: () => void | Promise<void>;
  onCancel?: () => void;
  showCancel?: boolean;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    startBusy(async () => {
      try {
        const db = getBrowserOfflineDb();
        const custody = getVaultCustody();
        await unlockOrInitializeOfflineVault({
          db,
          custody,
          passphrase,
          isOnline: navigator.onLine,
        });
        setPassphrase("");
        notifyOfflineVaultChanged();
        if (navigator.onLine) {
          await triggerForegroundSyncIfUnlocked();
        }
        await onUnlocked?.();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not unlock the offline vault.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}
      <Field id="inline-vault-passphrase" label="Vault passphrase" required>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="current-password"
            placeholder="Minimum 8 characters"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {showCancel && onCancel && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Link
          href="/offline"
          className={buttonClasses({ variant: "secondary", size: "md" })}
        >
          Open offline vault
        </Link>
        <Button type="submit" variant="primary" loading={busy} disabled={busy}>
          Unlock vault
        </Button>
      </div>
    </form>
  );
}

/**
 * PII-free unlock card rendered when an offline-capable route is opened while
 * the browser vault key is locked.
 */
export function OfflineVaultUnlockCard({
  title = "Unlock local vault",
  description = "Enter your device passphrase (minimum 8 characters) to decrypt your saved offline snapshot and queue edits on this device.",
  onUnlocked,
}: {
  title?: string;
  description?: string;
  onUnlocked?: () => void | Promise<void>;
}) {
  return (
    <Card className="max-w-lg">
      <div className="mb-4 grid gap-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <UnlockFormBody {...(onUnlocked ? { onUnlocked } : {})} />
    </Card>
  );
}

/**
 * Inline modal letting the Owner unlock the offline vault without discarding
 * an open dialog or losing form context.
 */
export function OfflineVaultUnlockDialog({
  open,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  onClose: () => void;
  onUnlocked?: () => void | Promise<void>;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Unlock offline vault"
      description="Enter your device passphrase to save and sync changes locally while offline."
    >
      <UnlockFormBody
        showCancel
        onCancel={onClose}
        onUnlocked={async () => {
          onClose();
          await onUnlocked?.();
        }}
      />
    </Dialog>
  );
}

/**
 * Displays a compact per-entity status pill for locally queued or conflicted
 * operations across domain workspaces.
 */
export function OfflineSyncBadge({
  badge,
}: {
  badge: OfflineEntitySyncBadge | undefined;
}) {
  if (!badge) return null;
  if (badge.status === "pending") {
    return (
      <Badge tone="warning" title="Saved on this device, awaiting sync">
        Saved on device
      </Badge>
    );
  }
  return (
    <Badge
      tone="danger"
      title={badge.reason ?? "Needs attention before syncing"}
    >
      Needs attention
    </Badge>
  );
}

/**
 * Displays snapshot freshness and quick sync/unlock controls when viewing a
 * domain workspace from encrypted local snapshots or with pending local edits.
 */
export function OfflineSnapshotBanner({
  online,
  offlineMode,
  lastSyncedAt,
  pendingCount,
  needsAttentionCount,
  syncing,
  onSyncNow,
}: {
  online: boolean;
  offlineMode: boolean;
  lastSyncedAt: string | null;
  pendingCount: number;
  needsAttentionCount: number;
  syncing?: boolean;
  onSyncNow?: () => void;
}) {
  if (
    online &&
    !offlineMode &&
    pendingCount === 0 &&
    needsAttentionCount === 0
  ) {
    return null;
  }

  return (
    <Alert
      tone={needsAttentionCount > 0 ? "danger" : "warning"}
      role="status"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={online ? "success" : "warning"}>
          {online ? "Online" : "Saved on this device"}
        </Badge>
        <span>
          {offlineMode || !online
            ? lastSyncedAt
              ? `Viewing local snapshot (Last synced ${formatManilaDateTime(new Date(lastSyncedAt))}).`
              : "Viewing local device workspace."
            : `${pendingCount} pending change${pendingCount === 1 ? "" : "s"} awaiting sync.`}
          {needsAttentionCount > 0
            ? ` ${needsAttentionCount} item${needsAttentionCount === 1 ? "" : "s"} need attention before syncing.`
            : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {online && onSyncNow && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={Boolean(syncing)}
            disabled={Boolean(syncing)}
            onClick={onSyncNow}
          >
            Sync now
          </Button>
        )}
        <Link
          href="/offline"
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          {needsAttentionCount > 0 ? "Review Needs attention" : "Offline vault"}
        </Link>
      </div>
    </Alert>
  );
}

/**
 * Shared client snapshot state hook for read-only domain screens that display
 * server data online and fall back seamlessly to decrypted IndexedDB snapshots offline.
 */
export function useOfflineSnapshotState<T>(input: {
  initialData: T;
  offlineMode: boolean;
  initialLastSyncedAt?: string | null;
  loadFromVault: (
    db: DaisyOfflineDatabase,
    key: CryptoKey,
  ) => Promise<{ data: T; lastSyncedAt: string | null }>;
  fetchOnline: () => Promise<T>;
}) {
  const online = useBrowserOnline();
  const isOfflineView = input.offlineMode || !online;
  const [serverData, setServerData] = useState<T>(input.initialData);
  const [data, setData] = useState<T>(input.initialData);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    input.initialLastSyncedAt ?? null,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);

  async function syncLocalState(base: T = serverData) {
    try {
      const vault = await getOfflineVaultClientState();
      setPendingCount(vault.status.pendingCount);
      setNeedsAttentionCount(vault.status.needsAttentionCount);
      setLastSyncedAt(vault.status.lastSyncedAt);

      const custody = getVaultCustody();
      if ((input.offlineMode || !navigator.onLine) && custody.isUnlocked()) {
        const res = await input.loadFromVault(
          getBrowserOfflineDb(),
          custody.getKey(),
        );
        setData(res.data);
        setLastSyncedAt(res.lastSyncedAt);
        return;
      }
      setData(base);
    } catch {
      // Ignore vault inspection failures in restricted contexts.
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void syncLocalState(serverData);
    }, 0);
    const onVaultChange = () => {
      void syncLocalState(serverData);
    };
    window.addEventListener(DAISY_OFFLINE_VAULT_EVENT, onVaultChange);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener(DAISY_OFFLINE_VAULT_EVENT, onVaultChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.offlineMode, online, serverData]);

  async function reload(): Promise<void> {
    if (input.offlineMode || !navigator.onLine) {
      await syncLocalState(serverData);
      return;
    }
    await triggerForegroundSyncIfUnlocked();
    const fresh = await input.fetchOnline();
    setServerData(fresh);
    await syncLocalState(fresh);
  }

  return {
    data,
    online,
    isOfflineView,
    lastSyncedAt,
    pendingCount,
    needsAttentionCount,
    reload,
  };
}
