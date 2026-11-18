"use client";

import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type TabsVariant = "underline" | "segmented";

type TabsContextValue = {
  baseId: string;
  value: string;
  onValueChange: (value: string) => void;
  variant: TabsVariant;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error("Tabs primitives must be rendered inside <Tabs>.");
  }
  return ctx;
}

type TabsProps = ComponentProps<"div"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: TabsVariant;
};

/**
 * Accessible WAI-ARIA tab container supporting controlled or uncontrolled
 * state, keyboard arrow/Home/End switching, and hairline underline or segmented
 * surface variants.
 */
export function Tabs({
  value,
  defaultValue = "",
  onValueChange,
  variant = "underline",
  className,
  children,
  ...props
}: TabsProps) {
  const baseId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const currentValue = value !== undefined ? value : uncontrolled;

  function handleChange(next: string) {
    if (value === undefined) {
      setUncontrolled(next);
    }
    onValueChange?.(next);
  }

  return (
    <TabsContext.Provider
      value={{
        baseId,
        value: currentValue,
        onValueChange: handleChange,
        variant,
      }}
    >
      <div {...props} className={cn("grid min-w-0 gap-5", className)}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  const { variant } = useTabsContext();
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const container = listRef.current;
    if (!container) return;

    const triggers = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]:not([disabled])',
      ),
    );
    if (triggers.length === 0) return;

    const currentIndex = triggers.findIndex(
      (el) => el === document.activeElement,
    );
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % triggers.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + triggers.length) % triggers.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = triggers.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const target = triggers[nextIndex];
    target?.focus();
    target?.click();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      {...props}
      className={cn(
        "flex max-w-full items-center overflow-x-auto overscroll-x-contain",
        variant === "underline"
          ? "gap-1 border-b border-border"
          : "gap-1 rounded-panel border border-border bg-surface-muted p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

type TabsTriggerProps = Omit<ComponentProps<"button">, "value"> & {
  value: string;
  badge?: ReactNode;
};

export function TabsTrigger({
  value,
  badge,
  className,
  children,
  onClick,
  ...props
}: TabsTriggerProps) {
  const {
    baseId,
    value: activeValue,
    onValueChange,
    variant,
  } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      {...props}
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={isActive}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      onClick={(event) => {
        onValueChange(value);
        onClick?.(event);
      }}
      className={cn(
        "relative inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color] duration-(--duration-control) ease-(--ease-control) disabled:cursor-not-allowed disabled:opacity-50",
        variant === "underline"
          ? cn(
              "rounded-t-control px-4 py-2.5",
              isActive
                ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                : "text-muted-foreground hover:bg-surface-muted/60 hover:text-foreground",
            )
          : cn(
              "rounded-control border px-3.5 py-2",
              isActive
                ? "border-border bg-surface text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ),
        className,
      )}
    >
      <span>{children}</span>
      {badge !== undefined && badge !== null && (
        <span
          className={cn(
            "inline-flex items-center rounded-control px-1.5 py-0.5 text-xs leading-none tabular-nums",
            isActive
              ? "bg-accent text-accent-foreground"
              : "bg-surface-muted text-muted-foreground",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

type TabsContentProps = ComponentProps<"div"> & {
  value: string;
  forceMount?: boolean;
};

export function TabsContent({
  value,
  forceMount = false,
  className,
  children,
  ...props
}: TabsContentProps) {
  const { baseId, value: activeValue } = useTabsContext();
  const isActive = activeValue === value;

  if (!isActive && !forceMount) {
    return null;
  }

  return (
    <div
      {...props}
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      hidden={!isActive}
      className={cn("min-w-0 outline-none", !isActive && "hidden", className)}
    >
      {children}
    </div>
  );
}
