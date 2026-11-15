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
import { INVOICE_BADGE_TONE } from "@/components/features/billing/billing-dialogs";
import { PAYMENT_BADGE_TONE } from "@/components/features/payments/payment-dialogs";
import { formatBillingPeriodLabel } from "@/features/billing/calculations";
import { INVOICE_STATUS_LABELS } from "@/features/billing/schemas";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/features/payments/schemas";
import {
  archiveTenantAction,
  restoreTenantAction,
} from "@/features/tenants/actions";
import {
  TENANT_ASSIGNMENT_STATUS_LABELS,
  type TenantAssignmentDto,
  type TenantAssignmentStatusValue,
  type TenantDetailDto,
} from "@/features/tenants/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatManilaDate, formatManilaDateTime } from "@/lib/dates";
import { formatPhpCurrency, parseMoneyDecimal } from "@/lib/money";
import type { SortColumnDef } from "@/lib/table-sort";
import {
  AssignBedDialog,
  EditTenantDialog,
  MoveOutAssignmentDialog,
  TenantNotesDialog,
} from "./tenant-dialogs";

const ASSIGNMENT_BADGE_TONE: Record<
  TenantAssignmentStatusValue,
  "info" | "success" | "neutral"
> = {
  ACTIVE: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

type AssignmentSortKey =
  | "room"
  | "moveIn"
  | "plannedEnd"
  | "actualMoveOut"
  | "monthlyRate"
  | "deposit"
  | "status";

const ASSIGNMENT_SORT_COLUMNS: Record<
  AssignmentSortKey,
  SortColumnDef<TenantAssignmentDto>
> = {
  room: { getValue: (item) => item.roomNumber },
  moveIn: {
    getValue: (item) => item.startDateManila,
    kind: "date",
    defaultDirection: "desc",
  },
  plannedEnd: {
    getValue: (item) => item.endDateManila,
    kind: "date",
    defaultDirection: "desc",
  },
  actualMoveOut: {
    getValue: (item) => item.actualMoveOutDateManila,
    kind: "date",
    defaultDirection: "desc",
  },
  monthlyRate: {
    getValue: (item) => item.monthlyRate,
    kind: "money",
    defaultDirection: "desc",
  },
  deposit: {
    getValue: (item) => item.securityDeposit,
    kind: "money",
    defaultDirection: "desc",
  },
  status: { getValue: (item) => TENANT_ASSIGNMENT_STATUS_LABELS[item.status] },
};

type TenantNoteSortKey = "recorded" | "content";

const TENANT_NOTE_SORT_COLUMNS: Record<
  TenantNoteSortKey,
  SortColumnDef<TenantDetailDto["tenantNotes"][number]>
> = {
  recorded: {
    getValue: (note) => note.createdAt,
    kind: "date",
    defaultDirection: "desc",
  },
  content: { getValue: (note) => note.content },
};

type TenantInvoiceSortKey =
  "invoice" | "period" | "dueDate" | "total" | "balance" | "status";

const TENANT_INVOICE_SORT_COLUMNS: Record<
  TenantInvoiceSortKey,
  SortColumnDef<TenantDetailDto["invoices"][number]>
> = {
  invoice: { getValue: (inv) => inv.invoiceNumber },
  period: {
    getValue: (inv) => inv.billingPeriod,
    defaultDirection: "desc",
  },
  dueDate: {
    getValue: (inv) => inv.dueDateManila,
    kind: "date",
    defaultDirection: "desc",
  },
  total: {
    getValue: (inv) => inv.totalAmount,
    kind: "money",
    defaultDirection: "desc",
  },
  balance: {
    getValue: (inv) => inv.balanceAmount,
    kind: "money",
    defaultDirection: "desc",
  },
  status: {
    getValue: (inv) =>
      inv.isOverdue
        ? `${INVOICE_STATUS_LABELS[inv.status]} Overdue`
        : INVOICE_STATUS_LABELS[inv.status],
  },
};

type TenantPaymentSortKey = "receipt" | "date" | "method" | "amount" | "status";

const TENANT_PAYMENT_SORT_COLUMNS: Record<
  TenantPaymentSortKey,
  SortColumnDef<TenantDetailDto["payments"][number]>
> = {
  receipt: { getValue: (payment) => payment.receiptNumber },
  date: {
    getValue: (payment) => payment.paidDateManila,
    kind: "date",
    defaultDirection: "desc",
  },
  method: { getValue: (payment) => PAYMENT_METHOD_LABELS[payment.method] },
  amount: {
    getValue: (payment) => payment.amount,
    kind: "money",
    defaultDirection: "desc",
  },
  status: { getValue: (payment) => PAYMENT_STATUS_LABELS[payment.status] },
};

export function TenantDetailWorkspace({
  initialDetail,
}: {
  initialDetail: TenantDetailDto;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [movingOutAssignment, setMovingOutAssignment] =
    useState<TenantAssignmentDto | null>(null);
  const [archivePending, startArchiveTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  const {
    tenant,
    activeAssignment,
    assignments,
    tenantNotes,
    derivedBalance,
    unallocatedCredit,
    assignableBeds,
    invoices,
    payments,
    contracts,
  } = initialDetail;
  const isArchived = tenant.archivedAt !== null;

  const notesSort = useTableSort(tenantNotes, TENANT_NOTE_SORT_COLUMNS, {
    key: "recorded",
    direction: "desc",
  });
  const assignmentsSort = useTableSort(assignments, ASSIGNMENT_SORT_COLUMNS, {
    key: "moveIn",
    direction: "desc",
  });
  const invoicesSort = useTableSort(invoices, TENANT_INVOICE_SORT_COLUMNS, {
    key: "dueDate",
    direction: "desc",
  });
  const paymentsSort = useTableSort(payments, TENANT_PAYMENT_SORT_COLUMNS, {
    key: "date",
    direction: "desc",
  });

  const notesPage = useTablePagination(notesSort.sortedRows, {
    resetKey: `${notesSort.sort?.key ?? ""}|${notesSort.sort?.direction ?? ""}`,
  });

  const assignmentsPage = useTablePagination(assignmentsSort.sortedRows, {
    resetKey: `${assignmentsSort.sort?.key ?? ""}|${assignmentsSort.sort?.direction ?? ""}`,
  });
  const invoicesPage = useTablePagination(invoicesSort.sortedRows, {
    resetKey: `${invoicesSort.sort?.key ?? ""}|${invoicesSort.sort?.direction ?? ""}`,
  });
  const paymentsPage = useTablePagination(paymentsSort.sortedRows, {
    resetKey: `${paymentsSort.sort?.key ?? ""}|${paymentsSort.sort?.direction ?? ""}`,
  });

  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function handleArchiveRestore() {
    if (archivePending) return;
    setFeedback(null);
    setArchiveError(null);
    startArchiveTransition(async () => {
      const res = isArchived
        ? await restoreTenantAction({
            tenantId: tenant.id,
            expectedVersion: tenant.version,
          })
        : await archiveTenantAction({
            tenantId: tenant.id,
            expectedVersion: tenant.version,
          });
      if (res.status === "saved") {
        setArchiveConfirmOpen(false);
        setFeedback({ tone: "success", message: res.message });
        router.refresh();
      } else if (res.status === "error") {
        setArchiveError(res.message);
      }
    });
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {tenant.fullName}
            </h1>
            {isArchived && <Badge tone="neutral">Archived</Badge>}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Boarder profile, active room allocation, and complete assignment
            history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/tenants"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Back to tenants
          </Link>
          {!isArchived && (
            <Button
              size="md"
              variant="secondary"
              onClick={() => setEditOpen(true)}
            >
              Edit profile
            </Button>
          )}
          <Button
            size="md"
            variant={isArchived ? "primary" : "danger"}
            loading={archivePending}
            disabled={!isArchived && Boolean(activeAssignment)}
            onClick={() => {
              setArchiveError(null);
              setArchiveConfirmOpen(true);
            }}
          >
            {isArchived ? "Restore tenant" : "Archive tenant"}
          </Button>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="grid content-start gap-4 lg:col-span-2">
          <h2 className="text-base font-semibold text-foreground">
            Contact &amp; profile details
          </h2>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div className="grid gap-1">
              <dt className="text-xs font-medium text-muted-foreground">
                Phone
              </dt>
              <dd className="text-foreground">
                {tenant.phone ?? "Not provided"}
              </dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-xs font-medium text-muted-foreground">
                Email
              </dt>
              <dd className="text-foreground">
                {tenant.email ?? "Not provided"}
              </dd>
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">
                Home address
              </dt>
              <dd className="text-foreground">
                {tenant.address ?? "Not provided"}
              </dd>
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">
                Emergency contact
              </dt>
              <dd className="text-foreground">
                {tenant.emergencyContact ?? "Not provided"}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="grid content-start gap-4">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold text-foreground">
              Current occupancy &amp; balance
            </h2>
            <p className="text-xs text-muted-foreground">
              Derived read-only balance from posted invoices and payments.
            </p>
          </div>

          <div className="grid gap-3 rounded-control border border-border bg-background/60 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground">
                  Derived balance
                </span>
                <div className="mt-1 text-xl font-semibold text-foreground tabular-nums">
                  {formatPhpCurrency(derivedBalance)}
                </div>
              </div>
              <Link
                href={`/payments/new?tenantId=${tenant.id}`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Record payment
              </Link>
            </div>
            {parseMoneyDecimal(unallocatedCredit) > BigInt(0) && (
              <p className="text-xs text-muted-foreground tabular-nums">
                Includes{" "}
                <strong className="font-semibold text-foreground">
                  {formatPhpCurrency(unallocatedCredit)}
                </strong>{" "}
                unallocated credit ready for future invoices.
              </p>
            )}
          </div>

          {activeAssignment ? (
            <div className="grid gap-3 rounded-control border border-border bg-surface p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  Room {activeAssignment.roomNumber}
                </span>
                <Badge tone="info">Active</Badge>
              </div>
              <dl className="grid gap-1.5 text-xs text-muted-foreground tabular-nums">
                <div className="flex justify-between gap-2">
                  <dt>Move-in</dt>
                  <dd className="font-medium text-foreground">
                    {formatManilaDate(activeAssignment.startDateManila)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Planned end</dt>
                  <dd className="font-medium text-foreground">
                    {formatManilaDate(activeAssignment.endDateManila)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Monthly rate</dt>
                  <dd className="font-medium text-foreground">
                    {formatPhpCurrency(activeAssignment.monthlyRate)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Security deposit</dt>
                  <dd className="font-medium text-foreground">
                    {formatPhpCurrency(activeAssignment.securityDeposit)}
                  </dd>
                </div>
              </dl>
              <Button
                size="md"
                variant="secondary"
                onClick={() => setMovingOutAssignment(activeAssignment)}
              >
                Record move-out
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 rounded-control border border-border bg-background/50 p-3.5">
              <span className="text-xs text-muted-foreground">
                {isArchived
                  ? "Restore this tenant profile to assign a room."
                  : "This tenant is not assigned to any room right now."}
              </span>
              {!isArchived && (
                <Button size="md" onClick={() => setAssignOpen(true)}>
                  Assign room
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Notes"
          description="Separate timestamped notes recorded for this tenant."
          count={`${tenantNotes.length} ${tenantNotes.length === 1 ? "note" : "notes"}`}
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setNotesOpen(true)}
            >
              {isArchived ? "View notes" : "Add / manage notes"}
            </Button>
          }
        />

        {tenantNotes.length === 0 ? (
          <TableEmptyState
            title="No notes recorded"
            description="No notes recorded for this tenant yet."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {notesPage.paginatedRows.map((note) => (
                <div key={note.id} className="grid gap-1.5 p-4">
                  <time
                    dateTime={note.createdAt}
                    className="text-xs font-medium text-muted-foreground tabular-nums"
                  >
                    {formatManilaDateTime(new Date(note.createdAt))}
                  </time>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {note.content}
                  </p>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead {...notesSort.sortHeaderProps("recorded")}>
                      Recorded
                    </TableHead>
                    <TableHead {...notesSort.sortHeaderProps("content")}>
                      Note
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notesPage.paginatedRows.map((note) => (
                    <TableRow key={note.id}>
                      <TableCell className="whitespace-nowrap text-xs font-medium text-muted-foreground tabular-nums">
                        <time dateTime={note.createdAt}>
                          {formatManilaDateTime(new Date(note.createdAt))}
                        </time>
                      </TableCell>
                      <TableCell className="whitespace-pre-wrap text-foreground">
                        {note.content}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              {...notesPage.paginationProps}
              label="Tenant notes table pagination"
            />
          </>
        )}
      </Card>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Assignment history"
          count={`${assignments.length} ${assignments.length === 1 ? "assignment" : "assignments"}`}
        />

        {assignments.length === 0 ? (
          <TableEmptyState
            title="No room assignments yet"
            description="Assign an available room above to record move-in dates and rates."
            actions={
              !isArchived ? (
                <Button size="md" onClick={() => setAssignOpen(true)}>
                  Assign room
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {assignmentsPage.paginatedRows.map((item) => (
                <div key={item.id} className="grid gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid min-w-0 gap-0.5">
                      <span className="font-medium text-foreground tabular-nums">
                        Room {item.roomNumber}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Move-in: {formatManilaDate(item.startDateManila)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Planned end: {formatManilaDate(item.endDateManila)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Actual move-out:{" "}
                        {item.actualMoveOutDateManila
                          ? formatManilaDate(item.actualMoveOutDateManila)
                          : "—"}
                      </span>
                    </div>
                    <Badge tone={ASSIGNMENT_BADGE_TONE[item.status]}>
                      {TENANT_ASSIGNMENT_STATUS_LABELS[item.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs tabular-nums">
                    <span className="text-muted-foreground">
                      Rate {formatPhpCurrency(item.monthlyRate)}
                    </span>
                    <span className="font-medium text-foreground">
                      Deposit {formatPhpCurrency(item.securityDeposit)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead {...assignmentsSort.sortHeaderProps("room")}>
                      Room
                    </TableHead>
                    <TableHead {...assignmentsSort.sortHeaderProps("moveIn")}>
                      Move-in
                    </TableHead>
                    <TableHead
                      {...assignmentsSort.sortHeaderProps("plannedEnd")}
                    >
                      Planned end
                    </TableHead>
                    <TableHead
                      {...assignmentsSort.sortHeaderProps("actualMoveOut")}
                    >
                      Actual move-out
                    </TableHead>
                    <TableHead
                      numeric
                      {...assignmentsSort.sortHeaderProps("monthlyRate")}
                    >
                      Monthly rate
                    </TableHead>
                    <TableHead
                      numeric
                      {...assignmentsSort.sortHeaderProps("deposit")}
                    >
                      Deposit
                    </TableHead>
                    <TableHead {...assignmentsSort.sortHeaderProps("status")}>
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignmentsPage.paginatedRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium tabular-nums">
                        Room {item.roomNumber}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatManilaDate(item.startDateManila)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatManilaDate(item.endDateManila)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {item.actualMoveOutDateManila
                          ? formatManilaDate(item.actualMoveOutDateManila)
                          : "—"}
                      </TableCell>
                      <TableCell numeric>
                        {formatPhpCurrency(item.monthlyRate)}
                      </TableCell>
                      <TableCell numeric>
                        {formatPhpCurrency(item.securityDeposit)}
                      </TableCell>
                      <TableCell>
                        <Badge tone={ASSIGNMENT_BADGE_TONE[item.status]}>
                          {TENANT_ASSIGNMENT_STATUS_LABELS[item.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              {...assignmentsPage.paginationProps}
              label="Assignment history table pagination"
            />
          </>
        )}
      </Card>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Signed contracts"
          description="Private digital scans or PDF copies of signed paper lease contracts."
          count={`${contracts.length} ${contracts.length === 1 ? "contract" : "contracts"}`}
          actions={
            !isArchived ? (
              <Link
                href={`/tenants/${tenant.id}/contracts/new`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Add signed contract
              </Link>
            ) : undefined
          }
        />

        {contracts.length === 0 ? (
          <TableEmptyState
            title="No signed contracts uploaded"
            description={`Keep scanned copies or PDFs of signed boarding house contracts for ${tenant.fullName}.`}
            actions={
              !isArchived ? (
                <Link
                  href={`/tenants/${tenant.id}/contracts/new`}
                  className={buttonClasses({
                    variant: "secondary",
                    size: "md",
                  })}
                >
                  Add signed contract
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="divide-y divide-border md:hidden">
              {contracts.map((contract) => (
                <div key={contract.id} className="grid gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid gap-0.5">
                      <Link
                        href={`/tenants/${tenant.id}/contracts/${contract.id}`}
                        className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                      >
                        {contract.title}
                      </Link>
                      {contract.assignmentRoomNumber && (
                        <span className="text-xs text-muted-foreground">
                          Room {contract.assignmentRoomNumber}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {contract.signedDateManila
                          ? `Signed ${formatManilaDate(contract.signedDateManila)}`
                          : "Signed date not set"}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {contract.pageCount}{" "}
                        {contract.pageCount === 1 ? "page" : "pages"}
                      </span>
                    </div>
                    <Badge tone={contract.archivedAt ? "neutral" : "success"}>
                      {contract.archivedAt ? "Archived" : "Stored"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract</TableHead>
                    <TableHead>Signed date</TableHead>
                    <TableHead numeric>Pages</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell>
                        <div className="grid gap-0.5">
                          <Link
                            href={`/tenants/${tenant.id}/contracts/${contract.id}`}
                            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                          >
                            {contract.title}
                          </Link>
                          {contract.assignmentRoomNumber && (
                            <span className="text-xs text-muted-foreground">
                              Room {contract.assignmentRoomNumber}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contract.signedDateManila
                          ? formatManilaDate(contract.signedDateManila)
                          : "—"}
                      </TableCell>
                      <TableCell numeric className="tabular-nums">
                        {contract.pageCount}
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={contract.archivedAt ? "neutral" : "success"}
                        >
                          {contract.archivedAt ? "Archived" : "Stored"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/tenants/${tenant.id}/contracts/${contract.id}`}
                          className={buttonClasses({
                            variant: "secondary",
                            size: "sm",
                          })}
                        >
                          Inspect
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Invoices"
          count={`${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/billing"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Open billing
              </Link>
              <Link
                href={`/billing/new?tenantId=${tenant.id}`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Create invoice
              </Link>
            </div>
          }
        />

        {invoices.length === 0 ? (
          <TableEmptyState
            title="No invoices recorded"
            description="No invoices recorded for this tenant yet."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {invoicesPage.paginatedRows.map((inv) => (
                <div key={inv.id} className="grid gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid min-w-0 gap-0.5">
                      <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                        {inv.invoiceNumber ?? "Draft"}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {inv.billingPeriod
                          ? formatBillingPeriodLabel(inv.billingPeriod)
                          : "Ad-hoc"}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Due {formatManilaDate(inv.dueDateManila)}
                      </span>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge tone={INVOICE_BADGE_TONE[inv.status]}>
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </Badge>
                      {inv.isOverdue && <Badge tone="danger">Overdue</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                    <span className="text-muted-foreground">
                      Total {formatPhpCurrency(inv.totalAmount)}
                    </span>
                    <span className="font-semibold text-foreground">
                      Open {formatPhpCurrency(inv.balanceAmount)}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <Link
                      href={`/billing/${inv.id}`}
                      className={buttonClasses({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      Inspect
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead {...invoicesSort.sortHeaderProps("invoice")}>
                      Invoice
                    </TableHead>
                    <TableHead {...invoicesSort.sortHeaderProps("period")}>
                      Period
                    </TableHead>
                    <TableHead {...invoicesSort.sortHeaderProps("dueDate")}>
                      Due date
                    </TableHead>
                    <TableHead
                      numeric
                      {...invoicesSort.sortHeaderProps("total")}
                    >
                      Total
                    </TableHead>
                    <TableHead
                      numeric
                      {...invoicesSort.sortHeaderProps("balance")}
                    >
                      Open balance
                    </TableHead>
                    <TableHead {...invoicesSort.sortHeaderProps("status")}>
                      Status
                    </TableHead>
                    <TableHead className="text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoicesPage.paginatedRows.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs font-semibold tabular-nums">
                        {inv.invoiceNumber ?? "Draft"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {inv.billingPeriod
                          ? formatBillingPeriodLabel(inv.billingPeriod)
                          : "Ad-hoc"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatManilaDate(inv.dueDateManila)}
                      </TableCell>
                      <TableCell numeric>
                        {formatPhpCurrency(inv.totalAmount)}
                      </TableCell>
                      <TableCell numeric className="font-semibold">
                        {formatPhpCurrency(inv.balanceAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={INVOICE_BADGE_TONE[inv.status]}>
                            {INVOICE_STATUS_LABELS[inv.status]}
                          </Badge>
                          {inv.isOverdue && (
                            <Badge tone="danger">Overdue</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/billing/${inv.id}`}
                          className={buttonClasses({
                            variant: "ghost",
                            size: "sm",
                          })}
                        >
                          Inspect
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              {...invoicesPage.paginationProps}
              label="Tenant invoices table pagination"
            />
          </>
        )}
      </Card>

      <Card className="overflow-hidden p-0 sm:p-0">
        <TableCardHeader
          title="Payments"
          count={`${payments.length} ${payments.length === 1 ? "entry" : "entries"}`}
          actions={
            <Link
              href={`/payments/new?tenantId=${tenant.id}`}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Record payment
            </Link>
          }
        />

        {payments.length === 0 ? (
          <TableEmptyState
            title="No payments recorded"
            description="No payments recorded for this tenant yet."
          />
        ) : (
          <>
            <div className="grid divide-y divide-border md:hidden">
              {paymentsPage.paginatedRows.map((payment) => (
                <div key={payment.id} className="grid gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid min-w-0 gap-0.5">
                      <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                        {payment.receiptNumber ?? "Reversal"}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatManilaDate(payment.paidDateManila)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LABELS[payment.method]}
                      </span>
                    </div>
                    <Badge tone={PAYMENT_BADGE_TONE[payment.status]}>
                      {PAYMENT_STATUS_LABELS[payment.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatPhpCurrency(payment.amount)}
                    </span>
                    <Link
                      href={`/payments/${payment.id}`}
                      className={buttonClasses({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      Inspect
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead {...paymentsSort.sortHeaderProps("receipt")}>
                      Receipt
                    </TableHead>
                    <TableHead {...paymentsSort.sortHeaderProps("date")}>
                      Date
                    </TableHead>
                    <TableHead {...paymentsSort.sortHeaderProps("method")}>
                      Method
                    </TableHead>
                    <TableHead
                      numeric
                      {...paymentsSort.sortHeaderProps("amount")}
                    >
                      Amount
                    </TableHead>
                    <TableHead {...paymentsSort.sortHeaderProps("status")}>
                      Status
                    </TableHead>
                    <TableHead className="text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsPage.paginatedRows.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono text-xs font-semibold tabular-nums">
                        {payment.receiptNumber ?? "Reversal"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatManilaDate(payment.paidDateManila)}
                      </TableCell>
                      <TableCell>
                        {PAYMENT_METHOD_LABELS[payment.method]}
                      </TableCell>
                      <TableCell numeric className="font-semibold">
                        {formatPhpCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge tone={PAYMENT_BADGE_TONE[payment.status]}>
                          {PAYMENT_STATUS_LABELS[payment.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/payments/${payment.id}`}
                          className={buttonClasses({
                            variant: "ghost",
                            size: "sm",
                          })}
                        >
                          Inspect
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              {...paymentsPage.paginationProps}
              label="Tenant payments table pagination"
            />
          </>
        )}
      </Card>

      <EditTenantDialog
        tenant={editOpen ? tenant : null}
        onClose={() => setEditOpen(false)}
        onSaved={(message) => {
          setFeedback({ tone: "success", message });
          router.refresh();
        }}
      />

      <AssignBedDialog
        tenant={assignOpen ? tenant : null}
        beds={assignableBeds}
        onClose={() => setAssignOpen(false)}
        onSaved={(message) => {
          setFeedback({ tone: "success", message });
          router.refresh();
        }}
      />

      <MoveOutAssignmentDialog
        assignment={movingOutAssignment}
        tenantName={tenant.fullName}
        onClose={() => setMovingOutAssignment(null)}
        onSaved={(message) => {
          setFeedback({ tone: "success", message });
          router.refresh();
        }}
      />

      <TenantNotesDialog
        tenant={notesOpen ? tenant : null}
        notes={tenantNotes}
        onClose={() => setNotesOpen(false)}
        onNotesChanged={() => router.refresh()}
      />
      <ConfirmDialog
        open={archiveConfirmOpen}
        onClose={() => {
          if (!archivePending) {
            setArchiveError(null);
            setArchiveConfirmOpen(false);
          }
        }}
        onConfirm={handleArchiveRestore}
        title={
          isArchived
            ? `Restore ${tenant.fullName}?`
            : `Archive ${tenant.fullName}?`
        }
        description={
          isArchived
            ? "Restoring returns this tenant profile to active boarder lists."
            : "Archiving moves this tenant out of active boarder lists. You can restore the profile anytime."
        }
        errorMessage={archiveError}
        confirmLabel={isArchived ? "Restore tenant" : "Archive tenant"}
        confirmVariant={isArchived ? "primary" : "danger"}
        loading={archivePending}
      />
    </div>
  );
}
