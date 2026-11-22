"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addInvoiceAdjustmentAction,
  generatePeriodInvoicesAction,
  voidInvoiceAction,
  type BillingActionResult,
} from "@/features/billing/actions";
import {
  INVOICE_ADJUSTMENT_TYPE_LABELS,
  INVOICE_ADJUSTMENT_TYPES,
  type InvoiceDto,
  type InvoiceStatusValue,
} from "@/features/billing/schemas";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";

export const INVOICE_BADGE_TONE: Record<
  InvoiceStatusValue,
  "neutral" | "info" | "warning" | "success"
> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  VOID: "neutral",
};

export function GeneratePeriodInvoicesDialog({
  open,
  defaultPeriod,
  policiesComplete,
  onClose,
  onSaved,
}: {
  open: boolean;
  defaultPeriod: string;
  policiesComplete: boolean;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [billingPeriod, setBillingPeriod] = useState(defaultPeriod);
  const [issueImmediately, setIssueImmediately] = useState(false);

  const [state, submitAction, pending] = useActionState(
    async (
      prev: BillingActionResult,
      formData: FormData,
    ): Promise<BillingActionResult> => {
      const result = await generatePeriodInvoicesAction(prev, formData);
      if (result.status === "saved") {
        onClose();
        await onSaved(result.message);
      }
      return result;
    },
    { status: "idle" },
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissDisabled={pending}
      title="Generate monthly invoices"
      description="Creates one monthly bill for each active stay using your partial-month, deposit, and grace rules. Existing active bills are skipped."
    >
      <form action={submitAction} className="grid gap-4" noValidate>
        {!policiesComplete && (
          <Alert tone="warning">
            Complete billing policies in Settings before generating monthly
            invoices.
          </Alert>
        )}

        {state.status === "error" && (
          <Alert tone="danger" role="alert">
            {state.message}
          </Alert>
        )}

        <Field
          id="generate-billing-period"
          label="Billing period"
          required
          description="Enter YYYY-MM (for example 2026-11)."
          error={
            state.status === "error"
              ? state.fieldErrors.billingPeriod
              : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="billingPeriod"
              type="month"
              value={billingPeriod}
              onChange={(event) => setBillingPeriod(event.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-1">
          <Checkbox
            id="generate-issue-immediately"
            name="issueImmediately"
            checked={issueImmediately}
            onChange={(event) => setIssueImmediately(event.target.checked)}
            label="Issue immediately"
          />
          <p className="pl-8 text-xs leading-5 text-muted-foreground">
            Assigns official invoice numbers right away instead of saving as
            drafts.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2.5 pt-2">
          <Button
            variant="secondary"
            size="md"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="md"
            loading={pending}
            disabled={!policiesComplete}
          >
            Generate monthly invoices
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AddAdjustmentDialog({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: InvoiceDto | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [type, setType] = useState<"CREDIT" | "CHARGE">("CREDIT");
  const [state, submitAction, pending] = useActionState(
    async (
      prev: BillingActionResult,
      formData: FormData,
    ): Promise<BillingActionResult> => {
      const result = await addInvoiceAdjustmentAction(prev, formData);
      if (result.status === "saved") {
        onClose();
        await onSaved(result.message);
      }
      return result;
    },
    { status: "idle" },
  );

  const description = invoice
    ? `Add a saved credit or extra charge to ${invoice.invoiceNumber ?? "this bill"} without changing existing charges.`
    : undefined;

  return (
    <Dialog
      open={invoice !== null}
      onClose={onClose}
      dismissDisabled={pending}
      title="Add invoice adjustment"
      {...(description ? { description } : {})}
    >
      {invoice && (
        <form action={submitAction} className="grid gap-4" noValidate>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <input
            type="hidden"
            name="expectedVersion"
            value={String(invoice.version)}
          />

          {state.status === "error" && (
            <Alert tone="danger" role="alert">
              {state.message}
            </Alert>
          )}

          <div className="grid gap-0.5 border-y border-border py-2.5 text-xs text-muted-foreground tabular-nums">
            <span>Current total: {formatPhpCurrency(invoice.totalAmount)}</span>
            <span>Paid: {formatPhpCurrency(invoice.paidAmount)}</span>
            <span>
              Open balance: {formatPhpCurrency(invoice.balanceAmount)}
            </span>
          </div>

          <Field
            id="adj-type"
            label="Adjustment type"
            required
            error={
              state.status === "error" ? state.fieldErrors.type : undefined
            }
          >
            {(fieldProps) => (
              <Select
                {...fieldProps}
                name="type"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as "CREDIT" | "CHARGE")
                }
              >
                {INVOICE_ADJUSTMENT_TYPES.map((adjType) => (
                  <option key={adjType} value={adjType}>
                    {INVOICE_ADJUSTMENT_TYPE_LABELS[adjType]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="adj-amount"
            label="Amount (PHP)"
            required
            error={
              state.status === "error" ? state.fieldErrors.amount : undefined
            }
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
              />
            )}
          </Field>

          <Field
            id="adj-reason"
            label="Reason"
            required
            error={
              state.status === "error" ? state.fieldErrors.reason : undefined
            }
          >
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                name="reason"
                rows={2}
                placeholder="e.g. Meter correction or partial-month fee waiver"
              />
            )}
          </Field>

          <div className="flex flex-wrap justify-end gap-2.5 pt-2">
            <Button
              variant="secondary"
              size="md"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" size="md" loading={pending}>
              Save adjustment
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function VoidInvoiceDialog({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: InvoiceDto | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [state, submitAction, pending] = useActionState(
    async (
      prev: BillingActionResult,
      formData: FormData,
    ): Promise<BillingActionResult> => {
      const result = await voidInvoiceAction(prev, formData);
      if (result.status === "saved") {
        onClose();
        await onSaved(result.message);
      }
      return result;
    },
    { status: "idle" },
  );

  const hasPayments =
    invoice !== null &&
    (invoice.status === "PARTIALLY_PAID" ||
      invoice.status === "PAID" ||
      Number(invoice.paidAmount) > 0);

  return (
    <Dialog
      open={invoice !== null}
      onClose={onClose}
      dismissDisabled={pending}
      title="Void invoice"
      description="Voiding keeps this bill in your history and stops collection on it."
    >
      {invoice && (
        <form action={submitAction} className="grid gap-4" noValidate>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <input
            type="hidden"
            name="expectedVersion"
            value={String(invoice.version)}
          />

          {hasPayments && (
            <Alert tone="warning" role="status">
              This bill already has payments applied to it. Reverse those
              payments before voiding it.
            </Alert>
          )}

          {state.status === "error" && (
            <Alert tone="danger" role="alert">
              {state.message}
            </Alert>
          )}

          <div className="grid gap-0.5 border-y border-border py-2.5 text-sm tabular-nums">
            <span className="font-semibold text-foreground">
              {invoice.invoiceNumber ?? "Draft invoice"}
            </span>
            <span className="text-foreground">
              {invoice.snapshotTenantName ?? "Tenant"}
            </span>
            <span className="text-xs text-muted-foreground">
              Total: {formatPhpCurrency(invoice.totalAmount)}
            </span>
            <span className="text-xs text-muted-foreground">
              Due {formatManilaDate(invoice.dueDateManila)}
            </span>
          </div>

          <Field
            id="void-reason"
            label="Reason for voiding"
            required
            error={
              state.status === "error" ? state.fieldErrors.reason : undefined
            }
          >
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                name="reason"
                rows={2}
                placeholder="e.g. Duplicate draft or tenant cancelled before move-in"
              />
            )}
          </Field>

          <div className="flex flex-wrap justify-end gap-2.5 pt-2">
            <Button
              variant="secondary"
              size="md"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="md"
              loading={pending}
              disabled={hasPayments}
            >
              Void invoice
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
