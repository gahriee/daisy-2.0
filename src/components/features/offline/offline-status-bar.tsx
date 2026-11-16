"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  DAISY_OFFLINE_VAULT_EVENT,
  triggerForegroundSyncIfUnlocked,
} from "@/offline/workspace-bridge";
import {
  getBrowserOfflineDb,
  recordOnlineSessionAnchor,
} from "@/offline/client";
import {
  getOfflineSyncStatus,
  type SyncStatusSummary,
} from "@/offline/sync-engine";

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
 * local vault metadata, and surfaces separate network vs. sync status pills.
 */
export function OfflineStatusBar() {
  const online = useBrowserOnline();
  const [syncSummary, setSyncSummary] = useState<SyncStatusSummary | null>(
    null,
  );

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
    window.addEventListener(DAISY_OFFLINE_VAULT_EVENT, handleVaultChange);
    window.addEventListener("online", handleOnlineReconnect);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(DAISY_OFFLINE_VAULT_EVENT, handleVaultChange);
      window.removeEventListener("online", handleOnlineReconnect);
    };
  }, []);

  const syncTone =
    syncSummary && syncSummary.needsAttentionCount > 0
      ? "danger"
      : syncSummary && syncSummary.pendingCount > 0
        ? "warning"
        : "neutral";

  const syncLabel = !syncSummary
    ? "Local vault"
    : syncSummary.needsAttentionCount > 0
      ? `${syncSummary.needsAttentionCount} needs attention`
      : syncSummary.pendingCount > 0
        ? `${syncSummary.pendingCount} pending sync`
        : syncSummary.lastSyncedAt
          ? "Synced"
          : "Not synced";

  return (
    <Link
      href="/offline"
      className="flex flex-wrap items-center gap-1.5 rounded-control px-1.5 py-1 text-xs transition-colors hover:bg-surface-muted"
      title="Open offline vault and sync queue"
    >
      <Badge tone={online ? "success" : "warning"}>
        {online ? "Online" : "Offline"}
      </Badge>
      <Badge tone={syncTone}>{syncLabel}</Badge>
    </Link>
  );
}
