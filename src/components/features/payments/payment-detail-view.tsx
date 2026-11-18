"use client";

import { useState } from "react";
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
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentDto,
} from "@/features/payments/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import type { SortColumnDef } from "@/lib/table-sort";
import { PAYMENT_BADGE_TONE, ReversePaymentDialog } from "./payment-dialogs";

type AllocationSortKey = "invoice" | "amount";
type ProofSortKey = "file" | "type" | "size";

const ALLOCATION_SORT_COLUMNS: Record<
  AllocationSortKey,
  SortColumnDef<PaymentDto["allocations"][number]>
> = {
  invoice: { getValue: (alloc) => alloc.invoiceNumber ?? alloc.invoiceId },
  amount: {
    getValue: (alloc) => alloc.amount,
    kind: "money",
    defaultDirection: "desc",
  },
};

const PROOF_SORT_COLUMNS: Record<
  ProofSortKey,
  SortColumnDef<PaymentDto["proofs"][number]>
> = {
  file: { getValue: (proof) => proof.fileName },
  type: { getValue: (proof) => proof.mimeType },
  size: {
    getValue: (proof) => proof.byteSize,
    kind: "number",
    defaultDirection: "desc",
  },
};

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function PaymentDetailView({
  payment,
  justCreated = false,
}: {
  payment: PaymentDto;
  justCreated?: boolean;
}) {
  const router = useRouter();
  const [reverseOpen, setReverseOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(
    justCreated
      ? {
          tone: "success",
          message: payment.receiptNumber
            ? `Posted payment ${payment.receiptNumber} (PHP ${payment.amount}).`
            : `Posted payment (PHP ${payment.amount}).`,
        }
      : null,
  );

  const allocationsSort = useTableSort(
    payment.allocations,
    ALLOCATION_SORT_COLUMNS,
  );
  const allocationsPage = useTablePagination(allocationsSort.sortedRows, {
    resetKey: `${allocationsSort.sort?.key ?? ""}|${allocationsSort.sort?.direction ?? ""}`,
  });

  const proofsSort = useTableSort(payment.proofs, PROOF_SORT_COLUMNS);
  const proofsPage = useTablePagination(proofsSort.sortedRows, {
    resetKey: `${proofsSort.sort?.key ?? ""}|${proofsSort.sort?.direction ?? ""}`,
  });

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {payment.receiptNumber
                ? `Receipt ${payment.receiptNumber}`
                : "Reversal entry"}
            </h1>
            <Badge tone={PAYMENT_BADGE_TONE[payment.status]}>
              {PAYMENT_STATUS_LABELS[payment.status]}
            </Badge>
            <Badge tone="neutral">
              {PAYMENT_METHOD_LABELS[payment.method]}
            </Badge>
          </div>
          <div className="grid gap-0.5 text-sm text-muted-foreground">
            <span>
              {payment.tenantId ? (
                <Link
                  href={`/tenants/${payment.tenantId}`}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {payment.tenantName}
                </Link>
              ) : (
                <Link
                  href="/transients"
                  className="font-medium text-foreground hover:text-primary"
                >
                  {payment.tenantName}
                </Link>
              )}
            </span>
            <span className="tabular-nums">
              Collected {formatManilaDate(payment.paidDateManila)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/payments"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Back to payments
          </Link>
          {payment.status === "POSTED" && (
            <Button
              size="md"
              variant="danger"
              onClick={() => setReverseOpen(true)}
            >
              Reverse payment
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

      {payment.reversalReason && (
        <Alert tone="warning" role="status">
          Reversal reason: {payment.reversalReason}
        </Alert>
      )}

      {payment.reversedPaymentId && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Counter-entry for original collection
          </span>
          <Link
            href={`/payments/${payment.reversedPaymentId}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            View original receipt
          </Link>
        </Card>
      )}

      {payment.reversalEntryId && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Reversed by linked entry
          </span>
          <Link
            href={`/payments/${payment.reversalEntryId}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            View reversal entry
          </Link>
        </Card>
      )}

      <Card className="grid gap-4">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Amount</dt>
            <dd className="text-base font-semibold text-foreground tabular-nums">
              {formatPhpCurrency(payment.amount)}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Allocated</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {formatPhpCurrency(payment.allocatedAmount)}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">
              Unallocated credit
            </dt>
            <dd className="font-medium text-foreground tabular-nums">
              {formatPhpCurrency(payment.unallocatedAmount)}
            </dd>
          </div>
        </dl>

        {(payment.referenceNo || payment.notes) && (
          <div className="grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-2">
            {payment.referenceNo && (
              <div className="grid gap-0.5">
                <span className="font-medium text-foreground">
                  Reference number
                </span>
                <span className="font-mono">{payment.referenceNo}</span>
              </div>
            )}
            {payment.notes && (
              <div className="grid gap-0.5 sm:col-span-2">
                <span className="font-medium text-foreground">Notes</span>
                <span className="whitespace-pre-wrap">{payment.notes}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Bills paid"
          count={`${payment.allocations.length} ${payment.allocations.length === 1 ? "bill" : "bills"}`}
        />

        {payment.allocations.length === 0 ? (
          <TableEmptyState
            title="No bills covered"
            description="No bills were paid by this receipt."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {allocationsPage.paginatedRows.map((alloc) => (
                <div
                  key={alloc.id}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <Link
                    href={`/billing/${alloc.invoiceId}`}
                    className="font-mono text-xs font-semibold text-primary tabular-nums hover:underline"
                  >
                    {alloc.invoiceNumber ?? alloc.invoiceId}
                  </Link>
                  <span className="shrink-0 font-semibold text-foreground tabular-nums">
                    {formatPhpCurrency(alloc.amount)}
                  </span>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead {...allocationsSort.sortHeaderProps("invoice")}>
                      Invoice
                    </TableHead>
                    <TableHead
                      numeric
                      {...allocationsSort.sortHeaderProps("amount")}
                    >
                      Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocationsPage.paginatedRows.map((alloc) => (
                    <TableRow key={alloc.id}>
                      <TableCell className="font-mono text-xs font-semibold tabular-nums">
                        <Link
                          href={`/billing/${alloc.invoiceId}`}
                          className="text-primary hover:underline"
                        >
                          {alloc.invoiceNumber ?? alloc.invoiceId}
                        </Link>
                      </TableCell>
                      <TableCell numeric className="font-semibold">
                        {formatPhpCurrency(alloc.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              {...allocationsPage.paginationProps}
              label="Bills paid table pagination"
            />
          </>
        )}
      </Card>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Attached proofs"
          count={`${payment.proofs.length} ${payment.proofs.length === 1 ? "file" : "files"}`}
        />

        {payment.proofs.length === 0 ? (
          <TableEmptyState
            title="No attached proofs"
            description="No proof files attached."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {proofsPage.paginatedRows.map((proof) => (
                <div key={proof.id} className="grid gap-2.5 p-4">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="truncate font-medium text-foreground">
                      {proof.fileName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {proof.mimeType}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatByteSize(proof.byteSize)}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <a
                      href={proof.downloadPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      View / download
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead {...proofsSort.sortHeaderProps("file")}>
                      File
                    </TableHead>
                    <TableHead {...proofsSort.sortHeaderProps("type")}>
                      Type
                    </TableHead>
                    <TableHead numeric {...proofsSort.sortHeaderProps("size")}>
                      Size
                    </TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proofsPage.paginatedRows.map((proof) => (
                    <TableRow key={proof.id}>
                      <TableCell className="font-medium text-foreground">
                        {proof.fileName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {proof.mimeType}
                      </TableCell>
                      <TableCell numeric className="text-muted-foreground">
                        {formatByteSize(proof.byteSize)}
                      </TableCell>
                      <TableCell className="text-right">
                        <a
                          href={proof.downloadPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonClasses({
                            variant: "secondary",
                            size: "sm",
                          })}
                        >
                          View / download
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              {...proofsPage.paginationProps}
              label="Attached proofs table pagination"
            />
          </>
        )}
      </Card>

      <ReversePaymentDialog
        payment={reverseOpen ? payment : null}
        onClose={() => setReverseOpen(false)}
        onSaved={(message) => {
          setFeedback({ tone: "success", message });
          router.refresh();
        }}
      />
    </div>
  );
}
