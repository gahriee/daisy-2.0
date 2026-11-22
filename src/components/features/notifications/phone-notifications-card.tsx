"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import type { PushStatusResponse } from "@/features/notifications/push-schemas";

function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function detectIosBrowserMode(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  return !standalone;
}

function detectDeviceLabel(): string {
  if (typeof window === "undefined") return "Web browser";
  const ua = window.navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android phone";
  if (/Windows/i.test(ua)) return "Windows browser";
  if (/Macintosh/i.test(ua)) return "Mac browser";
  return "Web browser";
}

type PushUiState =
  | "loading"
  | "unsupported"
  | "ios_install_first"
  | "server_unconfigured"
  | "blocked"
  | "off"
  | "on";

/**
 * Plain-language card on `/notifications` for turning on or off native phone
 * and desktop PWA push alerts on the current device.
 */
export function PhoneNotificationsCard() {
  const [uiState, setUiState] = useState<PushUiState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [deviceCount, setDeviceCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function syncPushState() {
    setErrorMessage(null);
    if (detectIosBrowserMode()) {
      setUiState("ios_install_first");
      return;
    }
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setUiState("unsupported");
      return;
    }

    try {
      const res = await fetch("/api/notifications/push", { cache: "no-store" });
      if (!res.ok) {
        setUiState("off");
        return;
      }
      const data = (await res.json()) as PushStatusResponse;
      setPublicKey(data.publicKey);
      setDeviceCount(data.subscriptionCount);

      if (!data.configured || !data.publicKey) {
        setUiState("server_unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        setUiState("blocked");
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration("/");
      const existing = registration
        ? await registration.pushManager.getSubscription()
        : null;
      if (
        existing &&
        data.subscribedEndpoints.includes(existing.endpoint) &&
        Notification.permission === "granted"
      ) {
        setUiState("on");
      } else {
        setUiState("off");
      }
    } catch {
      setUiState("off");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void syncPushState();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleEnable() {
    if (busy || !publicKey) return;
    setErrorMessage(null);
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setUiState(permission === "denied" ? "blocked" : "off");
        if (permission === "denied") {
          setErrorMessage(
            "Notifications are blocked in your browser settings. Allow notifications for Daisy and try again.",
          );
        }
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const p256dh = arrayBufferToBase64Url(subscription.getKey("p256dh"));
      const auth = arrayBufferToBase64Url(subscription.getKey("auth"));
      const saveRes = await fetch("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: { p256dh, auth },
          deviceLabel: detectDeviceLabel(),
        }),
        cache: "no-store",
      });

      if (!saveRes.ok) {
        setErrorMessage("Could not turn on phone notifications right now.");
        return;
      }

      await syncPushState();
      toast.success("Phone notifications turned on for this device.");
    } catch {
      setErrorMessage(
        "Could not turn on phone notifications. Make sure Daisy is opened over HTTPS or installed on your Home Screen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (busy) return;
    setErrorMessage(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;

      if (subscription) {
        await fetch("/api/notifications/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          cache: "no-store",
        });
        await subscription.unsubscribe();
      }

      await syncPushState();
      toast.success("Phone notifications turned off on this device.");
    } catch {
      setErrorMessage("Could not turn off phone notifications right now.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendTest() {
    if (testing) return;
    setErrorMessage(null);
    setTesting(true);
    try {
      const res = await fetch("/api/notifications/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setErrorMessage(
          data?.error?.message ?? "Could not send a test alert right now.",
        );
        return;
      }
      toast.success("Test alert sent. Check your phone notification bar.");
    } catch {
      setErrorMessage("Could not reach the server to send a test alert.");
    } finally {
      setTesting(false);
    }
  }

  const badgeProps: { tone: "success" | "warning" | "neutral"; label: string } =
    uiState === "on"
      ? { tone: "success", label: "On for this device" }
      : uiState === "blocked" || uiState === "ios_install_first"
        ? { tone: "warning", label: "Action needed" }
        : uiState === "loading"
          ? { tone: "neutral", label: "Checking…" }
          : { tone: "neutral", label: "Off" };

  return (
    <Card className="grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground sm:text-base">
              Phone &amp; browser alerts
            </h2>
            <Badge tone={badgeProps.tone}>{badgeProps.label}</Badge>
          </div>
          <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
            {uiState === "ios_install_first"
              ? "On iPhone, tap Share → Add to Home Screen first, then open Daisy from your Home Screen to turn on phone notifications."
              : uiState === "blocked"
                ? "Notifications are blocked for Daisy in your browser settings. Allow them in site settings, then reload."
                : uiState === "unsupported"
                  ? "This browser does not support phone notifications. Use Chrome, Edge, Brave, or Safari on your Home Screen."
                  : uiState === "server_unconfigured"
                    ? "Phone notifications need notification keys set up on the server first."
                    : uiState === "on"
                      ? `New booking requests, urgent maintenance, monthly bills, and overdue reminders will appear in your notification bar (${deviceCount} ${deviceCount === 1 ? "device" : "devices"} active).`
                      : "Get notified on your phone when a guest sends a booking request, urgent maintenance is logged, or bills are generated."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {uiState === "off" && (
            <Button
              size="sm"
              loading={busy}
              disabled={busy}
              onClick={() => void handleEnable()}
            >
              {busy ? "Turning on…" : "Turn on phone alerts"}
            </Button>
          )}
          {uiState === "on" && (
            <>
              <Button
                size="sm"
                variant="secondary"
                loading={testing}
                disabled={testing || busy}
                onClick={() => void handleSendTest()}
              >
                {testing ? "Sending…" : "Send test alert"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="text-danger"
                loading={busy}
                disabled={busy || testing}
                onClick={() => void handleDisable()}
              >
                Turn off
              </Button>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}
    </Card>
  );
}
