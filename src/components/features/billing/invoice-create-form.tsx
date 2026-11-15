"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createManualInvoiceAction } from "@/features/billing/actions";
import {
  computeLineItemTotalCentavos,
  getMonthBoundsManila,
} from "@/features/billing/calculations";
import {
  INVOICE_ITEM_TYPE_LABELS,
  INVOICE_ITEM_TYPES,
  type BillingTenantOptionDto,
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
    quantity: "1.00",
    unitAmount: "",
  };
}

export function InvoiceCreateForm({
  tenants,
  defaultPeriod,
  hasInvoicePrefix,
  initialTenantId,
}: {
  tenants: BillingTenantOptionDto[];
  defaultPeriod: string;
  hasInvoicePrefix: boolean;
  initialTenantId?: string | null;
}) {
  const router = useRouter();
  const bounds = getMonthBoundsManila(defaultPeriod);
  const todayManila = toManilaDate(new Date());

  const defaultTenant =
    (initialTenantId && tenants.some((t) => t.id === initialTenantId)
      ? initialTenantId
      : tenants[0]?.id) ?? "";

  const [tenantId, setTenantId] = useState(defaultTenant);
  const [billingPeriod, setBillingPeriod] = useState("");
  const [periodStartManila, setPeriodStartManila] = useState(
    bounds.monthStartManila,
  );
  const [periodEndManila, setPeriodEndManila] = useState(
    bounds.monthEndExclusiveManila,
  );
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
      quantity: "1.00",
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

  const selectedTenant = tenants.find((t) => t.id === tenantId) ?? null;

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
        tenantId,
        billingPeriod: billingPeriod.trim() ? billingPeriod.trim() : null,
        periodStartManila,
        periodEndManila,
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
        router.push(
          result.invoiceId
            ? `/billing/${result.invoiceId}?created=1`
            : "/billing",
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Create invoice
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Create an itemized draft or issued invoice for rent, utilities, or
            deposits.
          </p>
        </div>

        <Link
          href="/billing"
          className={buttonClasses({ variant: "secondary", size: "md" })}
        >
          Back to billing
        </Link>
      </header>

      {tenants.length === 0 && (
        <Alert tone="warning" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Add an active boarder before creating a manual invoice.</span>
            <Link
              href="/tenants"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Go to tenants
            </Link>
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
                  Choose the tenant, coverage dates, and payment deadline.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="manual-invoice-tenant"
                  label="Tenant"
                  required
                  error={fieldErrors.tenantId}
                >
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      value={tenantId}
                      onChange={(event) => setTenantId(event.target.value)}
                    >
                      <option value="">Select tenant</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.fullName}
                          {tenant.roomNumber
                            ? ` (Room ${tenant.roomNumber})`
                            : ""}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field
                  id="manual-invoice-period"
                  label="Billing period (optional)"
                  description="Leave blank for ad-hoc utility or deposit invoices."
                  error={fieldErrors.billingPeriod}
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="month"
                      value={billingPeriod}
                      onChange={(event) => setBillingPeriod(event.target.value)}
                    />
                  )}
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field
                  id="manual-invoice-start"
                  label="Period start"
                  required
                  error={fieldErrors.periodStartManila}
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="date"
                      value={periodStartManila}
                      onChange={(event) =>
                        setPeriodStartManila(event.target.value)
                      }
                    />
                  )}
                </Field>

                <Field
                  id="manual-invoice-end"
                  label="Period end (exclusive)"
                  required
                  error={fieldErrors.periodEndManila}
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="date"
                      value={periodEndManila}
                      onChange={(event) =>
                        setPeriodEndManila(event.target.value)
                      }
                    />
                  )}
                </Field>

                <Field
                  id="manual-invoice-due"
                  label="Due date"
                  required
                  error={fieldErrors.dueDateManila}
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="date"
                      value={dueDateManila}
                      onChange={(event) => setDueDateManila(event.target.value)}
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

              <div className="grid gap-3">
                {items.map((item, idx) => {
                  const rowTotal = lineTotals[idx] ?? null;
                  return (
                    <div
                      key={item.key}
                      className="grid gap-3 rounded-panel border border-border bg-background/50 p-3.5 sm:p-4"
                    >
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
                              inputMode="decimal"
                              value={item.quantity}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  quantity: event.target.value,
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
                              inputMode="decimal"
                              placeholder="0.00"
                              value={item.unitAmount}
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
                <dt className="text-muted-foreground">Tenant</dt>
                <dd className="text-right font-medium text-foreground">
                  {selectedTenant ? selectedTenant.fullName : "None selected"}
                </dd>
              </div>
              {selectedTenant?.roomNumber && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Room</dt>
                  <dd className="text-right text-foreground tabular-nums">
                    Room {selectedTenant.roomNumber}
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

            <div className="grid gap-2.5 pt-1">
              <Button
                type="submit"
                size="md"
                loading={pending}
                disabled={tenants.length === 0}
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
        </form>
      </CompactFormScope>
    </div>
  );
}
