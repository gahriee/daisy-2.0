"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type RowActionItem = {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "default" | "danger";
};

type RowActionMenuProps = {
  items: readonly RowActionItem[];
  label: string;
};

type MenuCoords = {
  top?: number;
  bottom?: number;
  right: number;
};

function MoreHorizontalIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="size-4 shrink-0"
    >
      <circle cx="3" cy="8" r="1.35" />
      <circle cx="8" cy="8" r="1.35" />
      <circle cx="13" cy="8" r="1.35" />
    </svg>
  );
}

/**
 * Renders row actions cleanly in table cells: `"—"` when none are available,
 * the direct single action control when one exists, or a portal-positioned
 * `...` overflow dropdown menu when multiple actions apply.
 */
export function RowActionMenu({ items, label }: RowActionMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const focusTargetRef = useRef<"first" | "last">("first");

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords>({ top: 0, right: 8 });

  useEffect(() => {
    if (!open) return;

    function getEnabledItems(): HTMLElement[] {
      if (!menuRef.current) return [];
      return Array.from(
        menuRef.current.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])',
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

  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">&mdash;</span>;
  }

  if (items.length === 1) {
    const single = items[0];
    if (!single) {
      return <span className="text-xs text-muted-foreground">&mdash;</span>;
    }

    const singleDangerClass =
      single.tone === "danger" ? "text-danger" : undefined;

    if (single.href) {
      return (
        <Link
          href={single.href}
          className={buttonClasses({
            variant: "secondary",
            size: "sm",
            className: singleDangerClass,
          })}
        >
          {single.label}
        </Link>
      );
    }

    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={singleDangerClass}
        loading={Boolean(single.busy)}
        disabled={Boolean(single.disabled)}
        onClick={single.onSelect}
      >
        {single.label}
      </Button>
    );
  }

  const anyBusy = items.some((item) => item.busy);

  function computeMenuPosition(): MenuCoords {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return { top: 0, right: 8 };

    const estimatedHeight = items.length * 38 + 14;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward =
      spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    const right = Math.max(8, window.innerWidth - rect.right);

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
        '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])',
      ),
    );
    if (enabled.length === 0) return;

    const currentIndex = enabled.indexOf(document.activeElement as HTMLElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = enabled[(currentIndex + 1) % enabled.length];
      next?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev =
        enabled[(currentIndex - 1 + enabled.length) % enabled.length];
      prev?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      enabled[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      enabled[enabled.length - 1]?.focus();
    }
  }

  return (
    <div className="inline-flex justify-end">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={anyBusy}
        aria-busy={anyBusy || undefined}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openMenu("first");
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
          open && "bg-surface-muted text-foreground",
        )}
      >
        <MoreHorizontalIcon />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={handleMenuKeyDown}
            style={{
              position: "fixed",
              top: coords.top,
              bottom: coords.bottom,
              right: coords.right,
              zIndex: 50,
            }}
            className="min-w-48 max-w-[calc(100vw-1rem)] rounded-panel border border-border bg-surface p-1.5 shadow-[0_12px_28px_-16px_rgb(34_34_34/0.18)]"
          >
            <div className="grid gap-0.5">
              {items.map((item) => {
                const isDanger = item.tone === "danger";
                const itemClasses = cn(
                  "flex min-h-9 w-full items-center rounded-control px-3 py-1.5 text-left text-sm leading-5 transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
                  isDanger ? "text-danger" : "text-foreground",
                );

                if (item.href) {
                  return (
                    <Link
                      key={item.id}
                      role="menuitem"
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={itemClasses}
                    >
                      {item.label}
                    </Link>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled || item.busy}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect?.();
                    }}
                    className={cn(
                      itemClasses,
                      "cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
