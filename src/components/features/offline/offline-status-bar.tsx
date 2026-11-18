"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import {
  getBrowserOfflineDb,
  recordOnlineSessionAnchor,
} from "@/offline/client";
import {
  getOfflineSyncStatus,
  type SyncStatusSummary,
} from "@/offline/sync-engine";
import {
  DAISY_OFFLINE_VAULT_EVENT,
  DAISY_OPEN_SYNC_MODAL_EVENT,
  triggerForegroundSyncIfUnlocked,
} from "@/offline/workspace-bridge";
import { OfflineSyncDialog } from "./offline-sync-dialog";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => (typeof navigator !== "undefined" ? navigator.onLine : true),
    () => true,
  );
}

/**
 * Registers the service worker, anchors authenticated online presence in the
 * local vault metadata, and opens the workspace sync modal from the Topbar.
 */
export function OfflineStatusBar() {
  const online = useBrowserOnline();
  const [syncSummary, setSyncSummary] = useState<SyncStatusSummary | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let swRegistration: ServiceWorkerRegistration | null = null;
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          swRegistration = reg;
          void reg.update().catch(() => {});
        })
        .catch(() => {
          // Non-fatal in unsupported / private contexts
        });
    }

    let cancelled = false;

    async function refreshLocalState() {
      try {
        const db = getBrowserOfflineDb();
        if (navigator.onLine) {
          const res = await fetch("/api/devices", { cache: "no-store" });
          if (res.ok) {
            const body = (await res.json()) as {
              devices?: Array<{ id: string; isCurrent?: boolean }>;
            };
            const currentDevice =
              body.devices?.find((d) => d.isCurrent) ?? body.devices?.[0];
            await recordOnlineSessionAnchor(db, {
              ownerUserId: "owner",
              deviceId: currentDevice?.id ?? null,
            });
          }
        }
        const status = await getOfflineSyncStatus(db);
        if (
          !cancelled &&
          swRegistration?.waiting &&
          status.syncingCount === 0
        ) {
          swRegistration.waiting.postMessage({ type: "DAISY_SKIP_WAITING" });
        }
        if (!cancelled) {
          setSyncSummary(status);
        }
      } catch {
        // Ignore IndexedDB unavailable states in hardened privacy browsers.
      }
    }

    void refreshLocalState();
    const timer = window.setInterval(() => {
      void refreshLocalState();
    }, 30_000);
    const handleVaultChange = () => {
      void refreshLocalState();
    };
    const handleOnlineReconnect = () => {
      void triggerForegroundSyncIfUnlocked().then(() => refreshLocalState());
    };
    const handleOpenSyncModal = () => {
      setModalOpen(true);
    };
    window.addEventListener(DAISY_OFFLINE_VAULT_EVENT, handleVaultChange);
    window.addEventListener("online", handleOnlineReconnect);
    window.addEventListener(DAISY_OPEN_SYNC_MODAL_EVENT, handleOpenSyncModal);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(DAISY_OFFLINE_VAULT_EVENT, handleVaultChange);
      window.removeEventListener("online", handleOnlineReconnect);
      window.removeEventListener(
        DAISY_OPEN_SYNC_MODAL_EVENT,
        handleOpenSyncModal,
      );
    };
  }, []);

  const syncTone =
    syncSummary && syncSummary.needsAttentionCount > 0
      ? "danger"
      : syncSummary && syncSummary.pendingCount > 0
        ? "warning"
        : "neutral";

  const syncLabel = !syncSummary
    ? "Offline copy"
    : syncSummary.needsAttentionCount > 0
      ? `${syncSummary.needsAttentionCount} need attention`
      : syncSummary.pendingCount > 0
        ? `${syncSummary.pendingCount} waiting to save`
        : syncSummary.lastSyncedAt
          ? "Up to date"
          : "Not updated yet";

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex min-h-11 cursor-pointer flex-wrap items-center gap-1.5 rounded-control px-1.5 py-1 text-xs transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted sm:min-h-9"
        title="Open offline access & updates"
        aria-label={`Connection and offline status: ${online ? "Online" : "Offline"}, ${syncLabel}`}
      >
        <Badge tone={online ? "success" : "warning"}>
          {online ? "Online" : "Offline"}
        </Badge>
        <Badge tone={syncTone}>{syncLabel}</Badge>
      </button>

      <OfflineSyncDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        online={online}
      />
    </>
  );
}
