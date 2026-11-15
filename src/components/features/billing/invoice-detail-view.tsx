"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableEmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCardHeader,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { issueDraftInvoiceAction } from "@/features/billing/actions";
import { formatBillingPeriodLabel } from "@/features/billing/calculations";
import {
  INVOICE_ITEM_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  type InvoiceDto,
} from "@/features/billing/schemas";
import {
  DEPOSIT_POLICY_LABELS,
  PRORATION_POLICY_LABELS,
} from "@/features/settings/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { addManilaDays, formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency, parseMoneyDecimal } from "@/lib/money";
import type { SortColumnDef } from "@/lib/table-sort";
import {
  AddAdjustmentDialog,
  INVOICE_BADGE_TONE,
  VoidInvoiceDialog,
} from "./billing-dialogs";

type LineItemSortKey =
  "description" | "type" | "quantity" | "unitAmount" | "lineTotal";
type AdjustmentSortKey = "reason" | "type" | "amount";

const LINE_ITEM_SORT_COLUMNS: Record<
  LineItemSortKey,
  SortColumnDef<InvoiceDto["items"][number]>
> = {
  description: { getValue: (item) => item.description },
  type: { getValue: (item) => INVOICE_ITEM_TYPE_LABELS[item.itemType] },
  quantity: {
    getValue: (item) => item.quantity,
    kind: "number",
    defaultDirection: "desc",
  },
  unitAmount: {
    getValue: (item) => item.unitAmount,
    kind: "money",
    defaultDirection: "desc",
  },
  lineTotal: {
    getValue: (item) => item.lineTotal,
    kind: "money",
    defaultDirection: "desc",
  },
};

const ADJUSTMENT_SORT_COLUMNS: Record<
  AdjustmentSortKey,
  SortColumnDef<InvoiceDto["adjustments"][number]>
> = {
  reason: { getValue: (adj) => adj.reason },
  type: { getValue: (adj) => (adj.type === "CREDIT" ? "Credit" : "Charge") },
  amount: {
    getValue: (adj) =>
      adj.type === "CREDIT"
        ? -parseMoneyDecimal(adj.amount)
        : parseMoneyDecimal(adj.amount),
    kind: "money",
    defaultDirection: "desc",
  },
};

