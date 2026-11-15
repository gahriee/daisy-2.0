"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import {
  compactSingleLineSizingClasses,
  controlBaseClasses,
} from "./control-styles";
import { useFormDensity } from "./form-density";

export type SelectProps = ComponentProps<"select"> & {
  variant?: "default" | "compact" | "filter";
};

type ParsedOption = {
  domId: string;
  value: string;
  label: string;
  disabled: boolean;
  index: number;
};

type ParsedSection = {
  id: string;
  label?: string;
  options: ParsedOption[];
};

type ListboxCoords = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
};

type OptionProps = {
  value?: string | number | readonly string[];
  disabled?: boolean;
  children?: ReactNode;
};

type OptgroupProps = {
  label?: string;
  disabled?: boolean;
  children?: ReactNode;
};

function extractNodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractNodeText).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractNodeText(node.props.children);
  }
  return "";
}

function normalizePropValue(
  raw: string | number | readonly string[] | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    return raw[0] !== undefined ? String(raw[0]) : "";
  }
  return String(raw);
}

function parseSelectChildren(
  children: ReactNode,
  baseId: string,
): { sections: ParsedSection[]; allOptions: ParsedOption[] } {
  const sections: ParsedSection[] = [];
  const allOptions: ParsedOption[] = [];

  function appendOption(
    optProps: OptionProps,
    inheritedDisabled: boolean,
    targetSection: ParsedSection,
  ) {
    const label = extractNodeText(optProps.children)
      .replace(/\s+/g, " ")
      .trim();
    const rawValue = normalizePropValue(optProps.value);
    const value = rawValue !== undefined ? rawValue : label;
    const disabled = inheritedDisabled || Boolean(optProps.disabled);
    const index = allOptions.length;
    const entry: ParsedOption = {
      domId: `${baseId}-opt-${index}`,
      value,
      label,
      disabled,
      index,
    };
    allOptions.push(entry);
    targetSection.options.push(entry);
  }

  function ensureUngroupedSection(): ParsedSection {
    const last = sections[sections.length - 1];
    if (last && last.label === undefined) {
      return last;
    }
    const created: ParsedSection = {
      id: `${baseId}-sec-${sections.length}`,
      options: [],
    };
    sections.push(created);
    return created;
  }

  function walkGroupChildren(
    groupChildren: ReactNode,
    groupDisabled: boolean,
    section: ParsedSection,
  ) {
    for (const child of Children.toArray(groupChildren)) {
      if (!isValidElement(child)) continue;
      if (child.type === Fragment) {
        const fragProps = child.props as { children?: ReactNode };
        walkGroupChildren(fragProps.children, groupDisabled, section);
        continue;
      }
      if (child.type === "option") {
        appendOption(child.props as OptionProps, groupDisabled, section);
      }
    }
  }

  function walkRoot(nodes: ReactNode) {
    for (const child of Children.toArray(nodes)) {
      if (!isValidElement(child)) continue;
      if (child.type === Fragment) {
        const fragProps = child.props as { children?: ReactNode };
        walkRoot(fragProps.children);
        continue;
      }
      if (child.type === "option") {
        const section = ensureUngroupedSection();
        appendOption(child.props as OptionProps, false, section);
        continue;
      }
      if (child.type === "optgroup") {
        const groupProps = child.props as OptgroupProps;
        const groupSection: ParsedSection = {
          id: `${baseId}-sec-${sections.length}`,
          ...(groupProps.label !== undefined
            ? { label: groupProps.label }
            : {}),
          options: [],
        };
        walkGroupChildren(
          groupProps.children,
          Boolean(groupProps.disabled),
          groupSection,
        );
        if (groupSection.options.length > 0) {
          sections.push(groupSection);
        }
      }
    }
  }

  walkRoot(children);

  return { sections, allOptions };
}

/**
 * Custom accessible select control rendering a branded floating options listbox
 * while preserving native `<Select><option /></Select>` authoring ergonomics
 * and form submission compatibility.
 */
