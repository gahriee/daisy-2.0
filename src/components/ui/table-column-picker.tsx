"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { CountPill } from "./badge";

export type TableColumnOption<TKey extends string> = {
  key: TKey;
  label: string;
  group?: string;
};

export function FilterToggleButton({
  open,
  activeCount = 0,
  onToggle,
  controlsId,
}: {
  open: boolean;
  activeCount?: number;
  onToggle: () => void;
  controlsId?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controlsId}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-control border px-3 text-sm font-medium transition-colors sm:min-h-9",
        open || activeCount > 0
          ? "border-primary/40 bg-accent/40 text-foreground"
          : "border-control-border bg-surface text-foreground hover:bg-surface-muted",
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 shrink-0 text-muted-foreground"
      >
        <path d="M3.5 5.5h13" />
        <path d="M6 10h8" />
        <path d="M8.5 14.5h3" />
      </svg>
      <span>Filters</span>
      {activeCount > 0 && <CountPill tone="info">{activeCount}</CountPill>}
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          open && "rotate-180",
        )}
      >
        <path d="m6 8 4 4 4-4" />
      </svg>
    </button>
  );
}

export function TableColumnPicker<TKey extends string>({
  options,
  visibleKeys,
  defaultKeys,
  onChange,
  label = "Columns",
}: {
  options: readonly TableColumnOption<TKey>[];
  visibleKeys: readonly TKey[];
  defaultKeys: readonly TKey[];
  onChange: (nextKeys: TKey[]) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const isDefault =
    visibleKeys.length === defaultKeys.length &&
    defaultKeys.every((key) => visibleKeys.includes(key));

  const groups = Array.from(
    new Set(options.map((opt) => opt.group ?? "Columns")),
  );

  function toggleKey(key: TKey) {
    if (visibleKeys.includes(key)) {
      onChange(visibleKeys.filter((k) => k !== key));
    } else {
      onChange([...visibleKeys, key]);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-control border px-3 text-sm font-medium transition-colors sm:min-h-9",
          open || !isDefault
            ? "border-primary/40 bg-accent/40 text-foreground"
            : "border-control-border bg-surface text-foreground hover:bg-surface-muted",
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0 text-muted-foreground"
        >
          <rect x="3" y="4" width="14" height="12" rx="1.75" />
          <path d="M8 4v12" />
          <path d="M12.5 4v12" />
        </svg>
        <span>{label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        >
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose table columns"
          className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-panel border border-border bg-surface p-3.5 shadow-lg"
        >
          <div className="grid gap-3.5">
            {groups.map((group) => {
              const groupOptions = options.filter(
                (opt) => (opt.group ?? "Columns") === group,
              );
              return (
                <div key={group} className="grid gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {group}
                  </span>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {groupOptions.map((opt) => {
                      const checked = visibleKeys.includes(opt.key);
                      return (
                        <label
                          key={opt.key}
                          className="flex cursor-pointer items-center gap-2 text-sm text-foreground select-none"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleKey(opt.key)}
                            className="size-4 cursor-pointer rounded border-control-border accent-primary"
                          />
                          <span className="truncate">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
            <button
              type="button"
              disabled={isDefault}
              onClick={() => onChange([...defaultKeys])}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset columns
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
