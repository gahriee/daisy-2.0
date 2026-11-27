"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { BackLink, Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { createManualInvoiceAction } from "@/features/billing/actions";
import { computeLineItemTotalCentavos } from "@/features/billing/calculations";
import {
  INVOICE_ITEM_TYPE_LABELS,
  INVOICE_ITEM_TYPES,
  type BillingTenantOptionDto,
  type BillingTransientGuestOptionDto,
  type InvoiceItemTypeValue,
} from "@/features/billing/schemas";
import { addManilaDays, toManilaDate } from "@/lib/dates";
import { addMoney, formatPhpCurrency } from "@/lib/money";

type DraftLineItem = {
  key: string;
  itemType: InvoiceItemTypeValue;
  description: string;
  quantity: string;
  unitAmount: string;
};

function makeEmptyLine(key: string): DraftLineItem {
  return {
    key,
    itemType: "UTILITY",
    description: "",
    quantity: "1",
    unitAmount: "",
  };
}

export function InvoiceCreateForm({
  tenants,
  transientGuests,
  hasInvoicePrefix,
  initialTenantId,
  initialTransientGuestId,
}: {
  tenants: BillingTenantOptionDto[];
  transientGuests: BillingTransientGuestOptionDto[];
  hasInvoicePrefix: boolean;
  initialTenantId?: string | null;
  initialTransientGuestId?: string | null;
}) {
  const router = useRouter();
  const todayManila = toManilaDate(new Date());

  const defaultRecipientKey = (() => {
    if (
      initialTransientGuestId &&
      transientGuests.some((g) => g.id === initialTransientGuestId)
    ) {
      return `transient:${initialTransientGuestId}`;
    }
    if (initialTenantId && tenants.some((t) => t.id === initialTenantId)) {
      return `tenant:${initialTenantId}`;
    }
    if (tenants[0]) return `tenant:${tenants[0].id}`;
    if (transientGuests[0]) return `transient:${transientGuests[0].id}`;
    return "";
  })();

  const [recipientKey, setRecipientKey] = useState(defaultRecipientKey);
  const [dueDateManila, setDueDateManila] = useState(
    addManilaDays(todayManila, 7),
  );
  const [issueImmediately, setIssueImmediately] = useState(false);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftLineItem[]>([
    {
      key: "line-1",
      itemType: "UTILITY",
      description: "Water and electricity share",
      quantity: "1",
      unitAmount: "",
    },
  ]);
  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const lineTotals = items.map((item) => {
    try {
      return computeLineItemTotalCentavos(
        item.unitAmount || "0",
        item.quantity || "0",
      );
    } catch {
      return null;
    }
  });
  const previewValid = lineTotals.every((total) => total !== null);
  const previewTotalCentavos = lineTotals.reduce<bigint>(
    (sum, total) => (total !== null ? addMoney(sum, total) : sum),
    BigInt(0),
  );

  const isTransient = recipientKey.startsWith("transient:");
  const selectedTenantId = recipientKey.startsWith("tenant:")
    ? recipientKey.slice("tenant:".length)
    : null;
  const selectedTransientGuestId = isTransient
    ? recipientKey.slice("transient:".length)
    : null;
  const selectedTenant = selectedTenantId
    ? (tenants.find((t) => t.id === selectedTenantId) ?? null)
    : null;
  const selectedTransientGuest = selectedTransientGuestId
    ? (transientGuests.find((g) => g.id === selectedTransientGuestId) ?? null)
    : null;
  const hasRecipients = tenants.length > 0 || transientGuests.length > 0;

  function updateItem(key: string, patch: Partial<Omit<DraftLineItem, "key">>) {
    setItems((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setErrorMessage(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await createManualInvoiceAction({
        tenantId: selectedTenantId,
        transientGuestId: selectedTransientGuestId,
        dueDateManila,
        issueImmediately,
        notes: notes.trim() ? notes.trim() : null,
        items: items.map((item) => ({
          itemType: item.itemType,
          description: item.description,
          quantity: item.quantity,
          unitAmount: item.unitAmount,
        })),
      });

      if (result.status === "saved") {
        toast.success(result.message);
        router.push(
          result.invoiceId ? `/billing/${result.invoiceId}` : "/billing",
        );
        router.refresh();
      } else if (result.status === "error") {
        setErrorMessage(result.message);
        setFieldErrors(result.fieldErrors);
      }
    });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <BackLink href="/billing">Billing</BackLink>
        <header className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Create invoice
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Create an itemized draft or issued invoice for a boarder or
            transient guest.
          </p>
        </header>
      </div>

      {!hasRecipients && (
        <Alert tone="warning" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Add an active boarder or transient guest before creating an
              invoice.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/tenants"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Go to tenants
              </Link>
              <Link
                href="/transients/stays"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Go to transients
              </Link>
            </div>
          </div>
        </Alert>
      )}

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      <CompactFormScope>
        <form
          onSubmit={handleSubmit}
          className="grid items-start gap-5 lg:grid-cols-12"
          noValidate
        >
          <div className="grid gap-5 lg:col-span-8">
            <Card className="grid gap-4">
              <div className="grid gap-1">
                <h2 className="text-base font-semibold text-foreground">
                  Invoice details
                </h2>
                <p className="text-xs leading-5 text-muted-foreground">
                  Choose the boarder or transient guest and set the payment due
                  date.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="manual-invoice-recipient"
                  label="Boarder or transient guest"
                  required
                  error={fieldErrors.tenantId ?? fieldErrors.transientGuestId}
                >
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      value={recipientKey}
                      onChange={(event) => setRecipientKey(event.target.value)}
                    >
                      <option value="" disabled>
                        Select boarder or guest
                      </option>
                      {tenants.length > 0 && (
                        <optgroup label="Boarders">
                          {tenants.map((tenant) => (
                            <option
                              key={tenant.id}
                              value={`tenant:${tenant.id}`}
                            >
                              {tenant.fullName}
                              {tenant.roomNumber
                                ? ` - ${tenant.roomNumber}`
                                : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {transientGuests.length > 0 && (
                        <optgroup label="Transient guests">
                          {transientGuests.map((guest) => (
                            <option
                              key={guest.id}
                              value={`transient:${guest.id}`}
                            >
                              {guest.fullName}
                              {guest.roomNumber ? ` - ${guest.roomNumber}` : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Select>
                  )}
                </Field>

                <Field
                  id="manual-invoice-due"
                  label="Due date"
                  required
                  error={fieldErrors.dueDateManila}
                >
                  {(fieldProps) => (
                    <DatePicker
                      {...fieldProps}
                      required
                      value={dueDateManila}
                      onValueChange={setDueDateManila}
                    />
                  )}
                </Field>
              </div>

              <Field
                id="manual-invoice-notes"
                label="Notes (optional)"
                error={fieldErrors.notes}
              >
                {(fieldProps) => (
                  <Textarea
                    {...fieldProps}
                    rows={2}
                    placeholder="Optional meter readings, breakdown notes, or payment reminders"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                )}
              </Field>
            </Card>

            <Card className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-0.5">
                  <h2 className="text-base font-semibold text-foreground">
                    Line items
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Add up to 30 itemized charges for rent, utilities, deposits,
                    or fees.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={items.length >= 30}
                  onClick={() =>
                    setItems((prev) => [
                      ...prev,
                      makeEmptyLine(`line-${Date.now()}-${prev.length}`),
                    ])
                  }
                >
                  Add line item
                </Button>
              </div>

              {fieldErrors.items && (
                <Alert tone="danger" role="alert">
                  {fieldErrors.items}
                </Alert>
              )}

              <div className="divide-y divide-border border-t border-border">
                {items.map((item, idx) => {
                  const rowTotal = lineTotals[idx] ?? null;
                  return (
                    <div key={item.key} className="grid gap-3 py-4 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                          Item #{idx + 1}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-foreground tabular-nums">
                            {rowTotal !== null
                              ? formatPhpCurrency(rowTotal)
                              : "—"}
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-danger"
                            disabled={items.length <= 1}
                            onClick={() =>
                              setItems((prev) =>
                                prev.filter((row) => row.key !== item.key),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                        <div className="sm:col-span-4">
                          <Field id={`item-type-${item.key}`} label="Category">
                            {(fieldProps) => (
                              <Select
                                {...fieldProps}
                                value={item.itemType}
                                onChange={(event) =>
                                  updateItem(item.key, {
                                    itemType: event.target
                                      .value as InvoiceItemTypeValue,
                                  })
                                }
                              >
                                {INVOICE_ITEM_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {INVOICE_ITEM_TYPE_LABELS[type]}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </Field>
                        </div>

                        <div className="sm:col-span-8">
                          <Field
                            id={`item-desc-${item.key}`}
                            label="Description"
                            required
                            error={fieldErrors[`items.${idx}.description`]}
                          >
                            {(fieldProps) => (
                              <Input
                                {...fieldProps}
                                value={item.description}
                                placeholder="e.g. November electricity sub-meter"
                                onChange={(event) =>
                                  updateItem(item.key, {
                                    description: event.target.value,
                                  })
                                }
                              />
                            )}
                          </Field>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field
                          id={`item-qty-${item.key}`}
                          label="Quantity"
                          required
                          error={fieldErrors[`items.${idx}.quantity`]}
                        >
                          {(fieldProps) => (
                            <Input
                              {...fieldProps}
                              type="number"
                              inputMode="numeric"
                              min={1}
                              step={1}
                              placeholder="1"
                              value={item.quantity}
                              onKeyDown={(event) => {
                                if (
                                  [".", ",", "e", "E", "+", "-"].includes(
                                    event.key,
                                  )
                                ) {
                                  event.preventDefault();
                                }
                              }}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  quantity: event.target.value.replace(
                                    /\D/g,
                                    "",
                                  ),
                                })
                              }
                            />
                          )}
                        </Field>

                        <Field
                          id={`item-unit-${item.key}`}
                          label="Unit amount (PHP)"
                          required
                          error={fieldErrors[`items.${idx}.unitAmount`]}
                        >
                          {(fieldProps) => (
                            <Input
                              {...fieldProps}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              placeholder="0.00"
                              value={item.unitAmount}
                              onKeyDown={(event) => {
                                if (["e", "E", "+", "-"].includes(event.key)) {
                                  event.preventDefault();
                                }
                              }}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  unitAmount: event.target.value,
                                })
                              }
                            />
                          )}
                        </Field>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <Card className="grid gap-4 lg:sticky lg:top-6 lg:col-span-4">
            <h2 className="text-base font-semibold text-foreground">Summary</h2>

            <dl className="grid gap-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">
                  {isTransient ? "Transient guest" : "Boarder"}
                </dt>
                <dd className="text-right font-medium text-foreground">
                  {selectedTenant
                    ? selectedTenant.fullName
                    : selectedTransientGuest
                      ? selectedTransientGuest.fullName
                      : "None selected"}
                </dd>
              </div>
              {(selectedTenant?.roomNumber ||
                selectedTransientGuest?.roomNumber) && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Room</dt>
                  <dd className="text-right text-foreground tabular-nums">
                    {selectedTenant?.roomNumber ??
                      selectedTransientGuest?.roomNumber}
                  </dd>
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Line items</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {items.length}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="font-medium text-muted-foreground">
                  Estimated subtotal
                </dt>
                <dd className="text-lg font-semibold text-foreground tabular-nums">
                  {previewValid ? formatPhpCurrency(previewTotalCentavos) : "—"}
                </dd>
              </div>
            </dl>

            <div className="grid gap-1 border-t border-border pt-3">
              <Checkbox
                id="manual-invoice-issue"
                checked={issueImmediately}
                disabled={!hasInvoicePrefix}
                onChange={(event) => setIssueImmediately(event.target.checked)}
                label="Issue immediately"
              />
              <p className="pl-8 text-xs leading-5 text-muted-foreground">
                {hasInvoicePrefix
                  ? "Assigns an official sequential invoice number immediately."
                  : "Configure an invoice prefix in Settings to enable immediate issuance."}
              </p>
            </div>

            <div className="hidden gap-2.5 pt-1 lg:grid">
              <Button
                type="submit"
                size="md"
                loading={pending}
                disabled={!hasRecipients}
              >
                {issueImmediately ? "Create and issue" : "Save draft"}
              </Button>
              <Link
                href="/billing"
                className={buttonClasses({ variant: "secondary", size: "md" })}
              >
                Cancel
              </Link>
            </div>
          </Card>

          <div className="sticky bottom-0 z-10 -mx-4 grid gap-2 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_20px_-14px_rgb(34_34_34/0.16)] sm:-mx-6 sm:px-6 lg:hidden">
            <Button
              type="submit"
              size="md"
              loading={pending}
              disabled={!hasRecipients}
              className="w-full"
            >
              {issueImmediately ? "Create and issue" : "Save draft"}
            </Button>
            <Link
              href="/billing"
              className={buttonClasses({
                variant: "secondary",
                size: "md",
                className: "w-full",
              })}
            >
              Cancel
            </Link>
          </div>
        </form>
      </CompactFormScope>
    </div>
  );
}
