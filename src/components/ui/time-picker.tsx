"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import {
  compactSingleLineSizingClasses,
  controlBaseClasses,
} from "./control-styles";

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

type ParsedTime = {
  hour12: number;
  minute: number;
  period: "AM" | "PM";
};

function parseHHmm(raw: string): ParsedTime | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, period };
}

function formatToHHmm(time: ParsedTime): string {
  const hour24 =
    time.period === "AM"
      ? time.hour12 === 12
        ? 0
        : time.hour12
      : time.hour12 === 12
        ? 12
        : time.hour12 + 12;
  return `${String(hour24).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

function formatDisplayTime(raw: string): string | null {
  const parsed = parseHHmm(raw);
  if (!parsed) return null;
  return `${parsed.hour12}:${String(parsed.minute).padStart(2, "0")} ${parsed.period}`;
}

function buildMinuteOptions(step: number, currentMinute?: number): number[] {
  const safeStep = step > 0 && step <= 60 ? step : 15;
  const set = new Set<number>();
  for (let m = 0; m < 60; m += safeStep) {
    set.add(m);
  }
  if (currentMinute !== undefined && currentMinute >= 0 && currentMinute < 60) {
    set.add(currentMinute);
  }
  return Array.from(set).sort((a, b) => a - b);
}

export type TimePickerProps = {
  id?: string;
  name?: string;
  value: string;
  onValueChange: (value: string) => void;
  minuteStep?: 1 | 5 | 10 | 15 | 30;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-invalid"?: boolean | "true" | "false" | undefined;
  "aria-describedby"?: string | undefined;
  className?: string;
};

/**
 * Custom Daisy Rausch-and-charcoal time picker that opens when clicking
 * anywhere on the field (no native browser clock-only popup) and submits a
 * 24-hour `HH:MM` value via a hidden input.
 */
export function TimePicker({
  id,
  name,
  value,
  onValueChange,
  minuteStep = 1,
  placeholder = "Select time",
  disabled = false,
  required = false,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  className,
}: TimePickerProps) {
  const fallbackId = useId();
  const triggerId = id ?? fallbackId;
  const popoverId = `${triggerId}-popover`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<CSSProperties | null>(null);

  const parsed = parseHHmm(value) ?? { hour12: 9, minute: 0, period: "AM" };
  const displayLabel = formatDisplayTime(value);
  const minuteOptions = buildMinuteOptions(
    minuteStep,
    parseHHmm(value)?.minute,
  );

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const panelWidth = Math.min(280, Math.max(240, viewportW - 24));
      const estimatedHeight = 276;
      const spaceBelow = viewportH - rect.bottom - 12;
      const openAbove =
        spaceBelow < estimatedHeight && rect.top > estimatedHeight;

      const left = Math.max(
        12,
        Math.min(rect.left, viewportW - panelWidth - 12),
      );

      setCoords({
        position: "fixed",
        left,
        width: panelWidth,
        ...(openAbove
          ? { bottom: viewportH - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function updatePart(patch: Partial<ParsedTime>) {
    onValueChange(formatToHHmm({ ...parsed, ...patch }));
  }

  const invalid = ariaInvalid === true || ariaInvalid === "true";

  return (
    <>
      {name && (
        <input type="hidden" name={name} value={value} required={required} />
      )}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-describedby={ariaDescribedBy}
        data-invalid={invalid || undefined}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
        className={cn(
          controlBaseClasses,
          compactSingleLineSizingClasses,
          "flex cursor-pointer items-center justify-between gap-2 px-3.5 text-left tabular-nums",
          open && "border-primary",
          invalid && "border-danger",
          className,
        )}
      >
        <span
          className={cn(
            "truncate",
            displayLabel ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {displayLabel ?? placeholder}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-colors",
            open && "text-primary",
          )}
        >
          <circle cx="10" cy="10" r="7.25" />
          <path d="M10 6.25V10l2.5 1.5" />
        </svg>
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label="Choose time"
            style={coords}
            className="z-60 overflow-hidden rounded-panel border border-border bg-surface text-foreground shadow-[0_14px_32px_-16px_rgb(34_34_34/0.22)]"
          >
            <div className="grid grid-cols-3 divide-x divide-border">
              <div className="grid">
                <div className="border-b border-border bg-background/60 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
                  Hour
                </div>
                <div className="grid max-h-48 gap-0.5 overflow-y-auto overscroll-contain p-1.5">
                  {HOURS_12.map((hour) => {
                    const selected = parsed.hour12 === hour;
                    return (
                      <button
                        key={hour}
                        type="button"
                        onClick={() => updatePart({ hour12: hour })}
                        className={cn(
                          "min-h-9 cursor-pointer rounded-control px-2 text-sm tabular-nums transition-colors",
                          selected
                            ? "bg-accent/70 font-semibold text-primary"
                            : "text-foreground hover:bg-surface-muted",
                        )}
                      >
                        {String(hour).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid">
                <div className="border-b border-border bg-background/60 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
                  Min
                </div>
                <div className="grid max-h-48 content-start gap-0.5 overflow-y-auto overscroll-contain p-1.5">
                  {minuteOptions.map((minute) => {
                    const selected = parsed.minute === minute;
                    return (
                      <button
                        key={minute}
                        type="button"
                        onClick={() => updatePart({ minute })}
                        className={cn(
                          "min-h-9 cursor-pointer rounded-control px-2 text-sm tabular-nums transition-colors",
                          selected
                            ? "bg-accent/70 font-semibold text-primary"
                            : "text-foreground hover:bg-surface-muted",
                        )}
                      >
                        {String(minute).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid">
                <div className="border-b border-border bg-background/60 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
                  AM / PM
                </div>
                <div className="grid content-start gap-1 p-1.5">
                  {(["AM", "PM"] as const).map((period) => {
                    const selected = parsed.period === period;
                    return (
                      <button
                        key={period}
                        type="button"
                        onClick={() => updatePart({ period })}
                        className={cn(
                          "min-h-10 cursor-pointer rounded-control px-2 text-sm font-medium transition-colors",
                          selected
                            ? "bg-primary font-semibold text-primary-foreground"
                            : "text-foreground hover:bg-surface-muted",
                        )}
                      >
                        {period}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border bg-background/60 px-3 py-2">
              <span className="text-xs font-medium text-foreground tabular-nums">
                {displayLabel ?? "9:00 AM"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="inline-flex min-h-8 cursor-pointer items-center rounded-control border border-control-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