export function InvoiceDetailView({
  invoice,
  hasInvoicePrefix,
  justCreated = false,
}: {
  invoice: InvoiceDto;
  hasInvoicePrefix: boolean;
  justCreated?: boolean;
}) {
  const router = useRouter();
  const [issuing, startIssueTransition] = useTransition();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(
    justCreated
      ? {
          tone: "success",
          message: invoice.invoiceNumber
            ? `Invoice ${invoice.invoiceNumber} created and issued.`
            : "Draft invoice saved.",
        }
      : null,
  );

  const itemsSort = useTableSort(invoice.items, LINE_ITEM_SORT_COLUMNS);
  const itemsPage = useTablePagination(itemsSort.sortedRows, {
    resetKey: `${itemsSort.sort?.key ?? ""}|${itemsSort.sort?.direction ?? ""}`,
  });

  const adjustmentsSort = useTableSort(
    invoice.adjustments,
    ADJUSTMENT_SORT_COLUMNS,
  );
  const adjustmentsPage = useTablePagination(adjustmentsSort.sortedRows, {
    resetKey: `${adjustmentsSort.sort?.key ?? ""}|${adjustmentsSort.sort?.direction ?? ""}`,
  });

  const [issueConfirmOpen, setIssueConfirmOpen] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  function handleIssue() {
    if (issuing) return;
    setFeedback(null);
    setIssueError(null);
    startIssueTransition(async () => {
      const res = await issueDraftInvoiceAction({
        invoiceId: invoice.id,
        expectedVersion: invoice.version,
      });
      if (res.status === "saved") {
        setIssueConfirmOpen(false);
        setFeedback({ tone: "success", message: res.message });
        router.refresh();
      } else if (res.status === "error") {
        setIssueError(res.message);
      }
    });
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {invoice.invoiceNumber ?? "Draft invoice"}
            </h1>
            <Badge tone={INVOICE_BADGE_TONE[invoice.status]}>
              {INVOICE_STATUS_LABELS[invoice.status]}
            </Badge>
            {invoice.isOverdue && <Badge tone="danger">Overdue</Badge>}
            {invoice.billingPeriod && (
              <Badge tone="neutral">
                {formatBillingPeriodLabel(invoice.billingPeriod)}
              </Badge>
            )}
          </div>
          <div className="grid gap-0.5 text-sm text-muted-foreground">
            <span>
              {invoice.tenantId ? (
                <Link
                  href={`/tenants/${invoice.tenantId}`}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {invoice.snapshotTenantName ?? "Tenant"}
                </Link>
              ) : (
                <span className="font-medium text-foreground">
                  {invoice.snapshotTenantName ?? "Transient guest"}
                </span>
              )}
            </span>
            <span className="tabular-nums">
              Due {formatManilaDate(invoice.dueDateManila)}
            </span>
            <span className="tabular-nums">
              Period {formatManilaDate(invoice.periodStartManila)} to{" "}
              {formatManilaDate(addManilaDays(invoice.periodEndManila, -1))}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/billing"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Back to billing
          </Link>
          {invoice.status === "DRAFT" && (
            <>
              <Button
                size="md"
                loading={issuing}
                disabled={!hasInvoicePrefix}
                onClick={() => {
                  setIssueError(null);
                  setIssueConfirmOpen(true);
                }}
              >
                Issue invoice
              </Button>
              <ConfirmDialog
                open={issueConfirmOpen}
                onClose={() => {
                  if (!issuing) {
                    setIssueError(null);
                    setIssueConfirmOpen(false);
                  }
                }}
                onConfirm={handleIssue}
                title="Issue draft invoice?"
                description="Issuing locks this draft statement, assigns an official invoice number, and opens it for payment collection."
                errorMessage={issueError}
                confirmLabel="Issue invoice"
                confirmVariant="primary"
                loading={issuing}
              />
            </>
          )}
          {(invoice.status === "ISSUED" ||
            invoice.status === "PARTIALLY_PAID") && (
            <>
              <Link
                href={`/payments/new?invoiceId=${invoice.id}`}
                className={buttonClasses({
                  variant: "primary",
                  size: "md",
                })}
              >
                Record payment
              </Link>
              <Button
                size="md"
                variant="secondary"
                onClick={() => setAdjustOpen(true)}
              >
                Add adjustment
              </Button>
            </>
          )}
          {(invoice.status === "DRAFT" || invoice.status === "ISSUED") && (
            <Button
              size="md"
              variant="danger"
              onClick={() => setVoidOpen(true)}
            >
              Void invoice
            </Button>
          )}
        </div>
      </header>

      {feedback && (
        <Alert
          tone={feedback.tone}
          role={feedback.tone === "danger" ? "alert" : "status"}
        >
          {feedback.message}
        </Alert>
      )}

      {invoice.voidReason && (
        <Alert tone="warning" role="status">
          Void reason: {invoice.voidReason}
        </Alert>
      )}

      <Card className="grid gap-4">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Room</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {invoice.snapshotRoomNumber
                ? `Room ${invoice.snapshotRoomNumber}`
                : "Unassigned"}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Subtotal</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {formatPhpCurrency(invoice.subtotalAmount)}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Adjustments</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {formatPhpCurrency(invoice.adjustmentAmount)}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Total</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {formatPhpCurrency(invoice.totalAmount)}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Paid</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {formatPhpCurrency(invoice.paidAmount)}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Open balance</dt>
            <dd className="text-base font-semibold text-foreground tabular-nums">
              {formatPhpCurrency(invoice.balanceAmount)}
            </dd>
          </div>
        </dl>

        {(invoice.snapshotProrationPolicy ||
          invoice.snapshotDepositPolicy ||
          invoice.notes) && (
          <div className="grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-2">
            {invoice.snapshotProrationPolicy && (
              <div className="grid gap-0.5">
                <span className="font-medium text-foreground">
                  Proration policy snapshot
                </span>
                <span>
                  {PRORATION_POLICY_LABELS[invoice.snapshotProrationPolicy]}
                </span>
              </div>
            )}
            {invoice.snapshotDepositPolicy && (
              <div className="grid gap-0.5">
                <span className="font-medium text-foreground">
                  Deposit policy snapshot
                </span>
                <span>
                  {DEPOSIT_POLICY_LABELS[invoice.snapshotDepositPolicy]}
                </span>
              </div>
            )}
            {invoice.notes && (
              <div className="grid gap-0.5 sm:col-span-2">
                <span className="font-medium text-foreground">Notes</span>
                <span className="whitespace-pre-wrap">{invoice.notes}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Line items"
          count={`${invoice.items.length} ${invoice.items.length === 1 ? "item" : "items"}`}
        />

        {invoice.items.length === 0 ? (
          <TableEmptyState
            title="No line items recorded"
            description="No line items recorded on this invoice."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {itemsPage.paginatedRows.map((item) => (
                <div key={item.id} className="grid gap-1.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-0.5">
                      <span className="font-medium text-foreground">
                        {item.description}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {INVOICE_ITEM_TYPE_LABELS[item.itemType]}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Qty {item.quantity} &times;{" "}
                        {formatPhpCurrency(item.unitAmount)}
                      </span>
                    </div>
                    <span className="shrink-0 font-semibold text-foreground tabular-nums">
                      {formatPhpCurrency(item.lineTotal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead {...itemsSort.sortHeaderProps("description")}>
                      Description
                    </TableHead>
                    <TableHead {...itemsSort.sortHeaderProps("type")}>
                      Category
                    </TableHead>
                    <TableHead
                      numeric
                      {...itemsSort.sortHeaderProps("quantity")}
                    >
                      Qty
                    </TableHead>
                    <TableHead
                      numeric
                      {...itemsSort.sortHeaderProps("unitAmount")}
                    >
                      Unit amount
                    </TableHead>
                    <TableHead
                      numeric
                      {...itemsSort.sortHeaderProps("lineTotal")}
                    >
                      Line total
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsPage.paginatedRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-foreground">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {INVOICE_ITEM_TYPE_LABELS[item.itemType]}
                      </TableCell>
                      <TableCell numeric className="text-muted-foreground">
                        {item.quantity}
                      </TableCell>
                      <TableCell numeric className="text-muted-foreground">
                        {formatPhpCurrency(item.unitAmount)}
                      </TableCell>
                      <TableCell numeric className="font-semibold">
                        {formatPhpCurrency(item.lineTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              {...itemsPage.paginationProps}
              label="Line items table pagination"
            />
          </>
        )}
      </Card>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Linked adjustments"
          count={`${invoice.adjustments.length} ${invoice.adjustments.length === 1 ? "adjustment" : "adjustments"}`}
        />

        {invoice.adjustments.length === 0 ? (
          <TableEmptyState
            title="No linked adjustments"
            description="No credit or charge adjustments have been recorded on this invoice."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {adjustmentsPage.paginatedRows.map((adj) => (
                <div key={adj.id} className="grid gap-1.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <span className="font-medium text-foreground">
                        {adj.reason}
                      </span>
                      <Badge
                        tone={adj.type === "CREDIT" ? "success" : "info"}
                        className="w-fit"
                      >
                        {adj.type === "CREDIT" ? "Credit" : "Charge"}
                      </Badge>
                    </div>
                    <span className="shrink-0 font-semibold text-foreground tabular-nums">
                      {adj.type === "CREDIT" ? "-" : "+"}
                      {formatPhpCurrency(adj.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead {...adjustmentsSort.sortHeaderProps("reason")}>
                      Reason
                    </TableHead>
                    <TableHead {...adjustmentsSort.sortHeaderProps("type")}>
                      Type
                    </TableHead>
                    <TableHead
                      numeric
                      {...adjustmentsSort.sortHeaderProps("amount")}
                    >
                      Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustmentsPage.paginatedRows.map((adj) => (
                    <TableRow key={adj.id}>
                      <TableCell className="font-medium text-foreground">
                        {adj.reason}
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={adj.type === "CREDIT" ? "success" : "info"}
                        >
                          {adj.type === "CREDIT" ? "Credit" : "Charge"}
                        </Badge>
                      </TableCell>
                      <TableCell numeric className="font-semibold">
                        {adj.type === "CREDIT" ? "-" : "+"}
                        {formatPhpCurrency(adj.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              {...adjustmentsPage.paginationProps}
              label="Linked adjustments table pagination"
            />
          </>
        )}
      </Card>

      <AddAdjustmentDialog
        invoice={adjustOpen ? invoice : null}
        onClose={() => setAdjustOpen(false)}
        onSaved={(message) => {
          setFeedback({ tone: "success", message });
          router.refresh();
        }}
      />

      <VoidInvoiceDialog
        invoice={voidOpen ? invoice : null}
        onClose={() => setVoidOpen(false)}
        onSaved={(message) => {
          setFeedback({ tone: "success", message });
          router.refresh();
        }}
      />
    </div>
  );
}
