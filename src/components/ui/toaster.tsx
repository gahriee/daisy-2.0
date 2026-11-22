"use client";

import type { CSSProperties } from "react";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

export type SavedFeedbackTone = "success" | "info" | "warning";

const toasterStyle = {
  fontFamily: "var(--font-geist), system-ui, sans-serif",
  "--normal-bg": "var(--surface)",
  "--normal-border": "var(--border)",
  "--normal-text": "var(--foreground)",
  "--success-bg": "var(--success-surface)",
  "--success-border": "var(--success-border)",
  "--success-text": "var(--success)",
  "--info-bg": "var(--info-surface)",
  "--info-border": "var(--info-border)",
  "--info-text": "var(--info)",
  "--warning-bg": "var(--warning-surface)",
  "--warning-border": "var(--warning-border)",
  "--warning-text": "var(--warning)",
  "--error-bg": "var(--danger-surface)",
  "--error-border": "var(--danger-border)",
  "--error-text": "var(--danger)",
  "--border-radius": "var(--panel-radius)",
} as CSSProperties;

function SuccessIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className="size-4 shrink-0"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.5 8.15 7.2 9.85 10.6 6.35"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className="size-4 shrink-0"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 7.25v3.5M8 5.25h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className="size-4 shrink-0"
    >
      <path
        d="M7.14 2.75a1 1 0 0 1 1.72 0l5.2 8.75a1 1 0 0 1-.86 1.5H2.8a1 1 0 0 1-.86-1.5l5.2-8.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.25v2.75M8 10.85h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className="size-4 shrink-0"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.1 5.9 5.9 10.1M5.9 5.9l4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      className="size-3.5"
    >
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

/**
 * Root toast viewport styled with Daisy's Rausch & Charcoal semantic tokens.
 */
export function Toaster() {
  return (
    <SonnerToaster
      className="daisy-toaster"
      theme="light"
      position="top-right"
      richColors
      closeButton
      visibleToasts={4}
      duration={4500}
      gap={10}
      offset={20}
      mobileOffset={16}
      style={toasterStyle}
      icons={{
        success: <SuccessIcon />,
        info: <InfoIcon />,
        warning: <WarningIcon />,
        error: <ErrorIcon />,
        close: <CloseIcon />,
      }}
      toastOptions={{
        closeButtonAriaLabel: "Dismiss notification",
        classNames: {
          title: "text-sm font-medium leading-5",
          description: "text-xs leading-4.5 opacity-90",
          actionButton:
            "rounded-control bg-foreground px-2.5 py-1 text-xs font-medium text-surface",
          cancelButton:
            "rounded-control border border-control-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground",
        },
      }}
    />
  );
}

export { sonnerToast as toast };

/**
 * Dispatches a tone-matched toast for confirmed server saves (`success`),
 * locally queued offline drafts (`info`), or sync attention notices (`warning`).
 */
export function notifySaved(
  message: string,
  tone: SavedFeedbackTone = "success",
): void {
  if (tone === "info") {
    sonnerToast.info(message);
    return;
  }
  if (tone === "warning") {
    sonnerToast.warning(message);
    return;
  }
  sonnerToast.success(message);
}
