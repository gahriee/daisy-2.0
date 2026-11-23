"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { PasswordVisibilityButton } from "@/components/features/auth/password-visibility-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { formatManilaDateTime } from "@/lib/dates";
import {
  getBrowserOfflineDb,
  getVaultCustody,
  resetOfflineVaultForNewPassphrase,
  unlockOrInitializeOfflineVault,
} from "@/offline/client";
import { generateVaultPassphrase } from "@/offline/crypto";
import type { DaisyOfflineDatabase } from "@/offline/db";
import type { OfflineEntitySyncBadge } from "@/offline/snapshot-selectors";
import { getOfflineSyncStatus } from "@/offline/sync-engine";
import {
  DAISY_OFFLINE_VAULT_EVENT,
  getOfflineVaultClientState,
  notifyOfflineVaultChanged,
  openOfflineSyncModal,
  triggerForegroundSyncIfUnlocked,
} from "@/offline/workspace-bridge";
import { useBrowserOnline } from "./offline-status-bar";

const VAULT_ACCOUNT_IDENTIFIER = "Daisy Offline Sync";

type BrowserPasswordCredentialCtor = new (data: {
  id: string;
  name?: string;
  password: string;
}) => Credential;

async function promptPasswordManagerSave(password: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const win = window as Window & {
      PasswordCredential?: BrowserPasswordCredentialCtor;
    };
    if (
      typeof win.PasswordCredential === "function" &&
      navigator.credentials &&
      typeof navigator.credentials.store === "function"
    ) {
      const cred = new win.PasswordCredential({
        id: VAULT_ACCOUNT_IDENTIFIER,
        name: VAULT_ACCOUNT_IDENTIFIER,
        password,
      });
      await navigator.credentials.store(cred);
    }
  } catch {
    // Password manager save prompt is optional and browser-dependent.
  }
}

const OFFLINE_OPERATION_LABELS: Record<string, string> = {
  "tenant.create": "New tenant",
  "tenant.update": "Tenant update",
  "tenant.archive": "Archive tenant",
  "tenant.restore": "Restore tenant",
  "transient_guest.create": "New short-stay guest",
  "transient_guest.update": "Short-stay guest update",
  "transient_reservation.create": "Short-stay booking",
  "transient_reservation.checkin": "Check in guest",
  "transient_reservation.checkout": "Check out guest",
  "payment.create": "Payment receipt",
  "maintenance_request.create": "Repair request",
  "maintenance_request.update": "Repair update",
  "maintenance_request.archive": "Archive repair",
  "maintenance_request.restore": "Restore repair",
};

export function formatOfflineOperationType(type: string): string {
  return OFFLINE_OPERATION_LABELS[type] ?? "Saved change";
}

