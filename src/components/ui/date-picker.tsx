"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { formatManilaDate, parseManilaDate, toManilaDate } from "@/lib/dates";
import {
  compactSingleLineSizingClasses,
  controlBaseClasses,
} from "./control-styles";
import { TimePicker } from "./time-picker";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function toYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function safeParseYmd(raw: string | undefined): {
  year: number;
  month: number;
  day: number;
} | null {
  if (!raw?.trim()) return null;
  try {
    return parseManilaDate(raw);
  } catch {
    return null;
  }
}

function buildCalendarCells(
  year: number,
  month: number,
): Array<{
  ymd: string;
  day: number;
  inCurrentMonth: boolean;
}> {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevMonthYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const daysInPrevMonth = new Date(
    Date.UTC(prevMonthYear, prevMonth, 0),
  ).getUTCDate();
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const cells: Array<{ ymd: string; day: number; inCurrentMonth: boolean }> =
    [];

  for (let i = firstWeekday - 1; i >= 0; i -= 1) {
    const day = daysInPrevMonth - i;
    cells.push({
      ymd: toYmd(prevMonthYear, prevMonth, day),
      day,
      inCurrentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      ymd: toYmd(year, month, day),
      day,
      inCurrentMonth: true,
    });
  }

  const trailingCount = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= trailingCount; day += 1) {
    cells.push({
      ymd: toYmd(nextMonthYear, nextMonth, day),
      day,
      inCurrentMonth: false,
    });
  }

  return cells;
}

export type DatePickerProps = {
  ref?: Ref<HTMLButtonElement>;
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  min?: string | undefined;
  max?: string | undefined;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  "aria-invalid"?: boolean | "true" | "false" | undefined;
  "aria-describedby"?: string | undefined;
  "aria-label"?: string | undefined;
  className?: string;
};

/**
 * Custom Daisy Rausch-and-charcoal calendar date picker that opens when
 * clicking anywhere on the field and submits `YYYY-MM-DD` via a hidden input.
 */
