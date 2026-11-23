"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type AttachmentDropboxProps = {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  title: string;
  activeTitle?: string;
  description?: string;
  buttonLabel?: string;
  secondaryAction?: ReactNode;
  compact?: boolean;
  className?: string;
  onFilesSelected: (files: File[]) => void;
};

/**
 * Shared drag-and-drop + click-to-browse attachment dropbox built with Daisy
 * semantic tokens and 44 px touch targets.
 */
export function AttachmentDropbox({
  accept,
  multiple = true,
  disabled = false,
  title,
  activeTitle = "Drop files here to attach",
  description,
  buttonLabel = "Add attachment",
  secondaryAction,
  compact = false,
  className,
  onFilesSelected,
}: AttachmentDropboxProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  function emitFiles(rawFiles: File[]) {
    if (disabled || rawFiles.length === 0) return;
    const files = multiple ? rawFiles : rawFiles.slice(0, 1);
    onFilesSelected(files);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    emitFiles(files);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    emitFiles(files);
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "grid justify-items-center rounded-panel border-2 border-dashed text-center transition-colors duration-(--duration-control) ease-(--ease-control)",
        compact ? "gap-2 px-4 py-4" : "gap-3 px-4 py-6 sm:px-6",
        isDragActive
          ? "border-primary bg-accent/35"
          : "border-control-border bg-surface-muted/40 hover:border-foreground/35",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={handleInputChange}
      />

      <div
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-surface text-muted-foreground shadow-xs",
          compact ? "size-8" : "size-10",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={compact ? "size-4" : "size-5"}
        >
          <path d="M12 16V4m0 0-4 4m4-4 4 4" />
          <path d="M4 16.5v1.5A2 2 0 0 0 6 20h12a2 2 0 0 0 2-2v-1.5" />
        </svg>
      </div>

      <div className="grid gap-0.5">
        <p className="text-sm font-medium text-foreground">
          {isDragActive ? activeTitle : title}
        </p>
        {description && (
          <p className="text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
        <Button
          type="button"
          variant="secondary"
          size={compact ? "sm" : "md"}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {buttonLabel}
        </Button>
        {secondaryAction}
      </div>
    </div>
  );
}
