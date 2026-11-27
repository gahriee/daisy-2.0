"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  OfflineSnapshotBanner,
  useOfflineSnapshotState,
} from "@/components/features/offline/offline-vault-unlock";
import { Alert } from "@/components/ui/alert";
import { Badge, CountPill } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import {
  SearchFilterBar,
  SearchFilterInput,
} from "@/components/ui/search-filter";
import {
  RowActionMenu,
  type RowActionItem,
} from "@/components/ui/row-action-menu";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCardHeader,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FilterToggleButton,
  TableColumnPicker,
  type TableColumnOption,
} from "@/components/ui/table-column-picker";
import { TablePagination } from "@/components/ui/table-pagination";
import { toast } from "@/components/ui/toaster";
import { issueDraftInvoiceAction } from "@/features/billing/actions";
import {
  sendOverdueSmsBatchAction,
  sendOverdueSmsForInvoiceAction,
} from "@/features/sms/actions";
import { formatBillingPeriodLabel } from "@/features/billing/calculations";
import {
  INVOICE_STATUS_LABELS,
  type BillingOverviewDto,
  type InvoiceDto,
} from "@/features/billing/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency, parseMoneyDecimal } from "@/lib/money";
import type { SortColumnDef } from "@/lib/table-sort";
import { loadBillingOverviewFromVault } from "@/offline/snapshot-selectors-extra";
import {
  AddAdjustmentDialog,
  GeneratePeriodInvoicesDialog,
  INVOICE_BADGE_TONE,
} from "./billing-dialogs";

type BillingViewFilter = "all" | "open" | "overdue" | "draft" | "paid" | "void";

type BillingSortKey =
  "invoice" | "tenant" | "period" | "dueDate" | "total" | "balance" | "status";

const BILLING_SORT_COLUMNS: Record<
  BillingSortKey,
  SortColumnDef<InvoiceDto>
> = {
  invoice: { getValue: (invoice) => invoice.invoiceNumber },
  tenant: {
    getValue: (invoice) => invoice.snapshotTenantName ?? "Guest",
  },
  period: {
    getValue: (invoice) => invoice.billingPeriod,
    defaultDirection: "desc",
  },
  dueDate: {
    getValue: (invoice) => invoice.dueDateManila,
    kind: "date",
    defaultDirection: "desc",
  },
  total: {
    getValue: (invoice) => invoice.totalAmount,
    kind: "money",
    defaultDirection: "desc",
  },
  balance: {
    getValue: (invoice) => invoice.balanceAmount,
    kind: "money",
    defaultDirection: "desc",
  },
  status: {
    getValue: (invoice) =>
      invoice.isOverdue
        ? `${INVOICE_STATUS_LABELS[invoice.status]} Overdue`
        : INVOICE_STATUS_LABELS[invoice.status],
  },
};

function RefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16.25 10a6.25 6.25 0 1 1-1.6-4.18" />
      <path d="M16.5 3.5v3.25h-3.25" />
    </svg>
  );
}

function ReceivablesIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z" />
      <circle cx="12" cy="12" r="2.25" />
    </svg>
  );
}

function OverdueIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v4.75l3 1.75" />
    </svg>
  );
}

function DraftIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3.75h7l4.25 4.25v12.25A1.25 1.25 0 0 1 17 21.5H7a1.25 1.25 0 0 1-1.25-1.25V5A1.25 1.25 0 0 1 7 3.75Z" />
      <path d="M14 3.75V8h4.25" />
      <path d="M9 12.25h6" />
      <path d="M9 15.75h4.5" />
    </svg>
  );
}

function PeriodTotalIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.25v3.5M16 3.25v3.5M3.5 9.75h17" />
    </svg>
  );
}

type BillingPayerFilter = "all" | "boarder" | "transient";

type BillingColumnKey =
  | "payer"
  | "dueDate"
  | "balance"
  | "status"
  | "period"
  | "total"
  | "paid"
  | "items";

const BILLING_COLUMN_OPTIONS: readonly TableColumnOption<BillingColumnKey>[] = [
  { key: "payer", label: "Boarder / Guest", group: "Browse records" },
  { key: "dueDate", label: "Due date", group: "Browse records" },
  { key: "balance", label: "Balance", group: "Browse records" },
  { key: "status", label: "Status", group: "Browse records" },
  { key: "period", label: "Period", group: "More details" },
  { key: "total", label: "Total", group: "More details" },
  { key: "paid", label: "Paid", group: "More details" },
  { key: "items", label: "Line items", group: "More details" },
];

