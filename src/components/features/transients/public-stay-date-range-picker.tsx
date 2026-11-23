"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { PUBLIC_BOOKING_CARD_FOCAL } from "@/components/features/transients/public-booking-chrome";
import {
  findFirstUnavailableNightAfter,
  isRangeBlockedByUnavailableDates,
} from "@/features/transients/public-booking-view";
import { cn } from "@/lib/cn";
import {
  diffManilaDays,
  formatManilaDate,
  parseManilaDate,
  toManilaDate,
} from "@/lib/dates";

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

type CalendarCell = {
  ymd: string;
  day: number;
  inCurrentMonth: boolean;
};

function toYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
}

function buildMonthCells(year: number, month: number): CalendarCell[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prev = addMonths(year, month, -1);
  const daysInPrev = new Date(Date.UTC(prev.year, prev.month, 0)).getUTCDate();
  const next = addMonths(year, month, 1);

  const cells: CalendarCell[] = [];
  for (let i = firstWeekday - 1; i >= 0; i -= 1) {
    const day = daysInPrev - i;
    cells.push({
      ymd: toYmd(prev.year, prev.month, day),
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
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= trailing; day += 1) {
    cells.push({
      ymd: toYmd(next.year, next.month, day),
      day,
      inCurrentMonth: false,
    });
  }
  return cells;
}

function getMonthEndYmd(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return toYmd(year, month, lastDay);
}

export type PublicStayDateRangeCalendarProps = {
  checkIn: string;
  checkOut: string;
  initialPhase?: "checkIn" | "checkOut";
  unavailableDates?: ReadonlyArray<string>;
  showUnavailableLegend?: boolean;
  loadingMoreMonths?: boolean;
  onViewMonthChange?: (
    year: number,
    month: number,
    isTwoMonth: boolean,
  ) => void;
  onRangeSelect: (nextCheckIn: string, nextCheckOut: string) => void;
  onClose: () => void;
};

/**
 * Reusable interactive 1-month mobile / 2-month desktop stay date-range
 * calendar panel shared across the `/book` hero search bar, `/book/[roomId]`,
 * and `/book/[roomId]/request`.
 */
export function PublicStayDateRangeCalendar({
  checkIn,
  checkOut,
  initialPhase = "checkIn",
  unavailableDates = [],
  showUnavailableLegend = false,
  loadingMoreMonths = false,
  onViewMonthChange,
  onRangeSelect,
  onClose,
}: PublicStayDateRangeCalendarProps) {
  const todayManila = useMemo(() => toManilaDate(new Date()), []);
  const todayParts = useMemo(() => parseManilaDate(todayManila), [todayManila]);

  const unavailableSet = useMemo(
    () => new Set(unavailableDates),
    [unavailableDates],
  );

  const initialCoords = useMemo(() => {
    const anchor = checkIn || todayManila;
    try {
      const parsed = parseManilaDate(anchor);
      if (
        parsed.year > todayParts.year ||
        (parsed.year === todayParts.year && parsed.month >= todayParts.month)
      ) {
        return { year: parsed.year, month: parsed.month };
      }
    } catch {
      // Fall back to current Manila month.
    }
    return { year: todayParts.year, month: todayParts.month };
  }, [checkIn, todayManila, todayParts]);

  const [phase, setPhase] = useState<"checkIn" | "checkOut">(() =>
    initialPhase === "checkOut" &&
    checkIn &&
    !unavailableSet.has(checkIn) &&
    checkIn >= todayManila
      ? "checkOut"
      : "checkIn",
  );
  const [pendingCheckIn, setPendingCheckIn] = useState<string>(checkIn);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState(initialCoords.year);
  const [viewMonth, setViewMonth] = useState(initialCoords.month);
  const [isTwoMonthLayout, setIsTwoMonthLayout] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setIsTwoMonthLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const maxCheckOut = useMemo(() => {
    if (phase !== "checkOut" || !pendingCheckIn) return null;
    return findFirstUnavailableNightAfter(pendingCheckIn, unavailableDates);
  }, [phase, pendingCheckIn, unavailableDates]);

  const canGoPrevMonth =
    viewYear > todayParts.year ||
    (viewYear === todayParts.year && viewMonth > todayParts.month);

  function stepMonth(delta: number) {
    if (delta < 0 && !canGoPrevMonth) return;
    const next = addMonths(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
    onViewMonthChange?.(next.year, next.month, isTwoMonthLayout);
  }

  function handleDayClick(ymd: string) {
    if (ymd < todayManila) return;

    if (phase === "checkIn") {
      if (unavailableSet.has(ymd)) return;
      setPendingCheckIn(ymd);
      setPhase("checkOut");
      setHoverDate(null);
      return;
    }

    if (ymd <= pendingCheckIn) {
      if (unavailableSet.has(ymd)) return;
      setPendingCheckIn(ymd);
      setHoverDate(null);
      return;
    }

    if (maxCheckOut && ymd > maxCheckOut) {
      return;
    }
    if (
      isRangeBlockedByUnavailableDates(pendingCheckIn, ymd, unavailableDates)
    ) {
      return;
    }

    setHoverDate(null);
    onRangeSelect(pendingCheckIn, ymd);
  }

  const visibleMonths = useMemo(() => {
    const first = {
      year: viewYear,
      month: viewMonth,
      cells: buildMonthCells(viewYear, viewMonth),
    };
    if (!isTwoMonthLayout) return [first];
    const secondCoords = addMonths(viewYear, viewMonth, 1);
    return [
      first,
      {
        year: secondCoords.year,
        month: secondCoords.month,
        cells: buildMonthCells(secondCoords.year, secondCoords.month),
      },
    ];
  }, [viewYear, viewMonth, isTwoMonthLayout]);

  const previewEnd =
    phase === "checkOut" &&
    hoverDate &&
    hoverDate > pendingCheckIn &&
    (!maxCheckOut || hoverDate <= maxCheckOut)
      ? hoverDate
      : null;

  const activeRangeStart = phase === "checkOut" ? pendingCheckIn : checkIn;
  const activeRangeEnd = phase === "checkOut" ? previewEnd : checkOut;

  const selectedNights = useMemo(() => {
    if (
      !activeRangeStart ||
      !activeRangeEnd ||
      activeRangeEnd <= activeRangeStart
    ) {
      return 0;
    }
    try {
      return diffManilaDays(activeRangeStart, activeRangeEnd);
    } catch {
      return 0;
    }
  }, [activeRangeStart, activeRangeEnd]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl text-foreground",
        PUBLIC_BOOKING_CARD_FOCAL,
      )}
    >
      {/* Top status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/70 px-4 py-2.5 text-xs">
        <span className="font-medium text-foreground">
          {phase === "checkIn"
            ? "Select check-in date"
            : maxCheckOut
              ? `Check-in: ${formatManilaDate(pendingCheckIn)} — check-out up to ${formatManilaDate(maxCheckOut)}`
              : `Check-in: ${formatManilaDate(pendingCheckIn)} — select check-out`}
        </span>
        {loadingMoreMonths && (
          <span className="text-muted-foreground">Checking dates...</span>
        )}
        {!loadingMoreMonths && selectedNights > 0 && (
          <span className="font-medium text-primary tabular-nums">
            {selectedNights} {selectedNights === 1 ? "night" : "nights"}
          </span>
        )}
      </div>

      {/* Month navigation + grids */}
      <div className="p-4">
        <div className="relative mb-3 flex items-center justify-between">
          <button
            type="button"
            disabled={!canGoPrevMonth}
            onClick={() => stepMonth(-1)}
            aria-label="Previous month"
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30 sm:min-h-9 sm:min-w-9"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="M10 3.5 5.5 8 10 12.5" />
            </svg>
          </button>

          <div
            className={cn(
              "grid flex-1 gap-6 text-center text-sm font-semibold text-foreground",
              isTwoMonthLayout ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {visibleMonths.map((m) => (
              <span key={`${m.year}-${m.month}`}>
                {MONTH_NAMES[m.month - 1]} {m.year}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => stepMonth(1)}
            aria-label="Next month"
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted sm:min-h-9 sm:min-w-9"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
        </div>

        <div
          className={cn(
            "grid gap-6",
            isTwoMonthLayout ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {visibleMonths.map((monthBlock) => (
            <div key={`${monthBlock.year}-${monthBlock.month}`}>
              <div className="mb-1.5 grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
                {WEEKDAY_LABELS.map((day) => (
                  <span key={day} className="py-1">
                    {day}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-1">
                {monthBlock.cells.map((cell) => {
                  if (!cell.inCurrentMonth) {
                    return (
                      <span key={cell.ymd} aria-hidden="true" className="h-9" />
                    );
                  }

                  const isPast = cell.ymd < todayManila;
                  const isOccupied = unavailableSet.has(cell.ymd);
                  const isTurnoverCheckOut =
                    phase === "checkOut" &&
                    maxCheckOut !== null &&
                    cell.ymd === maxCheckOut;
                  const isBeyondOccupiedBlock =
                    phase === "checkOut" &&
                    maxCheckOut !== null &&
                    cell.ymd > maxCheckOut;

                  const isDisabled =
                    isPast ||
                    isBeyondOccupiedBlock ||
                    (isOccupied && !isTurnoverCheckOut);

                  const isStart = cell.ymd === activeRangeStart;
                  const isEnd =
                    activeRangeEnd !== null && cell.ymd === activeRangeEnd;
                  const isInRange =
                    activeRangeStart !== "" &&
                    activeRangeEnd !== null &&
                    cell.ymd > activeRangeStart &&
                    cell.ymd < activeRangeEnd;
                  const isToday = cell.ymd === todayManila;

                  const formattedLabel = formatManilaDate(cell.ymd);
                  const ariaLabel = isPast
                    ? `${formattedLabel}, past date`
                    : isTurnoverCheckOut
                      ? `${formattedLabel}, check-out only`
                      : isOccupied || isBeyondOccupiedBlock
                        ? `${formattedLabel}, unavailable`
                        : formattedLabel;

                  return (
                    <button
                      key={cell.ymd}
                      type="button"
                      disabled={isDisabled}
                      aria-label={ariaLabel}
                      aria-pressed={isStart || isEnd}
                      title={
                        isTurnoverCheckOut
                          ? "Available for check-out only"
                          : isOccupied
                            ? "Unavailable"
                            : undefined
                      }
                      onMouseEnter={() => {
                        if (phase === "checkOut" && !isDisabled) {
                          setHoverDate(cell.ymd);
                        }
                      }}
                      onClick={() => handleDayClick(cell.ymd)}
                      className={cn(
                        "relative mx-auto flex h-9 w-full items-center justify-center text-xs tabular-nums transition-colors duration-(--duration-control) ease-(--ease-control)",
                        isStart &&
                          "z-10 rounded-lg bg-primary font-semibold text-primary-foreground",
                        isEnd &&
                          !isStart &&
                          "z-10 rounded-lg bg-primary font-semibold text-primary-foreground",
                        isInRange &&
                          !isStart &&
                          !isEnd &&
                          "bg-accent font-medium text-accent-foreground",
                        !isStart &&
                          !isEnd &&
                          !isInRange &&
                          !isDisabled &&
                          "cursor-pointer rounded-lg text-foreground hover:bg-surface-muted",
                        isTurnoverCheckOut &&
                          !isEnd &&
                          "ring-1 ring-inset ring-control-border",
                        isToday &&
                          !isStart &&
                          !isEnd &&
                          !isDisabled &&
                          "font-semibold text-primary",
                        isDisabled &&
                          "cursor-not-allowed rounded-lg text-muted-foreground/45",
                        (isOccupied || isBeyondOccupiedBlock) &&
                          !isTurnoverCheckOut &&
                          "bg-surface-muted/45 line-through",
                      )}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer legend & actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/50 px-4 py-2.5 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-xs bg-primary"
            />
            <span>Selected</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-xs bg-accent ring-1 ring-inset ring-primary/25"
            />
            <span>In stay</span>
          </span>
          {showUnavailableLegend && (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="rounded-xs bg-surface-muted px-1 text-[10px] text-muted-foreground/70 line-through"
              >
                12
              </span>
              <span>Unavailable</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {phase === "checkOut" && (
            <button
              type="button"
              onClick={() => {
                setPhase("checkIn");
                setHoverDate(null);
              }}
              className="inline-flex min-h-9 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium text-primary hover:bg-accent/60"
            >
              Change check-in
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-control-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export type PublicStayDateRangePickerProps = {
  roomId: string;
  checkIn: string;
  checkOut: string;
  initialUnavailableDates: ReadonlyArray<string>;
  initialLoadedUntil: string;
  onRangeSelect: (nextCheckIn: string, nextCheckOut: string) => void;
  checkInId?: string;
  checkOutId?: string;
  checkInRef?: Ref<HTMLButtonElement>;
  checkOutRef?: Ref<HTMLButtonElement>;
  checkInError?: string | undefined;
  checkOutError?: string | undefined;
  loading?: boolean;
};

/**
 * Interactive public availability range calendar for a specific room.
 * Disables past dates, occupied nights, and any check-out date that would span
 * across occupied nights while permitting same-day check-out turnover.
 */
export function PublicStayDateRangePicker({
  roomId,
  checkIn,
  checkOut,
  initialUnavailableDates,
  initialLoadedUntil,
  onRangeSelect,
  checkInId,
  checkOutId,
  checkInRef,
  checkOutRef,
  checkInError,
  checkOutError,
  loading = false,
}: PublicStayDateRangePickerProps) {
  const generatedId = useId();
  const resolvedCheckInId = checkInId ?? `${generatedId}-check-in`;
  const resolvedCheckOutId = checkOutId ?? `${generatedId}-check-out`;

  const todayManila = useMemo(() => toManilaDate(new Date()), []);
  const todayParts = useMemo(() => parseManilaDate(todayManila), [todayManila]);

  const initialAnchor = useMemo(() => {
    try {
      const parsed = parseManilaDate(checkIn || todayManila);
      if (
        parsed.year < todayParts.year ||
        (parsed.year === todayParts.year && parsed.month < todayParts.month)
      ) {
        return { year: todayParts.year, month: todayParts.month };
      }
      return { year: parsed.year, month: parsed.month };
    } catch {
      return { year: todayParts.year, month: todayParts.month };
    }
  }, [checkIn, todayManila, todayParts]);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"checkIn" | "checkOut">("checkIn");
  const [pendingCheckIn, setPendingCheckIn] = useState<string>(checkIn);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState(initialAnchor.year);
  const [viewMonth, setViewMonth] = useState(initialAnchor.month);
  const [isTwoMonthLayout, setIsTwoMonthLayout] = useState(false);

  const [unavailableDates, setUnavailableDates] = useState<string[]>(() => [
    ...initialUnavailableDates,
  ]);
  const [loadedUntil, setLoadedUntil] = useState<string>(initialLoadedUntil);
  const [loadingMoreMonths, setLoadingMoreMonths] = useState(false);
  const fetchingUntilRef = useRef<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  const unavailableSet = useMemo(
    () => new Set(unavailableDates),
    [unavailableDates],
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setIsTwoMonthLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function ensureCalendarLoadedThrough(year: number, month: number) {
    if (!loadedUntil) return;
    const secondMonth = addMonths(year, month, 1);
    const furthestVisible = getMonthEndYmd(
      isTwoMonthLayout ? secondMonth.year : year,
      isTwoMonthLayout ? secondMonth.month : month,
    );
    if (furthestVisible <= loadedUntil) return;
    if (fetchingUntilRef.current === loadedUntil) return;

    fetchingUntilRef.current = loadedUntil;
    setLoadingMoreMonths(true);
    const params = new URLSearchParams({
      from: loadedUntil,
      days: "120",
    });

    fetch(`/api/public/rooms/${roomId}/calendar?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.unavailableDates)) return;
        setUnavailableDates((prev) => {
          const merged = new Set(prev);
          for (const d of data.unavailableDates as string[]) {
            merged.add(d);
          }
          return Array.from(merged).sort();
        });
        if (typeof data.toDateManila === "string") {
          setLoadedUntil(data.toDateManila);
        }
      })
      .catch(() => {
        // Keep currently loaded dates; server check on selection remains authoritative.
      })
      .finally(() => {
        fetchingUntilRef.current = null;
        setLoadingMoreMonths(false);
      });
  }

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const anchor = containerRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const margin = 12;
      const desiredWidth = isTwoMonthLayout
        ? Math.min(580, viewportW - margin * 2)
        : Math.min(320, viewportW - margin * 2);

      let left = rect.left;
      if (left + desiredWidth > viewportW - margin) {
        left = viewportW - margin - desiredWidth;
      }
      if (left < margin) {
        left = margin;
      }

      const estimatedHeight = 390;
      const spaceBelow = viewportH - rect.bottom;
      const openAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;

      setPopoverStyle({
        position: "fixed",
        left,
        width: desiredWidth,
        ...(openAbove
          ? { bottom: Math.max(margin, viewportH - rect.top + 8) }
          : { top: Math.min(viewportH - margin - 200, rect.bottom + 8) }),
        zIndex: 60,
      });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (
        containerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, isTwoMonthLayout]);

  function openCalendarFor(step: "checkIn" | "checkOut") {
    const startTarget =
      step === "checkOut" && checkIn && !unavailableSet.has(checkIn)
        ? checkIn
        : checkIn || todayManila;
    let targetYear = todayParts.year;
    let targetMonth = todayParts.month;
    try {
      const parsed = parseManilaDate(startTarget);
      if (
        parsed.year > todayParts.year ||
        (parsed.year === todayParts.year && parsed.month >= todayParts.month)
      ) {
        targetYear = parsed.year;
        targetMonth = parsed.month;
      }
    } catch {
      // Fall back to current Manila month.
    }
    setViewYear(targetYear);
    setViewMonth(targetMonth);
    ensureCalendarLoadedThrough(targetYear, targetMonth);

    if (
      step === "checkOut" &&
      checkIn &&
      !unavailableSet.has(checkIn) &&
      checkIn >= todayManila
    ) {
      setPendingCheckIn(checkIn);
      setPhase("checkOut");
    } else {
      setPendingCheckIn(checkIn);
      setPhase("checkIn");
    }
    setHoverDate(null);
    setOpen(true);
  }

  const maxCheckOut = useMemo(() => {
    if (phase !== "checkOut" || !pendingCheckIn) return null;
    return findFirstUnavailableNightAfter(pendingCheckIn, unavailableDates);
  }, [phase, pendingCheckIn, unavailableDates]);

  const canGoPrevMonth =
    viewYear > todayParts.year ||
    (viewYear === todayParts.year && viewMonth > todayParts.month);

  function stepMonth(delta: number) {
    if (delta < 0 && !canGoPrevMonth) return;
    const next = addMonths(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
    ensureCalendarLoadedThrough(next.year, next.month);
  }

  function handleDayClick(ymd: string) {
    if (ymd < todayManila) return;

    if (phase === "checkIn") {
      if (unavailableSet.has(ymd)) return;
      setPendingCheckIn(ymd);
      setPhase("checkOut");
      setHoverDate(null);
      return;
    }

    // phase === "checkOut"
    if (ymd <= pendingCheckIn) {
      if (unavailableSet.has(ymd)) return;
      setPendingCheckIn(ymd);
      setHoverDate(null);
      return;
    }

    if (maxCheckOut && ymd > maxCheckOut) {
      return;
    }
    if (
      isRangeBlockedByUnavailableDates(pendingCheckIn, ymd, unavailableDates)
    ) {
      return;
    }

    setOpen(false);
    setPhase("checkIn");
    setHoverDate(null);
    onRangeSelect(pendingCheckIn, ymd);
  }

  const visibleMonths = useMemo(() => {
    const first = {
      year: viewYear,
      month: viewMonth,
      cells: buildMonthCells(viewYear, viewMonth),
    };
    if (!isTwoMonthLayout) return [first];
    const secondCoords = addMonths(viewYear, viewMonth, 1);
    return [
      first,
      {
        year: secondCoords.year,
        month: secondCoords.month,
        cells: buildMonthCells(secondCoords.year, secondCoords.month),
      },
    ];
  }, [viewYear, viewMonth, isTwoMonthLayout]);

  const previewEnd =
    phase === "checkOut" &&
    hoverDate &&
    hoverDate > pendingCheckIn &&
    (!maxCheckOut || hoverDate <= maxCheckOut)
      ? hoverDate
      : null;

  const activeRangeStart = phase === "checkOut" ? pendingCheckIn : checkIn;
  const activeRangeEnd = phase === "checkOut" ? previewEnd : checkOut;

  const selectedNights = useMemo(() => {
    if (
      !activeRangeStart ||
      !activeRangeEnd ||
      activeRangeEnd <= activeRangeStart
    ) {
      return 0;
    }
    try {
      return diffManilaDays(activeRangeStart, activeRangeEnd);
    } catch {
      return 0;
    }
  }, [activeRangeStart, activeRangeEnd]);

  const checkInDisplay = checkIn ? formatManilaDate(checkIn) : "Select date";
  const checkOutDisplay = checkOut ? formatManilaDate(checkOut) : "Select date";

  return (
    <div ref={containerRef} className="grid gap-1.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <label
            htmlFor={resolvedCheckInId}
            className="text-[13px] leading-4 font-medium text-foreground"
          >
            Check-in
            <span aria-hidden="true" className="ml-1 text-primary">
              *
            </span>
          </label>
          <button
            ref={checkInRef}
            id={resolvedCheckInId}
            type="button"
            disabled={loading}
            aria-expanded={open && phase === "checkIn"}
            aria-describedby={
              checkInError ? `${resolvedCheckInId}-error` : undefined
            }
            onClick={() => openCalendarFor("checkIn")}
            className={cn(
              "flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-control border bg-surface px-3.5 text-left text-sm text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9",
              checkInError
                ? "border-danger"
                : open && phase === "checkIn"
                  ? "border-primary"
                  : "border-control-border",
            )}
          >
            <span className="truncate font-medium tabular-nums">
              {checkInDisplay}
            </span>
            <CalendarGlyph />
          </button>
          {checkInError && (
            <p
              id={`${resolvedCheckInId}-error`}
              role="alert"
              className="flex items-start gap-1.5 text-[13px] leading-4 font-medium text-danger"
            >
              <span
                aria-hidden="true"
                className="mt-px inline-grid size-3.5 shrink-0 place-items-center rounded-full bg-danger text-[10px] leading-none font-semibold text-primary-foreground"
              >
                !
              </span>
              <span>{checkInError}</span>
            </p>
          )}
        </div>

        <div className="grid content-start gap-1.5">
          <label
            htmlFor={resolvedCheckOutId}
            className="text-[13px] leading-4 font-medium text-foreground"
          >
            Check-out
            <span aria-hidden="true" className="ml-1 text-primary">
              *
            </span>
          </label>
          <button
            ref={checkOutRef}
            id={resolvedCheckOutId}
            type="button"
            disabled={loading}
            aria-expanded={open && phase === "checkOut"}
            aria-describedby={
              checkOutError ? `${resolvedCheckOutId}-error` : undefined
            }
            onClick={() => openCalendarFor("checkOut")}
            className={cn(
              "flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-control border bg-surface px-3.5 text-left text-sm text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9",
              checkOutError
                ? "border-danger"
                : open && phase === "checkOut"
                  ? "border-primary"
                  : "border-control-border",
            )}
          >
            <span className="truncate font-medium tabular-nums">
              {checkOutDisplay}
            </span>
            <CalendarGlyph />
          </button>
          {checkOutError && (
            <p
              id={`${resolvedCheckOutId}-error`}
              role="alert"
              className="flex items-start gap-1.5 text-[13px] leading-4 font-medium text-danger"
            >
              <span
                aria-hidden="true"
                className="mt-px inline-grid size-3.5 shrink-0 place-items-center rounded-full bg-danger text-[10px] leading-none font-semibold text-primary-foreground"
              >
                !
              </span>
              <span>{checkOutError}</span>
            </p>
          )}
        </div>
      </div>

      {open &&
        popoverStyle &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose stay dates"
            data-daisy-picker-popover="true"
            style={popoverStyle}
            className={cn(
              "overflow-hidden rounded-2xl text-foreground",
              PUBLIC_BOOKING_CARD_FOCAL,
            )}
          >
            {/* Top status bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/70 px-4 py-2.5 text-xs">
              <span className="font-medium text-foreground">
                {phase === "checkIn"
                  ? "Select check-in date"
                  : maxCheckOut
                    ? `Check-in: ${formatManilaDate(pendingCheckIn)} — check-out up to ${formatManilaDate(maxCheckOut)}`
                    : `Check-in: ${formatManilaDate(pendingCheckIn)} — select check-out`}
              </span>
              {loadingMoreMonths && (
                <span className="text-muted-foreground">Checking dates...</span>
              )}
              {!loadingMoreMonths && selectedNights > 0 && (
                <span className="font-medium text-primary tabular-nums">
                  {selectedNights} {selectedNights === 1 ? "night" : "nights"}
                </span>
              )}
            </div>

            {/* Month navigation + grids */}
            <div className="p-4">
              <div className="relative mb-3 flex items-center justify-between">
                <button
                  type="button"
                  disabled={!canGoPrevMonth}
                  onClick={() => stepMonth(-1)}
                  aria-label="Previous month"
                  className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30 sm:min-h-9 sm:min-w-9"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                  >
                    <path d="M10 3.5 5.5 8 10 12.5" />
                  </svg>
                </button>

                <div
                  className={cn(
                    "grid flex-1 gap-6 text-center text-sm font-semibold text-foreground",
                    isTwoMonthLayout ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
                  {visibleMonths.map((m) => (
                    <span key={`${m.year}-${m.month}`}>
                      {MONTH_NAMES[m.month - 1]} {m.year}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => stepMonth(1)}
                  aria-label="Next month"
                  className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted sm:min-h-9 sm:min-w-9"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                  >
                    <path d="M6 3.5 10.5 8 6 12.5" />
                  </svg>
                </button>
              </div>

              <div
                className={cn(
                  "grid gap-6",
                  isTwoMonthLayout ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                {visibleMonths.map((monthBlock) => (
                  <div key={`${monthBlock.year}-${monthBlock.month}`}>
                    <div className="mb-1.5 grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
                      {WEEKDAY_LABELS.map((day) => (
                        <span key={day} className="py-1">
                          {day}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-y-1">
                      {monthBlock.cells.map((cell) => {
                        if (!cell.inCurrentMonth) {
                          return (
                            <span
                              key={cell.ymd}
                              aria-hidden="true"
                              className="h-9"
                            />
                          );
                        }

                        const isPast = cell.ymd < todayManila;
                        const isOccupied = unavailableSet.has(cell.ymd);
                        const isTurnoverCheckOut =
                          phase === "checkOut" &&
                          maxCheckOut !== null &&
                          cell.ymd === maxCheckOut;
                        const isBeyondOccupiedBlock =
                          phase === "checkOut" &&
                          maxCheckOut !== null &&
                          cell.ymd > maxCheckOut;

                        const isDisabled =
                          isPast ||
                          isBeyondOccupiedBlock ||
                          (isOccupied && !isTurnoverCheckOut);

                        const isStart = cell.ymd === activeRangeStart;
                        const isEnd =
                          activeRangeEnd !== null &&
                          cell.ymd === activeRangeEnd;
                        const isInRange =
                          activeRangeStart !== "" &&
                          activeRangeEnd !== null &&
                          cell.ymd > activeRangeStart &&
                          cell.ymd < activeRangeEnd;
                        const isToday = cell.ymd === todayManila;

                        const formattedLabel = formatManilaDate(cell.ymd);
                        const ariaLabel = isPast
                          ? `${formattedLabel}, past date`
                          : isTurnoverCheckOut
                            ? `${formattedLabel}, check-out only`
                            : isOccupied || isBeyondOccupiedBlock
                              ? `${formattedLabel}, unavailable`
                              : formattedLabel;

                        return (
                          <button
                            key={cell.ymd}
                            type="button"
                            disabled={isDisabled}
                            aria-label={ariaLabel}
                            aria-pressed={isStart || isEnd}
                            title={
                              isTurnoverCheckOut
                                ? "Available for check-out only"
                                : isOccupied
                                  ? "Unavailable"
                                  : undefined
                            }
                            onMouseEnter={() => {
                              if (phase === "checkOut" && !isDisabled) {
                                setHoverDate(cell.ymd);
                              }
                            }}
                            onClick={() => handleDayClick(cell.ymd)}
                            className={cn(
                              "relative mx-auto flex h-9 w-full items-center justify-center text-xs tabular-nums transition-colors duration-(--duration-control) ease-(--ease-control)",
                              isStart &&
                                "z-10 rounded-lg bg-primary font-semibold text-primary-foreground",
                              isEnd &&
                                !isStart &&
                                "z-10 rounded-lg bg-primary font-semibold text-primary-foreground",
                              isInRange &&
                                !isStart &&
                                !isEnd &&
                                "bg-accent font-medium text-accent-foreground",
                              !isStart &&
                                !isEnd &&
                                !isInRange &&
                                !isDisabled &&
                                "cursor-pointer rounded-lg text-foreground hover:bg-surface-muted",
                              isTurnoverCheckOut &&
                                !isEnd &&
                                "ring-1 ring-inset ring-control-border",
                              isToday &&
                                !isStart &&
                                !isEnd &&
                                !isDisabled &&
                                "font-semibold text-primary",
                              isDisabled &&
                                "cursor-not-allowed rounded-lg text-muted-foreground/45",
                              (isOccupied || isBeyondOccupiedBlock) &&
                                !isTurnoverCheckOut &&
                                "bg-surface-muted/45 line-through",
                            )}
                          >
                            {cell.day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer legend & actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/50 px-4 py-2.5 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-xs bg-primary"
                  />
                  <span>Selected</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-xs bg-accent ring-1 ring-inset ring-primary/25"
                  />
                  <span>In stay</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="rounded-xs bg-surface-muted px-1 text-[10px] text-muted-foreground/70 line-through"
                  >
                    12
                  </span>
                  <span>Unavailable</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {phase === "checkOut" && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhase("checkIn");
                      setHoverDate(null);
                    }}
                    className="inline-flex min-h-9 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium text-primary hover:bg-accent/60"
                  >
                    Change check-in
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-control-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-muted"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export type StayDateRangePickerProps = {
  checkIn: string;
  checkOut: string;
  unavailableDates?: ReadonlyArray<string>;
  showUnavailableLegend?: boolean;
  onRangeSelect: (nextCheckIn: string, nextCheckOut: string) => void;
  onOpenChange?: (open: boolean) => void;
  checkInId?: string;
  checkOutId?: string;
  checkInLabel?: string;
  checkOutLabel?: string;
  checkInName?: string;
  checkOutName?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Interactive side-by-side Check-in / Check-out range calendar picker backed
 * by `PublicStayDateRangeCalendar` in a fixed portal popover. Accepts local
 * `unavailableDates` directly so it works seamlessly both online and offline
 * inside Owner dialogs.
 */
export function StayDateRangePicker({
  checkIn,
  checkOut,
  unavailableDates = [],
  showUnavailableLegend = true,
  onRangeSelect,
  onOpenChange,
  checkInId,
  checkOutId,
  checkInLabel = "Check-in date",
  checkOutLabel = "Check-out date",
  checkInName,
  checkOutName,
  disabled = false,
  className,
}: StayDateRangePickerProps) {
  const generatedId = useId();
  const resolvedCheckInId = checkInId ?? `${generatedId}-check-in`;
  const resolvedCheckOutId = checkOutId ?? `${generatedId}-check-out`;

  const [open, setOpen] = useState(false);
  const [initialPhase, setInitialPhase] = useState<"checkIn" | "checkOut">(
    "checkIn",
  );
  const [openSession, setOpenSession] = useState(0);
  const [isTwoMonthLayout, setIsTwoMonthLayout] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  function setOpenState(nextOpen: boolean) {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setIsTwoMonthLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const anchor = containerRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const margin = 12;
      const desiredWidth = isTwoMonthLayout
        ? Math.min(580, viewportW - margin * 2)
        : Math.min(320, viewportW - margin * 2);

      let left = rect.left;
      if (left + desiredWidth > viewportW - margin) {
        left = viewportW - margin - desiredWidth;
      }
      if (left < margin) {
        left = margin;
      }

      const estimatedHeight = 390;
      const spaceBelow = viewportH - rect.bottom;
      const openAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;

      setPopoverStyle({
        position: "fixed",
        left,
        width: desiredWidth,
        ...(openAbove
          ? { bottom: Math.max(margin, viewportH - rect.top + 8) }
          : { top: Math.min(viewportH - margin - 200, rect.bottom + 8) }),
        zIndex: 60,
      });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (
        containerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      onOpenChange?.(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        onOpenChange?.(false);
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, isTwoMonthLayout, onOpenChange]);

  function openFor(step: "checkIn" | "checkOut") {
    if (disabled) return;
    setInitialPhase(step);
    setOpenSession((prev) => prev + 1);
    setOpenState(true);
  }

  const checkInDisplay = checkIn ? formatManilaDate(checkIn) : "Select date";
  const checkOutDisplay = checkOut ? formatManilaDate(checkOut) : "Select date";

  return (
    <div ref={containerRef} className={cn("grid gap-1.5", className)}>
      {checkInName && (
        <input type="hidden" name={checkInName} value={checkIn} />
      )}
      {checkOutName && (
        <input type="hidden" name={checkOutName} value={checkOut} />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <label
            htmlFor={resolvedCheckInId}
            className="text-[13px] leading-4 font-medium text-foreground"
          >
            {checkInLabel}
            <span aria-hidden="true" className="ml-1 text-primary">
              *
            </span>
          </label>
          <button
            id={resolvedCheckInId}
            type="button"
            disabled={disabled}
            aria-expanded={open && initialPhase === "checkIn"}
            onClick={() => openFor("checkIn")}
            className={cn(
              "flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-control border bg-surface px-3.5 text-left text-sm text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9",
              open && initialPhase === "checkIn"
                ? "border-primary ring-2 ring-primary/15"
                : "border-control-border hover:border-foreground/30",
            )}
          >
            <span className="truncate font-medium tabular-nums">
              {checkInDisplay}
            </span>
            <CalendarGlyph />
          </button>
        </div>

        <div className="grid content-start gap-1.5">
          <label
            htmlFor={resolvedCheckOutId}
            className="text-[13px] leading-4 font-medium text-foreground"
          >
            {checkOutLabel}
            <span aria-hidden="true" className="ml-1 text-primary">
              *
            </span>
          </label>
          <button
            id={resolvedCheckOutId}
            type="button"
            disabled={disabled}
            aria-expanded={open && initialPhase === "checkOut"}
            onClick={() => openFor("checkOut")}
            className={cn(
              "flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-control border bg-surface px-3.5 text-left text-sm text-foreground transition-colors duration-(--duration-control) ease-(--ease-control) disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9",
              open && initialPhase === "checkOut"
                ? "border-primary ring-2 ring-primary/15"
                : "border-control-border hover:border-foreground/30",
            )}
          >
            <span className="truncate font-medium tabular-nums">
              {checkOutDisplay}
            </span>
            <CalendarGlyph />
          </button>
        </div>
      </div>

      {open &&
        popoverStyle &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose stay dates"
            style={popoverStyle}
          >
            <PublicStayDateRangeCalendar
              key={openSession}
              checkIn={checkIn}
              checkOut={checkOut}
              initialPhase={initialPhase}
              unavailableDates={unavailableDates}
              showUnavailableLegend={showUnavailableLegend}
              onRangeSelect={(nextIn, nextOut) => {
                setOpenState(false);
                onRangeSelect(nextIn, nextOut);
              }}
              onClose={() => setOpenState(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function CalendarGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-primary"
    >
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" />
      <path d="M6 2v3M12 2v3M2.5 7.5h13" />
    </svg>
  );
}