export function Select({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled = false,
  required = false,
  variant,
  className,
  children,
  tabIndex,
  title,
  autoFocus,
  onKeyDown,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: SelectProps) {
  const formDensity = useFormDensity();
  const resolvedVariant = variant ?? formDensity;
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const listboxId = `${baseId}-listbox`;

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const typeaheadRef = useRef<{ query: string; timer: number | undefined }>({
    query: "",
    timer: undefined,
  });

  const parsed = useMemo(
    () => parseSelectChildren(children, baseId),
    [children, baseId],
  );

  const [uncontrolledValue, setUncontrolledValue] = useState<string>(() => {
    const initialDefault = normalizePropValue(defaultValue);
    if (initialDefault !== undefined) return initialDefault;
    const firstEnabled = parsed.allOptions.find((option) => !option.disabled);
    return firstEnabled?.value ?? parsed.allOptions[0]?.value ?? "";
  });

  const normalizedControlled = normalizePropValue(value);
  const isControlled = normalizedControlled !== undefined;
  const currentValue = isControlled ? normalizedControlled : uncontrolledValue;

  const selectedOption = useMemo(
    () =>
      parsed.allOptions.find((option) => option.value === currentValue) ?? null,
    [parsed.allOptions, currentValue],
  );

  const displayOption =
    selectedOption ??
    parsed.allOptions.find((option) => !option.disabled) ??
    parsed.allOptions[0] ??
    null;

  const displayLabel = displayOption?.label ?? "Select an option";
  const isPlaceholder = Boolean(
    selectedOption?.disabled && selectedOption.value === "",
  );

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [coords, setCoords] = useState<ListboxCoords>({
    top: 0,
    left: 0,
    minWidth: variant === "compact" ? 112 : 180,
    maxWidth: 360,
    maxHeight: 288,
  });

  useEffect(() => {
    const typeahead = typeaheadRef.current;
    return () => {
      if (typeahead.timer !== undefined) {
        window.clearTimeout(typeahead.timer);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === "Tab") {
        setOpen(false);
      }
    }

    function handleScroll(event: Event) {
      const target = event.target as Node | null;
      if (target && listboxRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleResize() {
      setOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleWindowKeyDown, true);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleWindowKeyDown, true);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  function computeListboxPosition(): ListboxCoords {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return {
        top: 0,
        left: 8,
        minWidth: variant === "compact" ? 112 : 180,
        maxWidth: 360,
        maxHeight: 288,
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const minMenuWidth =
      variant === "compact" ? Math.max(rect.width, 112) : rect.width;

    const rowHeight = variant === "default" ? 42 : 38;
    const groupHeaderCount = parsed.sections.filter((s) =>
      Boolean(s.label),
    ).length;
    const estimatedHeight = Math.min(
      288,
      Math.max(
        48,
        parsed.allOptions.length * rowHeight + groupHeaderCount * 30 + 16,
      ),
    );

    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const availableHeight = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(288, Math.max(88, availableHeight));

    const fitsFromLeft = rect.left + minMenuWidth <= viewportWidth - 8;
    const left = fitsFromLeft ? Math.max(8, rect.left) : undefined;
    const right = fitsFromLeft
      ? undefined
      : Math.max(8, viewportWidth - rect.right);
    const availableWidth = fitsFromLeft
      ? viewportWidth - Math.max(8, rect.left) - 8
      : rect.right - 8;
    const maxWidth = Math.max(minMenuWidth, Math.min(420, availableWidth));

    return {
      ...(openUpward
        ? { bottom: viewportHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
      ...(left !== undefined ? { left } : {}),
      ...(right !== undefined ? { right } : {}),
      minWidth: minMenuWidth,
      maxWidth,
      maxHeight,
    };
  }

  function findFirstEnabledIndex(): number {
    return parsed.allOptions.findIndex((option) => !option.disabled);
  }

  function findLastEnabledIndex(): number {
    for (let i = parsed.allOptions.length - 1; i >= 0; i -= 1) {
      if (!parsed.allOptions[i]?.disabled) return i;
    }
    return -1;
  }

  function scrollOptionIntoView(index: number) {
    const option = parsed.allOptions[index];
    if (!option) return;
    window.requestAnimationFrame(() => {
      document
        .getElementById(option.domId)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function openMenu(mode: "selected" | "first" | "last") {
    if (disabled) return;
    let initial = -1;
    if (mode === "selected" && selectedOption && !selectedOption.disabled) {
      initial = selectedOption.index;
    } else if (mode === "last") {
      initial = findLastEnabledIndex();
    } else {
      initial = findFirstEnabledIndex();
    }
    if (initial < 0) {
      initial = 0;
    }
    setActiveIndex(initial);
    setCoords(computeListboxPosition());
    setOpen(true);
    scrollOptionIntoView(initial);
  }

  function commitSelection(option: ParsedOption) {
    if (option.disabled || disabled) return;

    if (!isControlled) {
      setUncontrolledValue(option.value);
    }

    if (onChange) {
      const target = {
        value: option.value,
        name: name ?? "",
        id: baseId,
      } as unknown as EventTarget & HTMLSelectElement;
      const syntheticEvent = {
        target,
        currentTarget: target,
        type: "change",
        bubbles: true,
        cancelable: false,
        defaultPrevented: false,
        preventDefault: () => {},
        stopPropagation: () => {},
        isDefaultPrevented: () => false,
        isPropagationStopped: () => false,
        persist: () => {},
      } as unknown as ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }

    setOpen(false);
    triggerRef.current?.focus();
  }

  function stepActive(delta: 1 | -1) {
    const total = parsed.allOptions.length;
    if (total === 0) return;

    let cursor = activeIndex;
    for (let step = 0; step < total; step += 1) {
      cursor += delta;
      if (cursor < 0 || cursor >= total) return;
      const candidate = parsed.allOptions[cursor];
      if (candidate && !candidate.disabled) {
        setActiveIndex(cursor);
        scrollOptionIntoView(cursor);
        return;
      }
    }
  }

  function handleTypeahead(char: string) {
    const enabled = parsed.allOptions.filter((option) => !option.disabled);
    if (enabled.length === 0) return;

    if (typeaheadRef.current.timer !== undefined) {
      window.clearTimeout(typeaheadRef.current.timer);
    }
    const nextQuery = `${typeaheadRef.current.query}${char.toLowerCase()}`;
    typeaheadRef.current.query = nextQuery;
    typeaheadRef.current.timer = window.setTimeout(() => {
      typeaheadRef.current.query = "";
      typeaheadRef.current.timer = undefined;
    }, 550);

    const anchorIndex = open
      ? activeIndex
      : (selectedOption?.index ?? parsed.allOptions[0]?.index ?? -1);

    const ordered = [
      ...parsed.allOptions.slice(anchorIndex + 1),
      ...parsed.allOptions.slice(0, anchorIndex + 1),
    ].filter((option) => !option.disabled);

    const match =
      ordered.find((option) =>
        option.label.toLowerCase().startsWith(nextQuery),
      ) ??
      (nextQuery.length > 1
        ? ordered.find((option) =>
            option.label.toLowerCase().startsWith(char.toLowerCase()),
          )
        : undefined);

    if (!match) return;

    if (open) {
      setActiveIndex(match.index);
      scrollOptionIntoView(match.index);
    } else {
      commitSelection(match);
    }
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(event as unknown as ReactKeyboardEvent<HTMLSelectElement>);
    if (event.defaultPrevented || disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openMenu("selected");
      } else {
        stepActive(1);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu("last");
      } else {
        stepActive(-1);
      }
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      if (!open) {
        openMenu("first");
      } else {
        const first = findFirstEnabledIndex();
        if (first >= 0) {
          setActiveIndex(first);
          scrollOptionIntoView(first);
        }
      }
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      if (!open) {
        openMenu("last");
      } else {
        const last = findLastEnabledIndex();
        if (last >= 0) {
          setActiveIndex(last);
          scrollOptionIntoView(last);
        }
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      if (event.key === " " && typeaheadRef.current.query.length > 0) {
        event.preventDefault();
        handleTypeahead(" ");
        return;
      }
      event.preventDefault();
      if (!open) {
        openMenu("selected");
      } else {
        const targetOption = parsed.allOptions[activeIndex];
        if (targetOption && !targetOption.disabled) {
          commitSelection(targetOption);
        } else {
          setOpen(false);
        }
      }
      return;
    }

    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      handleTypeahead(event.key);
    }
  }

  const activeOption = open ? parsed.allOptions[activeIndex] : undefined;

  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center",
        variant === "compact" ? "w-auto inline-flex" : "w-full",
      )}
    >
      {name && (
        <input
          type="hidden"
          name={name}
          value={currentValue}
          disabled={Boolean(disabled)}
        />
      )}

      <button
        ref={triggerRef}
        id={baseId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && activeOption ? activeOption.domId : undefined
        }
        aria-required={required || undefined}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={Boolean(disabled)}
        tabIndex={tabIndex}
        title={title}
        autoFocus={autoFocus}
        data-open={open ? "true" : undefined}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openMenu("selected");
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          controlBaseClasses,
          resolvedVariant === "compact"
            ? "inline-flex min-h-9 w-auto min-w-[4.5rem] cursor-pointer items-center justify-between gap-2 py-1.5 pr-2.5 pl-3 text-left text-sm leading-5 font-medium tabular-nums not-disabled:hover:border-foreground/35"
            : cn(
                "flex w-full cursor-pointer items-center justify-between gap-2 pr-3 pl-3 text-left",
                compactSingleLineSizingClasses,
              ),
          "not-disabled:data-[open=true]:border-primary forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-[Highlight]",
          className,
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            isPlaceholder && "text-muted-foreground",
          )}
        >
          {displayLabel}
        </span>

        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-(--duration-control) ease-(--ease-control)",
            open ? "rotate-180 text-foreground" : "text-muted-foreground",
            disabled && "opacity-50",
          )}
        >
          <path
            d="M4.25 6.25 8 10l3.75-3.75"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabelledby ? undefined : (ariaLabel ?? "Options")}
            aria-labelledby={ariaLabelledby}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            style={{
              position: "fixed",
              top: coords.top,
              bottom: coords.bottom,
              left: coords.left,
              right: coords.right,
              minWidth: coords.minWidth,
              maxWidth: coords.maxWidth,
              maxHeight: coords.maxHeight,
              zIndex: 60,
            }}
            className="overflow-y-auto overscroll-contain rounded-panel border border-border bg-surface p-1.5 text-foreground shadow-[0_14px_32px_-16px_rgb(34_34_34/0.2)]"
          >
            {parsed.allOptions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No options available
              </p>
            ) : (
              <div className="grid gap-0.5">
                {parsed.sections.map((section, sectionIndex) => {
                  const groupLabelId = `${section.id}-label`;
                  return (
                    <div
                      key={section.id}
                      role={section.label ? "group" : undefined}
                      aria-labelledby={section.label ? groupLabelId : undefined}
                      className={cn(
                        "grid gap-0.5",
                        sectionIndex > 0 &&
                          section.label &&
                          "mt-1.5 border-t border-border pt-1.5",
                      )}
                    >
                      {section.label && (
                        <div
                          id={groupLabelId}
                          className="px-3 pt-1 pb-1 text-xs font-medium text-muted-foreground select-none"
                        >
                          {section.label}
                        </div>
                      )}

                      {section.options.map((option) => {
                        const isSelected = option.value === currentValue;
                        const isHighlighted = option.index === activeIndex;

                        return (
                          <div
                            key={option.domId}
                            id={option.domId}
                            role="option"
                            aria-selected={isSelected}
                            aria-disabled={option.disabled || undefined}
                            onMouseEnter={() => {
                              if (!option.disabled) {
                                setActiveIndex(option.index);
                              }
                            }}
                            onClick={() => {
                              if (!option.disabled) {
                                commitSelection(option);
                              }
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-control text-left leading-5 transition-colors duration-(--duration-control) ease-(--ease-control) select-none",
                              resolvedVariant === "compact"
                                ? "min-h-9 px-2.5 py-1.5 text-sm tabular-nums"
                                : "min-h-10 px-3 py-1.5 text-sm sm:min-h-9",
                              option.disabled
                                ? "cursor-not-allowed text-muted-foreground/55"
                                : "cursor-pointer",
                              !option.disabled &&
                                isSelected &&
                                isHighlighted &&
                                "bg-accent font-medium text-accent-foreground",
                              !option.disabled &&
                                isSelected &&
                                !isHighlighted &&
                                "bg-accent/70 font-medium text-accent-foreground",
                              !option.disabled &&
                                !isSelected &&
                                isHighlighted &&
                                "bg-surface-muted text-foreground",
                              !option.disabled &&
                                !isSelected &&
                                !isHighlighted &&
                                "text-foreground",
                            )}
                          >
                            <span className="min-w-0 flex-1 break-words">
                              {option.label}
                            </span>

                            {isSelected && (
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 16 16"
                                fill="none"
                                className="size-4 shrink-0 text-primary"
                              >
                                <path
                                  d="M3.5 8.25 6.5 11.25 12.5 5"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
