"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode | undefined;
  details?: ReactNode | undefined;
  warningMessage?: string | null | undefined;
  errorMessage?: string | null | undefined;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  loading?: boolean;
  confirmDisabled?: boolean;
  maxWidthClassName?: string;
};

/**
 * Shared confirmation dialog for state-changing actions so destructive or
 * irreversible operations always require explicit Owner confirmation.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  details,
  warningMessage,
  errorMessage,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  loading = false,
  confirmDisabled = false,
  maxWidthClassName = "max-w-md",
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) onClose();
      }}
      dismissDisabled={loading}
      maxWidthClassName={maxWidthClassName}
      title={title}
      {...(description !== undefined ? { description } : {})}
    >
      <div className="grid gap-4">
        {errorMessage && (
          <Alert tone="danger" role="alert">
            {errorMessage}
          </Alert>
        )}

        {warningMessage && (
          <Alert tone="warning" role="status">
            {warningMessage}
          </Alert>
        )}

        {details && (
          <div className="grid gap-1 border-y border-border py-2.5 text-sm tabular-nums">
            {details}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={loading}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="md"
            loading={loading}
            disabled={confirmDisabled || loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