export function VaultPassphraseForm({
  onUnlocked,
  onCancel,
  showCancel = false,
  submitUnlockLabel = "Open offline copy",
  submitSetupLabel = "Save password & open",
  syncAfterUnlock = true,
  onConfiguredChange,
}: {
  onUnlocked?: (result: { initializedNew: boolean }) => void | Promise<void>;
  onCancel?: () => void;
  showCancel?: boolean;
  submitUnlockLabel?: string;
  submitSetupLabel?: string;
  syncAfterUnlock?: boolean;
  onConfiguredChange?: (configured: boolean) => void;
}) {
  const baseId = useId();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [vaultConfigured, setVaultConfigured] = useState<boolean | null>(null);
  const [generatedPassphrase, setGeneratedPassphrase] = useState<string>("");
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUnsyncedCount, setResetUnsyncedCount] = useState(0);
  const [resetError, setResetError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    let active = true;
    async function loadConfigState() {
      try {
        const state = await getOfflineVaultClientState();
        if (!active) return;
        setVaultConfigured(state.vaultConfigured);
        onConfiguredChange?.(state.vaultConfigured);
      } catch {
        if (active) setVaultConfigured(true);
      }
    }
    void loadConfigState();
    const onVaultChange = () => {
      void loadConfigState();
    };
    window.addEventListener(DAISY_OFFLINE_VAULT_EVENT, onVaultChange);
    return () => {
      active = false;
      window.removeEventListener(DAISY_OFFLINE_VAULT_EVENT, onVaultChange);
    };
  }, [onConfiguredChange]);

  const isFirstTimeSetup = vaultConfigured === false;
  const activePassphrase = isFirstTimeSetup ? generatedPassphrase : passphrase;
  const canWebShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  function handleOpenGenerateModal() {
    setErrorMessage(null);
    setCopied(false);
    setShowPassphrase(true);
    setGeneratedPassphrase(generateVaultPassphrase());
    setSetupModalOpen(true);
  }

  async function handleCopyGenerated() {
    try {
      await navigator.clipboard.writeText(generatedPassphrase);
      setCopied(true);
      toast.success("Sync password copied.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMessage(
        "Could not copy automatically. Select and copy manually.",
      );
    }
  }

  async function handleShareGenerated() {
    const shareText = `Daisy Offline Sync Password\nAccount: ${VAULT_ACCOUNT_IDENTIFIER}\nPassword: ${generatedPassphrase}`;
    if (canWebShare) {
      try {
        await navigator.share({
          title: "Daisy Offline Sync Password",
          text: shareText,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    const blob = new Blob([`${shareText}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "daisy-sync-password.txt";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Saved backup file.");
  }

  function handleRegenerate() {
    setGeneratedPassphrase(generateVaultPassphrase());
    setCopied(false);
    setErrorMessage(null);
  }

  function handleOpenForgotDialog() {
    setErrorMessage(null);
    setResetError(null);
    if (!navigator.onLine) {
      setErrorMessage(
        "Connect to the internet first to reset your sync password and download a fresh copy.",
      );
      return;
    }
    startBusy(async () => {
      try {
        const db = getBrowserOfflineDb();
        const status = await getOfflineSyncStatus(db);
        setResetUnsyncedCount(status.pendingCount + status.needsAttentionCount);
      } catch {
        setResetUnsyncedCount(0);
      }
      setResetDialogOpen(true);
    });
  }

  function handleConfirmResetVault() {
    setResetError(null);
    startBusy(async () => {
      try {
        const db = getBrowserOfflineDb();
        const custody = getVaultCustody();
        await resetOfflineVaultForNewPassphrase({ db, custody });
        setResetDialogOpen(false);
        setPassphrase("");
        setErrorMessage(null);
        setVaultConfigured(false);
        onConfiguredChange?.(false);
        notifyOfflineVaultChanged();
        setCopied(false);
        setShowPassphrase(true);
        setGeneratedPassphrase(generateVaultPassphrase());
        setSetupModalOpen(true);
        toast.info(
          "Local copy cleared. Save your new sync password to reconnect.",
        );
      } catch (error) {
        setResetError(
          error instanceof Error
            ? error.message
            : "Could not clear the local copy on this browser.",
        );
      }
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    if (activePassphrase.trim().length < 8) {
      setErrorMessage("Use at least 8 characters.");
      return;
    }

    // Ensure browser and iOS/Android password managers detect a password submit.
    if (passwordInputRef.current) {
      passwordInputRef.current.type = "password";
    }
    setShowPassphrase(false);

    startBusy(async () => {
      try {
        const db = getBrowserOfflineDb();
        const custody = getVaultCustody();
        const result = await unlockOrInitializeOfflineVault({
          db,
          custody,
          passphrase: activePassphrase,
          isOnline: navigator.onLine,
        });
        if (result.initializedNew) {
          await promptPasswordManagerSave(activePassphrase);
        }
        setPassphrase("");
        setGeneratedPassphrase("");
        setSetupModalOpen(false);
        setVaultConfigured(true);
        onConfiguredChange?.(true);
        notifyOfflineVaultChanged();
        if (syncAfterUnlock && navigator.onLine) {
          await triggerForegroundSyncIfUnlocked();
        }
        await onUnlocked?.({ initializedNew: result.initializedNew });
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Wrong password. Try again.",
        );
      }
    });
  }

  if (isFirstTimeSetup) {
    return (
      <>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Generate a sync password to protect offline data on this device.
          </p>

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
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={handleOpenGenerateModal}
            >
              Generate password
            </Button>
          </div>
        </div>

        <Dialog
          open={setupModalOpen}
          onClose={() => {
            if (!busy) {
              setSetupModalOpen(false);
              setGeneratedPassphrase("");
              setErrorMessage(null);
            }
          }}
          dismissDisabled={busy}
          maxWidthClassName="max-w-md"
          title="Your sync password"
          description="Save this now. We do not store a copy online."
        >
          <form
            onSubmit={handleSubmit}
            action="/offline"
            method="post"
            className="grid gap-4"
            noValidate
          >
            {errorMessage && (
              <Alert tone="danger" role="alert">
                {errorMessage}
              </Alert>
            )}

            <input
              type="text"
              name="username"
              autoComplete="username"
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              value={VAULT_ACCOUNT_IDENTIFIER}
              className="sr-only"
            />

            <Field
              id={`${baseId}-generated-passphrase`}
              label="Sync password"
              required
            >
              {(props) => (
                <div className="grid gap-2.5">
                  <div className="relative">
                    <Input
                      {...props}
                      ref={passwordInputRef}
                      type={showPassphrase ? "text" : "password"}
                      name="password"
                      autoComplete="new-password"
                      readOnly
                      value={generatedPassphrase}
                      className="pr-12 font-mono"
                    />
                    <PasswordVisibilityButton
                      visible={showPassphrase}
                      label={showPassphrase ? "Hide password" : "Show password"}
                      onClick={() => setShowPassphrase((prev) => !prev)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleCopyGenerated()}
                    >
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleShareGenerated()}
                    >
                      {canWebShare ? "Save to app" : "Download .txt"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={handleRegenerate}
                    >
                      Regenerate
                    </Button>
                  </div>
                </div>
              )}
            </Field>

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setSetupModalOpen(false);
                  setGeneratedPassphrase("");
                  setErrorMessage(null);
                }}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={busy}
                disabled={busy}
                className="w-full sm:w-auto"
              >
                {submitSetupLabel}
              </Button>
            </div>
          </form>
        </Dialog>
      </>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      action="/offline"
      method="post"
      className="grid gap-4"
      noValidate
    >
      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      <input
        type="text"
        name="username"
        autoComplete="username"
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        value={VAULT_ACCOUNT_IDENTIFIER}
        className="sr-only"
      />

      <Field
        id={`${baseId}-passphrase`}
        label="Sync password"
        description="Locks after 15 minutes of inactivity."
        required
      >
        {(props) => (
          <div className="relative">
            <Input
              {...props}
              ref={passwordInputRef}
              type={showPassphrase ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              placeholder="Enter or autofill sync password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="pr-12"
            />
            <PasswordVisibilityButton
              visible={showPassphrase}
              label={showPassphrase ? "Hide password" : "Show password"}
              onClick={() => setShowPassphrase((prev) => !prev)}
            />
          </div>
        )}
      </Field>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          disabled={busy}
          onClick={handleOpenForgotDialog}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center text-sm font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:justify-start"
        >
          Forgot sync password?
        </button>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {showCancel && onCancel && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={onCancel}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            {submitUnlockLabel}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={resetDialogOpen}
        onClose={() => {
          if (!busy) {
            setResetError(null);
            setResetDialogOpen(false);
          }
        }}
        onConfirm={handleConfirmResetVault}
        title="Reset sync password on this browser?"
        description={
          resetUnsyncedCount > 0
            ? `Warning: ${resetUnsyncedCount} unsynced ${resetUnsyncedCount === 1 ? "change" : "changes"} saved only on this browser will be removed because the old password is required to unlock them. All synced records stay safe on the server, and you can generate a new sync password right away.`
            : "This clears the locked offline copy on this browser so you can generate a new sync password and download a fresh copy from the server. Your online records are not affected."
        }
        errorMessage={resetError}
        confirmLabel="Reset & create new password"
        confirmVariant="danger"
        loading={busy}
      />
    </form>
  );
}

/**
 * PII-free setup or unlock card rendered when an offline-capable route is
 * opened while the browser vault key is locked.
 */
export function OfflineVaultUnlockCard({
  title,
  description,
  onUnlocked,
}: {
  title?: string;
  description?: string;
  onUnlocked?: () => void | Promise<void>;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const resolvedTitle =
    title ??
    (configured === false ? "Set up offline access" : "Open offline copy");
  const resolvedDescription =
    description ??
    (configured === false
      ? "Save this password so your offline records stay private on this device."
      : "Enter or autofill your saved password to view records kept on this device.");

  return (
    <Card className="max-w-lg">
      <div className="mb-4 grid gap-1">
        <h2 className="text-base font-semibold text-foreground">
          {resolvedTitle}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {resolvedDescription}
        </p>
      </div>
      <VaultPassphraseForm
        onConfiguredChange={setConfigured}
        onUnlocked={async ({ initializedNew }) => {
          toast.success(
            initializedNew
              ? "Offline password saved on this browser."
              : "Offline copy unlocked.",
          );
          await onUnlocked?.();
        }}
      />
    </Card>
  );
}

/**
 * Inline modal letting the Owner save a generated passphrase or unlock the
 * offline vault without leaving the active workspace dialog.
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
  const [configured, setConfigured] = useState<boolean | null>(null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        configured === false ? "Set up offline access" : "Open offline copy"
      }
      description={
        configured === false
          ? "Save this password so your offline records stay private on this device."
          : "Enter or autofill your saved password to view saved records or save changes while offline."
      }
    >
      <VaultPassphraseForm
        showCancel
        onCancel={onClose}
        onConfiguredChange={setConfigured}
        onUnlocked={async ({ initializedNew }) => {
          toast.success(
            initializedNew
              ? "Offline password saved on this browser."
              : "Offline copy unlocked.",
          );
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
      <Badge tone="warning" title="Saved on this device, waiting to update">
        Saved on device
      </Badge>
    );
  }
  return (
    <Badge
      tone="danger"
      title={badge.reason ?? "Needs attention before updating"}
    >
      Needs attention
    </Badge>
  );
}

/**
 * Displays snapshot freshness and opens the workspace sync modal in place
 * without navigating away from the active page.
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
              ? `Viewing saved copy (last updated ${formatManilaDateTime(new Date(lastSyncedAt))}).`
              : "Viewing records saved on this device."
            : `${pendingCount} waiting ${pendingCount === 1 ? "change" : "changes"} to save online.`}
          {needsAttentionCount > 0
            ? ` ${needsAttentionCount} ${needsAttentionCount === 1 ? "item needs" : "items need"} your attention before updating.`
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
            Update now
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={openOfflineSyncModal}
        >
          {needsAttentionCount > 0 ? "Review items" : "Offline copy"}
        </Button>
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
  const [prevInitialData, setPrevInitialData] = useState<T>(input.initialData);
  const [serverData, setServerData] = useState<T>(input.initialData);
  const [data, setData] = useState<T>(input.initialData);
  if (input.initialData !== prevInitialData) {
    setPrevInitialData(input.initialData);
    setServerData(input.initialData);
    setData(input.initialData);
  }
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