export function DatePicker({
  ref,
  id,
  name,
  value,
  defaultValue = "",
  onValueChange,
  min,
  max,
  placeholder = "Select date",
  disabled = false,
  required = false,
  clearable,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
  className,
}: DatePickerProps) {
  const fallbackId = useId();
  const triggerId = id ?? fallbackId;
  const popoverId = `${triggerId}-popover`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const currentValue = isControlled ? value : uncontrolledValue;

  const todayManila = toManilaDate(new Date());
  const todayParts = safeParseYmd(todayManila) ?? {
    year: 2026,
    month: 1,
    day: 1,
  };
  const selectedParts = safeParseYmd(currentValue);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    selectedParts?.year ?? todayParts.year,
  );
  const [viewMonth, setViewMonth] = useState(
    selectedParts?.month ?? todayParts.month,
  );
  const [coords, setCoords] = useState<CSSProperties | null>(null);

  function commitValue(next: string) {
    if (!isControlled) {
      setUncontrolledValue(next);
    }
    onValueChange?.(next);
  }

  function openPopover() {
    if (disabled) return;
    if (!open) {
      const anchor =
        safeParseYmd(currentValue) ?? safeParseYmd(min) ?? todayParts;
      setViewYear(anchor.year);
      setViewMonth(anchor.month);
    }
    setOpen((prev) => !prev);
  }

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const panelWidth = Math.min(304, Math.max(272, viewportW - 24));
      const estimatedHeight = 336;
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

  function stepMonth(delta: number) {
    const next = new Date(Date.UTC(viewYear, viewMonth - 1 + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth() + 1);
  }

  function isDateDisabled(ymd: string): boolean {
    if (min && ymd < min) return true;
    if (max && ymd > max) return true;
    return false;
  }

  const cells = buildCalendarCells(viewYear, viewMonth);
  const displayLabel = selectedParts ? formatManilaDate(currentValue) : null;
  const invalid = ariaInvalid === true || ariaInvalid === "true";
  const canClear = (clearable ?? !required) && currentValue !== "";
  const todayDisabled = isDateDisabled(todayManila);

  return (
    <>
      {name && (
        <input
          type="hidden"
          name={name}
          value={currentValue}
          required={required}
        />
      )}
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref && "current" in ref) {
            (ref as { current: HTMLButtonElement | null }).current = node;
          }
        }}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        data-invalid={invalid || undefined}
        onClick={openPopover}
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
          <rect x="3" y="4.5" width="14" height="12.5" rx="1.75" />
          <path d="M6.5 2.75v3M13.5 2.75v3M3 8.25h14" />
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
            aria-label="Choose date"
            data-daisy-picker-popover="true"
            style={coords}
            className="z-60 overflow-hidden rounded-panel border border-border bg-surface text-foreground shadow-[0_14px_32px_-16px_rgb(34_34_34/0.22)]"
          >
            <div className="flex items-center justify-between gap-1 border-b border-border bg-background/60 px-2.5 py-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Previous year"
                  onClick={() => stepMonth(-12)}
                  className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5"
                  >
                    <path d="M9.5 4 5.5 8l4 4M13 4 9 8l4 4" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => stepMonth(-1)}
                  className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5"
                  >
                    <path d="M10 4 6 8l4 4" />
                  </svg>
                </button>
              </div>

              <span className="text-sm font-semibold text-foreground tabular-nums">
                {MONTH_NAMES[viewMonth - 1]} {viewYear}
              </span>

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => stepMonth(1)}
                  className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5"
                  >
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Next year"
                  onClick={() => stepMonth(12)}
                  className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5"
                  >
                    <path d="m3 4 4 4-4 4M6.5 4l4 4-4 4" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-2.5">
              <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
                {WEEKDAY_LABELS.map((day) => (
                  <span key={day} className="py-1">
                    {day}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((cell) => {
                  const selected = cell.ymd === currentValue;
                  const isToday = cell.ymd === todayManila;
                  const dayDisabled = isDateDisabled(cell.ymd);
                  return (
                    <button
                      key={cell.ymd}
                      type="button"
                      disabled={dayDisabled}
                      onClick={() => {
                        commitValue(cell.ymd);
                        setOpen(false);
                        triggerRef.current?.focus();
                      }}
                      className={cn(
                        "inline-flex min-h-9 cursor-pointer items-center justify-center rounded-control text-xs tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                        selected
                          ? "bg-primary font-semibold text-primary-foreground"
                          : isToday
                            ? "bg-accent/70 font-semibold text-primary hover:bg-accent"
                            : cell.inCurrentMonth
                              ? "text-foreground hover:bg-surface-muted"
                              : "text-muted-foreground/65 hover:bg-surface-muted",
                      )}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border bg-background/60 px-3 py-2">
              <button
                type="button"
                disabled={todayDisabled}
                onClick={() => {
                  commitValue(todayManila);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="inline-flex min-h-8 cursor-pointer items-center rounded-control px-2 text-xs font-medium text-primary transition-colors hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Today
              </button>
              <div className="flex items-center gap-1.5">
                {canClear && (
                  <button
                    type="button"
                    onClick={() => {
                      commitValue("");
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className="inline-flex min-h-8 cursor-pointer items-center rounded-control px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className="inline-flex min-h-8 cursor-pointer items-center rounded-control border border-control-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export type DateTimePickerProps = {
  id?: string;
  name?: string;
  value: string;
  onValueChange: (value: string) => void;
  minDate?: string | undefined;
  maxDate?: string | undefined;
  minuteStep?: 1 | 5 | 10 | 15 | 30;
  disabled?: boolean;
  required?: boolean;
  "aria-invalid"?: boolean | "true" | "false" | undefined;
  "aria-describedby"?: string | undefined;
  className?: string;
};

/**
 * Composed Daisy date-and-time picker pairing `DatePicker` and `TimePicker`
 * for `YYYY-MM-DDTHH:MM` values.
 */
export function DateTimePicker({
  id,
  name,
  value,
  onValueChange,
  minDate,
  maxDate,
  minuteStep = 1,
  disabled = false,
  required = false,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  className,
}: DateTimePickerProps) {
  const [datePart = "", timePart = "09:00"] = value.split("T");

  return (
    <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", className)}>
      {name && (
        <input type="hidden" name={name} value={value} required={required} />
      )}
      <DatePicker
        {...(id ? { id } : {})}
        value={datePart}
        min={minDate}
        max={maxDate}
        disabled={disabled}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onValueChange={(nextDate) => {
          onValueChange(nextDate ? `${nextDate}T${timePart || "09:00"}` : "");
        }}
      />
      <TimePicker
        value={timePart}
        minuteStep={minuteStep}
        disabled={disabled || !datePart}
        required={required}
        aria-invalid={ariaInvalid}
        onValueChange={(nextTime) => {
          if (datePart) {
            onValueChange(`${datePart}T${nextTime}`);
          }
        }}
      />
    </div>
  );
}
