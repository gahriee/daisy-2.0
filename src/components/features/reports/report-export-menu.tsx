"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  REPORT_EXPORT_DOCUMENT_FORMATS,
  REPORT_EXPORT_FORMAT_DESCRIPTIONS,
  REPORT_EXPORT_FORMAT_LABELS,
  type ReportExportDocumentFormat,
} from "@/features/reports/schemas";
import { cn } from "@/lib/cn";

type MenuCoords = {
  top?: number;
  bottom?: number;
  right: number;
};

const MENU_WIDTH_PX = 256;

function ExportIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3.25v9" />
      <path d="m6.5 9.25 3.5 3.5 3.5-3.5" />
      <path d="M4 14.5v1.25A1.25 1.25 0 0 0 5.25 17h9.5A1.25 1.25 0 0 0 16 15.75V14.5" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "size-3.5 shrink-0 transition-transform duration-(--duration-control) ease-(--ease-control) motion-reduce:transition-none",
        open && "rotate-180",
      )}
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

function FormatIcon({ format }: { format: ReportExportDocumentFormat }) {
  if (format === "xlsx") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 shrink-0 text-success"
      >
        <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.75" />
        <path d="M2.25 6.25h11.5M2.25 10h11.5M6.25 6.25v7.5" />
      </svg>
    );
  }
  if (format === "docx") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 shrink-0 text-info"
      >
        <path d="M3.75 2.25h6.25L13 5.25v8.5a1 1 0 0 1-1 1h-8.25a1 1 0 0 1-1-1V3.25a1 1 0 0 1 1-1Z" />
        <path d="M5.25 8.25h5.5M5.25 11h4" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-primary"
    >
      <path d="M3.75 2.25h6.25L13 5.25v8.5a1 1 0 0 1-1 1h-8.25a1 1 0 0 1-1-1V3.25a1 1 0 0 1 1-1Z" />
      <path d="M9.75 2.25v3h3M5.5 9.25h5M5.5 11.75h3" />
    </svg>
  );
}

/**
 * Accessible "Export" menu button offering Excel (`.xlsx`), Word (`.docx`),
 * and PDF (`.pdf`) report exports generated from Daisy's shared report template.
 */
export function ReportExportMenu({
  reportLabel,
  disabled = false,
  exportingFormat,
  onSelectFormat,
}: {
  reportLabel: string;
  disabled?: boolean;
  exportingFormat: ReportExportDocumentFormat | null;
  onSelectFormat: (format: ReportExportDocumentFormat) => void;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const focusTargetRef = useRef<"first" | "last">("first");

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords>({ top: 0, right: 8 });
  const busy = exportingFormat !== null;

  useEffect(() => {
    if (!open) return;

    function getEnabledItems(): HTMLElement[] {
      if (!menuRef.current) return [];
      return Array.from(
        menuRef.current.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled])',
        ),
      );
    }

    const focusFrame = window.requestAnimationFrame(() => {
      const enabled = getEnabledItems();
      if (enabled.length === 0) return;
      const target =
        focusTargetRef.current === "last"
          ? enabled[enabled.length - 1]
          : enabled[0];
      target?.focus();
    });

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === "Tab") {
        setOpen(false);
      }
    }

    function handleViewportChange() {
      setOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  function computeMenuPosition(): MenuCoords {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return { top: 0, right: 8 };

    const estimatedHeight = 196;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward =
      spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    const maxRight = Math.max(8, window.innerWidth - MENU_WIDTH_PX - 8);
    const right = Math.min(
      Math.max(8, window.innerWidth - rect.right),
      maxRight,
    );

    return openUpward
      ? { bottom: window.innerHeight - rect.top + 6, right }
      : { top: rect.bottom + 6, right };
  }

  function openMenu(initialFocus: "first" | "last" = "first") {
    focusTargetRef.current = initialFocus;
    setCoords(computeMenuPosition());
    setOpen(true);
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu("last");
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!menuRef.current) return;
    const enabled = Array.from(
      menuRef.current.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ),
    );
    if (enabled.length === 0) return;

    const currentIndex = enabled.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      enabled[(currentIndex + 1) % enabled.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      enabled[(currentIndex - 1 + enabled.length) % enabled.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      enabled[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      enabled[enabled.length - 1]?.focus();
    }
  }

  return (
    <div className="inline-flex">
      <Button
        ref={triggerRef}
        type="button"
        variant="primary"
        size="md"
        loading={busy}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openMenu("first");
          }
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {!busy && <ExportIcon />}
        <span>
          {exportingFormat
            ? `Exporting ${REPORT_EXPORT_FORMAT_LABELS[exportingFormat]}...`
            : "Export"}
        </span>
        {!busy && <ChevronDownIcon open={open} />}
      </Button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Export ${reportLabel}`}
            onKeyDown={handleMenuKeyDown}
            style={{
              position: "fixed",
              top: coords.top,
              bottom: coords.bottom,
              right: coords.right,
              zIndex: 50,
            }}
            className="w-64 max-w-[calc(100vw-1rem)] rounded-panel border border-border bg-surface p-1.5 shadow-[0_14px_32px_-16px_rgb(34_34_34/0.18)]"
          >
            <div className="border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Export {reportLabel}
            </div>
            <div className="grid gap-0.5 pt-1">
              {REPORT_EXPORT_DOCUMENT_FORMATS.map((format) => (
                <button
                  key={format}
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setOpen(false);
                    onSelectFormat(format);
                  }}
                  className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-control px-3 py-2 text-left transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FormatIcon format={format} />
                  <span className="grid gap-0.5">
                    <span className="text-sm leading-tight font-medium text-foreground">
                      {REPORT_EXPORT_FORMAT_LABELS[format]}
                    </span>
                    <span className="text-xs leading-tight text-muted-foreground">
                      {REPORT_EXPORT_FORMAT_DESCRIPTIONS[format]}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
