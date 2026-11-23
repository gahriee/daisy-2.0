"use client";

import { useActionState, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import {
  saveBusinessSettingsAction,
  type SaveSettingsActionState,
} from "@/features/settings/actions";
import {
  parseHouseRulesList,
  serializeHouseRulesList,
  type BusinessSettingsDto,
} from "@/features/settings/schemas";
import { cn } from "@/lib/cn";

type RuleRow = {
  id: string;
  text: string;
};

function createRowsFromRaw(raw: string | null | undefined): RuleRow[] {
  const parsed = parseHouseRulesList(raw);
  return parsed.map((text, index) => ({
    id: `rule-init-${index}-${text.slice(0, 12)}`,
    text,
  }));
}

export function HouseRulesEditor({
  initialSettings,
}: {
  initialSettings: BusinessSettingsDto;
}) {
  const nextRowSeq = useRef(1);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [savedVersion, setSavedVersion] = useState(initialSettings.version);
  const [savedSerialized, setSavedSerialized] = useState(
    () =>
      serializeHouseRulesList(
        parseHouseRulesList(initialSettings.transientPolicyNote),
      ) ?? "",
  );
  const [rows, setRows] = useState<RuleRow[]>(() =>
    createRowsFromRaw(initialSettings.transientPolicyNote),
  );
  const [newRuleText, setNewRuleText] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const serializedDraft =
    serializeHouseRulesList(rows.map((row) => row.text)) ?? "";
  const isDirty = serializedDraft !== savedSerialized;
  const charCount = serializedDraft.length;
  const exceedsLimit = charCount > 2000;

  const [state, submitAction, pending] = useActionState(
    async (
      prev: SaveSettingsActionState,
      formData: FormData,
    ): Promise<SaveSettingsActionState> => {
      const result = await saveBusinessSettingsAction(prev, formData);
      if (result.status === "saved") {
        const nextNormalized =
          serializeHouseRulesList(
            parseHouseRulesList(result.settings.transientPolicyNote),
          ) ?? "";
        setSavedVersion(result.settings.version);
        setSavedSerialized(nextNormalized);
        setRows(createRowsFromRaw(result.settings.transientPolicyNote));
        toast.success(result.message);
      }
      return result;
    },
    { status: "idle" },
  );

  function handleRuleChange(id: string, value: string) {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, text: value } : row)),
    );
  }

  function handleAddRule(initialText = "") {
    const id = `rule-new-${nextRowSeq.current++}`;
    setRows((prev) => [...prev, { id, text: initialText }]);
    if (initialText) {
      setNewRuleText("");
    }
    requestAnimationFrame(() => {
      inputRefs.current[id]?.focus();
    });
  }

  function handleAddFromComposer() {
    const trimmed = newRuleText.trim();
    if (!trimmed) {
      handleAddRule("");
      return;
    }
    handleAddRule(trimmed);
  }

  function handleRemoveRule(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function reorderRule(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setRows((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleMoveRule(index: number, delta: -1 | 1) {
    reorderRule(index, index + delta);
  }

  function handleResetUnsaved() {
    setRows(createRowsFromRaw(savedSerialized));
    setNewRuleText("");
  }

  const fieldError =
    state.status === "error"
      ? state.fieldErrors.transientPolicyNote
      : undefined;

  return (
    <form action={submitAction} className="grid gap-5">
      <input type="hidden" name="module" value="house_rules" />
      <input type="hidden" name="expectedVersion" value={savedVersion} />
      <input type="hidden" name="transientPolicyNote" value={serializedDraft} />

      {state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}

      <section className="overflow-hidden rounded-panel border border-border bg-surface shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-6">
          <div className="grid gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                House rules list
              </h2>
              <Badge
                tone={
                  isDirty ? "warning" : savedSerialized ? "success" : "neutral"
                }
              >
                {isDirty
                  ? "Unsaved changes"
                  : savedSerialized
                    ? "Published on /book"
                    : "No rules published"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Each row appears as its own numbered guideline on your public
              booking page.
              {rows.length > 1
                ? " Drag rows to reorder or use Up and Down."
                : ""}
            </p>
          </div>
        </div>

        <div className="divide-y divide-border px-4 sm:px-6">
          {rows.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No house rules added yet. Add a rule below to publish it on
                /book.
              </p>
            </div>
          ) : (
            rows.map((row, index) => {
              const canDrag = rows.length > 1 && !pending;
              const isDragging = draggedIndex === index;
              const isDropTarget =
                dragOverIndex === index &&
                draggedIndex !== null &&
                draggedIndex !== index;

              return (
                <div
                  key={row.id}
                  draggable={canDrag}
                  onDragStart={(event) => {
                    const target = event.target as HTMLElement | null;
                    if (target?.closest("input, textarea, button")) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(index));
                    setDraggedIndex(index);
                  }}
                  onDragOver={(event) => {
                    if (!canDrag || draggedIndex === null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (dragOverIndex !== index) {
                      setDragOverIndex(index);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === index) {
                      setDragOverIndex(null);
                    }
                  }}
                  onDrop={(event) => {
                    if (!canDrag) return;
                    event.preventDefault();
                    if (draggedIndex !== null) {
                      reorderRule(draggedIndex, index);
                    }
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={cn(
                    "flex flex-col gap-2.5 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-3",
                    canDrag && "cursor-grab active:cursor-grabbing",
                    isDragging && "opacity-45",
                    isDropTarget && "bg-accent/40 ring-2 ring-primary/40",
                  )}
                >
                  <div className="flex flex-1 items-center gap-2.5">
                    {rows.length > 1 && (
                      <span
                        aria-hidden="true"
                        title="Drag to reorder"
                        className="inline-flex h-10 w-6 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          className="size-4"
                        >
                          <circle cx="5.5" cy="3.5" r="1.15" />
                          <circle cx="10.5" cy="3.5" r="1.15" />
                          <circle cx="5.5" cy="8" r="1.15" />
                          <circle cx="10.5" cy="8" r="1.15" />
                          <circle cx="5.5" cy="12.5" r="1.15" />
                          <circle cx="10.5" cy="12.5" r="1.15" />
                        </svg>
                      </span>
                    )}
                    <span
                      aria-hidden="true"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground tabular-nums"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Input
                      ref={(el) => {
                        inputRefs.current[row.id] = el;
                      }}
                      aria-label={`House rule ${index + 1}`}
                      value={row.text}
                      disabled={pending}
                      onChange={(event) =>
                        handleRuleChange(row.id, event.target.value)
                      }
                      placeholder="Enter house rule..."
                      maxLength={400}
                    />
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-1.5">
                    <button
                      type="button"
                      disabled={pending || index === 0}
                      onClick={() => handleMoveRule(index, -1)}
                      aria-label={`Move rule ${index + 1} up`}
                      className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control border border-control-border bg-surface text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-9 sm:min-w-9"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-3.5"
                      >
                        <path d="M3.5 10 8 5.5 12.5 10" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={pending || index === rows.length - 1}
                      onClick={() => handleMoveRule(index, 1)}
                      aria-label={`Move rule ${index + 1} down`}
                      className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control border border-control-border bg-surface text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-9 sm:min-w-9"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-3.5"
                      >
                        <path d="M3.5 6 8 10.5 12.5 6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRemoveRule(row.id)}
                      aria-label={`Remove rule ${index + 1}`}
                      className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-control-border bg-surface px-3 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-9"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Add rule bar */}
        <div className="border-t border-border bg-background/60 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <Input
              aria-label="New house rule"
              value={newRuleText}
              disabled={pending}
              onChange={(event) => setNewRuleText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddFromComposer();
                }
              }}
              placeholder="Write a new house rule..."
              maxLength={400}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={handleAddFromComposer}
              className="shrink-0"
            >
              Add rule
            </Button>
          </div>
          {fieldError && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger">
              {fieldError}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3.5 sm:px-6">
          <span
            className={
              exceedsLimit
                ? "text-xs font-medium text-danger tabular-nums"
                : "text-xs text-muted-foreground tabular-nums"
            }
          >
            {charCount} / 2,000 characters
          </span>

          <div className="flex flex-wrap items-center gap-2">
            {isDirty && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={handleResetUnsaved}
              >
                Discard changes
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending || !isDirty || exceedsLimit}
            >
              {pending ? "Saving rules…" : "Save house rules"}
            </Button>
          </div>
        </div>
      </section>
    </form>
  );
}
