"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { FormDensityProvider } from "./form-density";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  dismissDisabled?: boolean;
  closeOnBackdrop?: boolean;
  maxWidthClassName?: string;
  children: ReactNode;
};

/**
 * Protected-focus accessible dialog surface with Escape and explicit button
 * dismissal. Background clicks do not dismiss by default so active crops, form
 * drafts, and explicit confirmations stay intact across accidental taps.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  dismissDisabled = false,
  closeOnBackdrop = false,
  maxWidthClassName = "max-w-lg",
  children,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !dismissDisabled) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, dismissDisabled, onClose]);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const count = Number(body.dataset.daisyScrollLocks ?? "0");
    if (count === 0) {
      body.dataset.daisyPreviousOverflow = body.style.overflow;
      body.style.overflow = "hidden";
    }
    body.dataset.daisyScrollLocks = String(count + 1);

    return () => {
      const current = Number(body.dataset.daisyScrollLocks ?? "1");
      const next = Math.max(0, current - 1);
      if (next === 0) {
        body.style.overflow = body.dataset.daisyPreviousOverflow ?? "";
        delete body.dataset.daisyScrollLocks;
        delete body.dataset.daisyPreviousOverflow;
      } else {
        body.dataset.daisyScrollLocks = String(next);
      }
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-foreground/35 p-3 sm:p-5"
      onMouseDown={
        closeOnBackdrop
          ? (event) => {
              if (event.target === event.currentTarget && !dismissDisabled) {
                onClose();
              }
            }
          : undefined
      }
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-panel border border-border bg-surface text-foreground shadow-[0_18px_40px_-20px_rgb(34_34_34/0.28)] sm:max-h-[calc(100dvh-2.5rem)]",
          maxWidthClassName,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="grid gap-1">
            <h2
              id={titleId}
              className="text-base font-semibold tracking-tight text-foreground sm:text-lg"
            >
              {title}
            </h2>
            {description && (
              <div
                id={descriptionId}
                className="grid gap-0.5 text-xs leading-5 text-muted-foreground sm:text-sm"
              >
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={dismissDisabled}
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              className="size-4.5"
            >
              <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
            </svg>
          </button>
        </div>

        <div
          data-form-density="filter"
          className="group/dialog overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
        >
          <FormDensityProvider density="filter">{children}</FormDensityProvider>
        </div>
      </div>
    </div>,
    document.body,
  );
}