const DEFAULT_BILLING_COLUMNS: readonly BillingColumnKey[] = [
  "payer",
  "dueDate",
  "balance",
  "status",
];

function parseOptionalMoneyFilter(raw: string): bigint | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return parseMoneyDecimal(trimmed);
  } catch {
    return null;
  }
}

export function BillingWorkspace({
  initialOverview,
  offlineMode = false,
  initialLastSyncedAt = null,
}: {
  initialOverview: BillingOverviewDto;
  offlineMode?: boolean;
  initialLastSyncedAt?: string | null;
}) {
  const {
    data: overview,
    online,
    isOfflineView,
    lastSyncedAt,
    pendingCount,
    needsAttentionCount,
    reload,
  } = useOfflineSnapshotState<BillingOverviewDto>({
    initialData: initialOverview,
    offlineMode,
    initialLastSyncedAt,
    loadFromVault: async (db, key) => {
      const res = await loadBillingOverviewFromVault(db, key);
      return { data: res.overview, lastSyncedAt: res.lastSyncedAt };
    },
    fetchOnline: async () => {
      const response = await fetch("/api/billing", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not refresh billing ledger right now.");
      }
      return (await response.json()) as BillingOverviewDto;
    },
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewFilter, setViewFilter] = useState<BillingViewFilter>("all");
  const [payerFilter, setPayerFilter] = useState<BillingPayerFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("ALL");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [minBalance, setMinBalance] = useState("");
  const [maxBalance, setMaxBalance] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<BillingColumnKey[]>([
    ...DEFAULT_BILLING_COLUMNS,
  ]);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [adjustingInvoice, setAdjustingInvoice] = useState<InvoiceDto | null>(
    null,
  );
  const [issuingInvoice, setIssuingInvoice] = useState<InvoiceDto | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [smsTargetInvoice, setSmsTargetInvoice] = useState<InvoiceDto | null>(
    null,
  );
  const [smsBatchConfirmOpen, setSmsBatchConfirmOpen] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rowPendingId, setRowPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function reloadBilling() {
    setRefreshing(true);
    try {
      await reload();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Connect to the internet to refresh billing.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function handleConfirmIssue() {
    if (!issuingInvoice || rowPendingId) return;
    const invoice = issuingInvoice;
    setErrorMessage(null);
    setIssueError(null);
    setRowPendingId(invoice.id);
    startTransition(async () => {
      try {
        const res = await issueDraftInvoiceAction({
          invoiceId: invoice.id,
          expectedVersion: invoice.version,
        });
        if (res.status === "saved") {
          setIssuingInvoice(null);
          toast.success(res.message);
          await reloadBilling();
        } else if (res.status === "error") {
          setIssueError(res.message);
        }
      } finally {
        setRowPendingId(null);
      }
    });
  }

  function handleConfirmSingleSms() {
    if (!smsTargetInvoice || smsSending) return;
    const invoice = smsTargetInvoice;
    setSmsError(null);
    setSmsSending(true);
    startTransition(async () => {
      try {
        const res = await sendOverdueSmsForInvoiceAction({
          invoiceId: invoice.id,
        });
        if (res.status === "saved") {
          setSmsTargetInvoice(null);
          toast.success(res.message);
        } else if (res.status === "error") {
          setSmsError(res.message);
        }
      } finally {
        setSmsSending(false);
      }
    });
  }

  function handleConfirmBatchSms() {
    if (smsSending) return;
    setSmsError(null);
    setSmsSending(true);
    startTransition(async () => {
      try {
        const res = await sendOverdueSmsBatchAction();
        if (res.status === "saved") {
          setSmsBatchConfirmOpen(false);
          toast.success(res.message);
        } else if (res.status === "error") {
          setSmsError(res.message);
        }
      } finally {
        setSmsSending(false);
      }
    });
  }

  const overdueBoardingCount = overview.invoices.filter(
    (inv) => inv.isOverdue && Boolean(inv.tenantId),
  ).length;

  const periodOptions = Array.from(
    new Set(
      overview.invoices
        .map((inv) => inv.billingPeriod)
        .filter((period): period is string => period !== null),
    ),
  ).sort((a, b) => b.localeCompare(a));

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const minBalanceCentavos = parseOptionalMoneyFilter(minBalance);
  const maxBalanceCentavos = parseOptionalMoneyFilter(maxBalance);
  const filteredInvoices = overview.invoices.filter((invoice) => {
    if (
      viewFilter === "open" &&
      invoice.status !== "ISSUED" &&
      invoice.status !== "PARTIALLY_PAID"
    ) {
      return false;
    }
    if (viewFilter === "overdue" && !invoice.isOverdue) return false;
    if (viewFilter === "draft" && invoice.status !== "DRAFT") return false;
    if (viewFilter === "paid" && invoice.status !== "PAID") return false;
    if (viewFilter === "void" && invoice.status !== "VOID") return false;

    if (payerFilter === "boarder" && !invoice.tenantId) return false;
    if (payerFilter === "transient" && !invoice.transientGuestId) return false;

    if (periodFilter === "AD_HOC" && invoice.billingPeriod !== null) {
      return false;
    }
    if (
      periodFilter !== "ALL" &&
      periodFilter !== "AD_HOC" &&
      invoice.billingPeriod !== periodFilter
    ) {
      return false;
    }

    if (dueDateFrom && invoice.dueDateManila < dueDateFrom) return false;
    if (dueDateTo && invoice.dueDateManila > dueDateTo) return false;

    if (minBalanceCentavos !== null || maxBalanceCentavos !== null) {
      const bal = parseMoneyDecimal(invoice.balanceAmount);
      if (minBalanceCentavos !== null && bal < minBalanceCentavos) return false;
      if (maxBalanceCentavos !== null && bal > maxBalanceCentavos) return false;
    }

    if (!normalizedQuery) return true;
    const haystack = [
      invoice.invoiceNumber ?? "draft",
      invoice.snapshotTenantName ?? "",
      invoice.snapshotRoomNumber ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const extraFilterCount =
    (payerFilter !== "all" ? 1 : 0) +
    (periodFilter !== "ALL" ? 1 : 0) +
    (dueDateFrom !== "" ? 1 : 0) +
    (dueDateTo !== "" ? 1 : 0) +
    (minBalance.trim() !== "" ? 1 : 0) +
    (maxBalance.trim() !== "" ? 1 : 0);

  const hasActiveFilter =
    normalizedQuery !== "" || viewFilter !== "all" || extraFilterCount > 0;

  function clearAllBillingFilters() {
    setSearchQuery("");
    setViewFilter("all");
    setPayerFilter("all");
    setPeriodFilter("ALL");
    setDueDateFrom("");
    setDueDateTo("");
    setMinBalance("");
    setMaxBalance("");
  }

  const showCol = (key: BillingColumnKey) => visibleColumns.includes(key);

  const {
    sortedRows: sortedInvoices,
    sort,
    sortHeaderProps,
  } = useTableSort(filteredInvoices, BILLING_SORT_COLUMNS, {
    key: "dueDate",
    direction: "desc",
  });

  const { paginatedRows: paginatedInvoices, paginationProps } =
    useTablePagination(sortedInvoices, {
      resetKey: `${normalizedQuery}|${viewFilter}|${payerFilter}|${periodFilter}|${dueDateFrom}|${dueDateTo}|${minBalance}|${maxBalance}|${sort?.key ?? ""}|${sort?.direction ?? ""}`,
    });

  function getInvoiceRowActions(
    invoice: InvoiceDto,
    isRowBusy: boolean,
  ): RowActionItem[] {
    return [
      {
        id: "inspect",
        label: "Inspect",
        href: `/billing/${invoice.id}`,
      },
      ...(invoice.status === "DRAFT"
        ? [
            {
              id: "issue",
              label: isOfflineView ? "Issue (online only)" : "Issue",
              busy: isRowBusy,
              disabled: isOfflineView || !overview.invoicePrefix,
              onSelect: () => {
                setIssueError(null);
                setIssuingInvoice(invoice);
              },
            },
          ]
        : []),
      ...(invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID"
        ? [
            {
              id: "pay",
              label: "Record payment",
              href: `/payments/new?invoiceId=${invoice.id}`,
            },
            {
              id: "adjust",
              label: isOfflineView ? "Adjust (online only)" : "Adjust",
              disabled: isOfflineView,
              onSelect: () => setAdjustingInvoice(invoice),
            },
            ...(invoice.isOverdue && invoice.tenantId
              ? [
                  {
                    id: "send-overdue-sms",
                    label: isOfflineView
                      ? "Send overdue SMS (online only)"
                      : "Send overdue SMS",
                    disabled: isOfflineView || smsSending,
                    onSelect: () => {
                      setSmsError(null);
                      setSmsTargetInvoice(invoice);
                    },
                  },
                ]
              : []),
          ]
        : []),
    ];
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Billing &amp; invoices
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Monthly rent runs, itemized statements, adjustments, and due dates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            onClick={reloadBilling}
          >
            <RefreshIcon />
            Refresh
          </Button>
          {!isOfflineView && overdueBoardingCount > 0 && (
            <Button
              size="md"
              variant="secondary"
              disabled={smsSending}
              onClick={() => {
                setSmsError(null);
                setSmsBatchConfirmOpen(true);
              }}
            >
              <span>Send overdue SMS</span>
              <CountPill tone="warning">{overdueBoardingCount}</CountPill>
            </Button>
          )}
          {!isOfflineView && (
            <Link
              href="/billing/new"
              className={buttonClasses({ variant: "secondary", size: "md" })}
            >
              Create invoice
            </Link>
          )}
          <Button
            size="md"
            disabled={isOfflineView || !overview.policiesComplete}
            onClick={() => setGenerateOpen(true)}
          >
            {isOfflineView
              ? "Generate invoices (online only)"
              : "Generate monthly invoices"}
          </Button>
        </div>
      </header>

      <OfflineSnapshotBanner
        online={online}
        offlineMode={offlineMode}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        needsAttentionCount={needsAttentionCount}
        syncing={refreshing}
        onSyncNow={reloadBilling}
      />

      {!overview.policiesComplete && (
        <Alert tone="warning" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Billing policies ({overview.missingPolicyFields.join(", ")}) are
              not ready yet. Ask your setup contact to check the server
              configuration.
            </span>
          </div>
        </Alert>
      )}

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Open receivables"
          value={formatPhpCurrency(overview.summary.openReceivablesAmount)}
          description={`${overview.summary.issuedOpenCount} unpaid ${
            overview.summary.issuedOpenCount === 1 ? "invoice" : "invoices"
          }`}
          icon={<ReceivablesIcon />}
        />
        <MetricCard
          label="Overdue invoices"
          value={overview.summary.overdueCount}
          description="Past due date"
          tone={overview.summary.overdueCount > 0 ? "warning" : "neutral"}
          icon={<OverdueIcon />}
        />
        <MetricCard
          label="Draft invoices"
          value={overview.summary.draftCount}
          description="Awaiting official number"
          icon={<DraftIcon />}
        />
        <MetricCard
          label="Billed this month"
          value={formatPhpCurrency(overview.summary.billedCurrentPeriodAmount)}
          description={formatBillingPeriodLabel(overview.currentBillingPeriod)}
          tone="info"
          icon={<PeriodTotalIcon />}
        />
      </div>

      <SearchFilterBar
        aria-label="Find invoices"
        hasActiveFilters={hasActiveFilter}
        onClearAll={clearAllBillingFilters}
      >
        <div className="grid gap-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Field id="billing-search" label="Find an invoice">
                {(fieldProps) => (
                  <SearchFilterInput
                    {...fieldProps}
                    placeholder="Invoice #, name, or room"
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                )}
              </Field>
            </div>
            <div className="w-full sm:w-44">
              <Field id="billing-status-filter" label="Status">
                {(fieldProps) => (
                  <Select
                    {...fieldProps}
                    variant="filter"
                    value={viewFilter}
                    onChange={(event) =>
                      setViewFilter(event.target.value as BillingViewFilter)
                    }
                  >
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="overdue">Overdue</option>
                    <option value="draft">Drafts</option>
                    <option value="paid">Paid</option>
                    <option value="void">Void</option>
                  </Select>
                )}
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterToggleButton
                open={filtersOpen}
                activeCount={extraFilterCount}
                onToggle={() => setFiltersOpen((prev) => !prev)}
                controlsId="billing-filters-panel"
              />
              <TableColumnPicker
                options={BILLING_COLUMN_OPTIONS}
                visibleKeys={visibleColumns}
                defaultKeys={DEFAULT_BILLING_COLUMNS}
                onChange={setVisibleColumns}
              />
            </div>
          </div>

          {filtersOpen && (
            <div
              id="billing-filters-panel"
              className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Field id="billing-payer-filter" label="Payer type">
                {(fieldProps) => (
                  <Select
                    {...fieldProps}
                    variant="filter"
                    value={payerFilter}
                    onChange={(event) =>
                      setPayerFilter(event.target.value as BillingPayerFilter)
                    }
                  >
                    <option value="all">All payers</option>
                    <option value="boarder">Boarders</option>
                    <option value="transient">Transient guests</option>
                  </Select>
                )}
              </Field>

              <Field id="billing-period-filter" label="Period">
                {(fieldProps) => (
                  <Select
                    {...fieldProps}
                    variant="filter"
                    value={periodFilter}
                    onChange={(event) => setPeriodFilter(event.target.value)}
                  >
                    <option value="ALL">All periods</option>
                    <option value="AD_HOC">Ad-hoc</option>
                    {periodOptions.map((period) => (
                      <option key={period} value={period}>
                        {formatBillingPeriodLabel(period)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field id="billing-due-from" label="Due date from">
                {(fieldProps) => (
                  <DatePicker
                    {...fieldProps}
                    value={dueDateFrom}
                    onValueChange={setDueDateFrom}
                  />
                )}
              </Field>

              <Field id="billing-due-to" label="Due date to">
                {(fieldProps) => (
                  <DatePicker
                    {...fieldProps}
                    value={dueDateTo}
                    onValueChange={setDueDateTo}
                  />
                )}
              </Field>

              <Field id="billing-min-balance" label="Min balance (PHP)">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={minBalance}
                    onChange={(event) => setMinBalance(event.target.value)}
                  />
                )}
              </Field>

              <Field id="billing-max-balance" label="Max balance (PHP)">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={maxBalance}
                    onChange={(event) => setMaxBalance(event.target.value)}
                  />
                )}
              </Field>
            </div>
          )}
        </div>
      </SearchFilterBar>

      {filteredInvoices.length === 0 ? (
        <EmptyState>
          <Image
            src="/illustrations/document-search.svg"
            alt=""
            width={160}
            height={118}
            className="h-24 w-auto"
          />
          <div className="grid gap-1">
            <EmptyStateTitle>
              {hasActiveFilter
                ? "No matching invoices"
                : "No invoices recorded yet"}
            </EmptyStateTitle>
            <EmptyStateDescription>
              {hasActiveFilter
                ? "Clear what you entered or reset the status to view all invoices."
                : "Generate monthly invoices for active boarders or create an itemized invoice."}
            </EmptyStateDescription>
          </div>
          <EmptyStateActions>
            {hasActiveFilter ? (
              <Button
                variant="secondary"
                size="md"
                onClick={clearAllBillingFilters}
              >
                Clear
              </Button>
            ) : (
              <Button
                size="md"
                disabled={!overview.policiesComplete}
                onClick={() => setGenerateOpen(true)}
              >
                Generate monthly invoices
              </Button>
            )}
          </EmptyStateActions>
        </EmptyState>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <TableCardHeader
            title="Invoices"
            count={`${filteredInvoices.length} ${filteredInvoices.length === 1 ? "record" : "records"}`}
          />
          {/* Mobile 360 px cards */}
          <div className="grid divide-y divide-border md:hidden">
            {paginatedInvoices.map((invoice) => {
              const isRowBusy = rowPendingId === invoice.id;
              return (
                <div key={invoice.id} className="grid gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid gap-0.5">
                      <Link
                        href={`/billing/${invoice.id}`}
                        className="font-mono text-sm font-semibold text-foreground tabular-nums hover:text-primary"
                      >
                        {invoice.invoiceNumber ?? "Draft"}
                      </Link>
                      <span className="text-sm font-medium text-foreground">
                        {invoice.snapshotTenantName ?? "Guest"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {invoice.transientGuestId ? "Transient · " : ""}
                        {invoice.snapshotRoomNumber
                          ? `Room ${invoice.snapshotRoomNumber}`
                          : "Unassigned"}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Due {formatManilaDate(invoice.dueDateManila)}
                      </span>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge tone={INVOICE_BADGE_TONE[invoice.status]}>
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </Badge>
                      {invoice.isOverdue && (
                        <Badge tone="danger">Overdue</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                    <span>Total {formatPhpCurrency(invoice.totalAmount)}</span>
                    <span className="font-semibold text-foreground">
                      Balance {formatPhpCurrency(invoice.balanceAmount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                    <span className="text-xs text-muted-foreground">
                      Actions
                    </span>
                    <RowActionMenu
                      label={`Actions for invoice ${invoice.invoiceNumber ?? "Draft"}`}
                      items={getInvoiceRowActions(invoice, isRowBusy)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop ledger table */}
          <div className="hidden overflow-x-auto md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead {...sortHeaderProps("invoice")}>Invoice</TableHead>
                  {showCol("payer") && (
                    <TableHead {...sortHeaderProps("tenant")}>
                      Boarder / Guest
                    </TableHead>
                  )}
                  {showCol("period") && (
                    <TableHead {...sortHeaderProps("period")}>Period</TableHead>
                  )}
                  {showCol("dueDate") && (
                    <TableHead {...sortHeaderProps("dueDate")}>
                      Due date
                    </TableHead>
                  )}
                  {showCol("items") && <TableHead>Line items</TableHead>}
                  {showCol("total") && (
                    <TableHead numeric {...sortHeaderProps("total")}>
                      Total
                    </TableHead>
                  )}
                  {showCol("paid") && <TableHead numeric>Paid</TableHead>}
                  {showCol("balance") && (
                    <TableHead numeric {...sortHeaderProps("balance")}>
                      Balance
                    </TableHead>
                  )}
                  {showCol("status") && (
                    <TableHead {...sortHeaderProps("status")}>Status</TableHead>
                  )}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInvoices.map((invoice) => {
                  const isRowBusy = rowPendingId === invoice.id;
                  const showTotalSubline =
                    !showCol("total") &&
                    invoice.balanceAmount !== invoice.totalAmount;
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="tabular-nums">
                        <div className="grid gap-0.5">
                          <Link
                            href={`/billing/${invoice.id}`}
                            className="font-mono text-xs font-semibold text-foreground hover:text-primary"
                          >
                            {invoice.invoiceNumber ?? "Draft"}
                          </Link>
                          {!showCol("period") && (
                            <span className="text-xs text-muted-foreground">
                              {invoice.billingPeriod
                                ? formatBillingPeriodLabel(
                                    invoice.billingPeriod,
                                  )
                                : "Ad-hoc"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {showCol("payer") && (
                        <TableCell>
                          <div className="grid gap-0.5">
                            <Link
                              href={
                                invoice.tenantId
                                  ? `/tenants/${invoice.tenantId}`
                                  : "/transients/stays"
                              }
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {invoice.snapshotTenantName ?? "Guest"}
                            </Link>
                            {invoice.snapshotRoomNumber && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {invoice.transientGuestId ? "Transient · " : ""}
                                Room {invoice.snapshotRoomNumber}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      )}
                      {showCol("period") && (
                        <TableCell className="tabular-nums">
                          {invoice.billingPeriod
                            ? formatBillingPeriodLabel(invoice.billingPeriod)
                            : "Ad-hoc"}
                        </TableCell>
                      )}
                      {showCol("dueDate") && (
                        <TableCell className="tabular-nums">
                          {formatManilaDate(invoice.dueDateManila)}
                        </TableCell>
                      )}
                      {showCol("items") && (
                        <TableCell className="max-w-56 text-xs text-muted-foreground">
                          {invoice.items.length > 0
                            ? invoice.items
                                .map((item) => item.description)
                                .join(", ")
                            : "—"}
                        </TableCell>
                      )}
                      {showCol("total") && (
                        <TableCell numeric>
                          {formatPhpCurrency(invoice.totalAmount)}
                        </TableCell>
                      )}
                      {showCol("paid") && (
                        <TableCell numeric className="text-muted-foreground">
                          {formatPhpCurrency(invoice.paidAmount)}
                        </TableCell>
                      )}
                      {showCol("balance") && (
                        <TableCell numeric>
                          <div className="grid gap-0.5">
                            <span className="font-semibold text-foreground">
                              {formatPhpCurrency(invoice.balanceAmount)}
                            </span>
                            {showTotalSubline && (
                              <span className="text-xs text-muted-foreground">
                                of {formatPhpCurrency(invoice.totalAmount)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      )}
                      {showCol("status") && (
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={INVOICE_BADGE_TONE[invoice.status]}>
                              {INVOICE_STATUS_LABELS[invoice.status]}
                            </Badge>
                            {invoice.isOverdue && (
                              <Badge tone="danger">Overdue</Badge>
                            )}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <RowActionMenu
                          label={`Actions for invoice ${invoice.invoiceNumber ?? "Draft"}`}
                          items={getInvoiceRowActions(invoice, isRowBusy)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            {...paginationProps}
            label="Invoices table pagination"
          />
        </Card>
      )}

      <GeneratePeriodInvoicesDialog
        open={generateOpen}
        defaultPeriod={overview.currentBillingPeriod}
        policiesComplete={overview.policiesComplete}
        onClose={() => setGenerateOpen(false)}
        onSaved={async (message) => {
          toast.success(message);
          await reloadBilling();
        }}
      />

      <AddAdjustmentDialog
        invoice={adjustingInvoice}
        onClose={() => setAdjustingInvoice(null)}
        onSaved={async (message) => {
          toast.success(message);
          await reloadBilling();
        }}
      />
      <ConfirmDialog
        open={issuingInvoice !== null}
        onClose={() => {
          if (rowPendingId) return;
          setIssueError(null);
          setIssuingInvoice(null);
        }}
        onConfirm={handleConfirmIssue}
        title="Issue draft invoice?"
        description="Issuing finalizes this draft bill, gives it an official number, and opens it for payment."
        details={
          issuingInvoice ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Tenant</span>
                <span className="font-medium text-foreground">
                  {issuingInvoice.snapshotTenantName ?? "Tenant"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Room</span>
                <span className="text-foreground">
                  {issuingInvoice.snapshotRoomNumber
                    ? `Room ${issuingInvoice.snapshotRoomNumber}`
                    : "Unassigned"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold text-foreground">
                  {formatPhpCurrency(issuingInvoice.totalAmount)}
                </span>
              </div>
            </>
          ) : null
        }
        errorMessage={issueError}
        confirmLabel="Issue invoice"
        confirmVariant="primary"
        loading={issuingInvoice !== null && rowPendingId === issuingInvoice.id}
      />

      <ConfirmDialog
        open={smsTargetInvoice !== null}
        onClose={() => {
          if (smsSending) return;
          setSmsError(null);
          setSmsTargetInvoice(null);
        }}
        onConfirm={handleConfirmSingleSms}
        title="Send overdue SMS reminder?"
        description="Sends your overdue reminder text to this tenant's mobile number."
        details={
          smsTargetInvoice ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Tenant</span>
                <span className="font-medium text-foreground">
                  {smsTargetInvoice.snapshotTenantName ?? "Tenant"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-mono text-foreground">
                  {smsTargetInvoice.invoiceNumber ?? "Invoice"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Balance due</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatPhpCurrency(smsTargetInvoice.balanceAmount)}
                </span>
              </div>
            </>
          ) : null
        }
        errorMessage={smsError}
        confirmLabel="Send SMS"
        confirmVariant="primary"
        loading={smsSending}
      />

      <ConfirmDialog
        open={smsBatchConfirmOpen}
        onClose={() => {
          if (smsSending) return;
          setSmsError(null);
          setSmsBatchConfirmOpen(false);
        }}
        onConfirm={handleConfirmBatchSms}
        title="Send overdue SMS reminders?"
        description={`Sends your reminder message for up to ${overdueBoardingCount} overdue boarding house ${overdueBoardingCount === 1 ? "bill" : "bills"}. Bills already reminded today or without a mobile number are skipped automatically.`}
        errorMessage={smsError}
        confirmLabel="Send overdue SMS"
        confirmVariant="primary"
        loading={smsSending}
      />
    </div>
  );
}
