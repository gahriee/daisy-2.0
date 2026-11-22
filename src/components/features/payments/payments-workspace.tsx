"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useBrowserOnline } from "@/components/features/offline/offline-status-bar";
import {
  OfflineSnapshotBanner,
  OfflineSyncBadge,
  OfflineVaultUnlockDialog,
} from "@/components/features/offline/offline-vault-unlock";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
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
import { TablePagination } from "@/components/ui/table-pagination";
import { toast } from "@/components/ui/toaster";
import { applyTenantCreditAction } from "@/features/payments/actions";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
  type PaymentDto,
  type PaymentMethodValue,
  type PaymentsOverviewDto,
  type PaymentStatusValue,
} from "@/features/payments/schemas";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useTableSort } from "@/hooks/use-table-sort";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency, parseMoneyDecimal } from "@/lib/money";
import type { SortColumnDef } from "@/lib/table-sort";
import {
  getBrowserOfflineDb,
  getVaultCustody,
  listActiveOutboxRecords,
  listDecryptedProjections,
} from "@/offline/client";
import {
  loadPaymentsOverviewFromVault,
  mergePaymentsOverviewWithVaultOverlay,
  type OfflineEntitySyncBadge,
} from "@/offline/snapshot-selectors";
import {
  cacheOfflinePoliciesMeta,
  DAISY_OFFLINE_VAULT_EVENT,
  getOfflineVaultClientState,
  OfflineVaultLockedError,
  resolveNeedsAttentionDiscard,
  resolveNeedsAttentionKeepMine,
  triggerForegroundSyncIfUnlocked,
} from "@/offline/workspace-bridge";
import { PAYMENT_BADGE_TONE, ReversePaymentDialog } from "./payment-dialogs";

type PaymentSortKey =
  | "receipt"
  | "boarder"
  | "date"
  | "method"
  | "amount"
  | "unallocated"
  | "proofs"
  | "status";

const PAYMENT_SORT_COLUMNS: Record<
  PaymentSortKey,
  SortColumnDef<PaymentDto>
> = {
  receipt: { getValue: (payment) => payment.receiptNumber },
  boarder: { getValue: (payment) => payment.tenantName },
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
  unallocated: {
    getValue: (payment) => payment.unallocatedAmount,
    kind: "money",
    defaultDirection: "desc",
  },
  proofs: {
    getValue: (payment) => payment.proofs.length,
    kind: "number",
    defaultDirection: "desc",
  },
  status: { getValue: (payment) => PAYMENT_STATUS_LABELS[payment.status] },
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

function CollectedIcon() {
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
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M7.5 14.5h4" />
    </svg>
  );
}

function CreditIcon() {
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
      <path d="M9.5 9.25h4a2.25 2.25 0 0 1 0 4.5h-4v3" />
      <path d="M8.5 11.5h6" />
    </svg>
  );
}

function ProofIcon() {
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
      <path d="M14.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3.5v5h5" />
      <path d="m9 14.5 2 2 4-4" />
    </svg>
  );
}

export function PaymentsWorkspace({
  initialOverview,
  offlineMode = false,
  initialLastSyncedAt = null,
  initialSyncBadges = {},
}: {
  initialOverview: PaymentsOverviewDto;
  offlineMode?: boolean;
  initialLastSyncedAt?: string | null;
  initialSyncBadges?: Record<string, OfflineEntitySyncBadge>;
}) {
  const online = useBrowserOnline();
  const isOfflineView = offlineMode || !online;
  const [serverOverview, setServerOverview] = useState(initialOverview);
  const [overview, setOverview] = useState(initialOverview);
  const [syncBadges, setSyncBadges] =
    useState<Record<string, OfflineEntitySyncBadge>>(initialSyncBadges);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initialLastSyncedAt,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);
  const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<PaymentMethodValue | "ALL">(
    "ALL",
  );
  const [statusFilter, setStatusFilter] = useState<PaymentStatusValue | "ALL">(
    "ALL",
  );
  const [refreshing, startRefreshTransition] = useTransition();
  const [applyingTenantId, setApplyingTenantId] = useState<string | null>(null);
  const [, startCreditTransition] = useTransition();
  const [confirmCreditTenant, setConfirmCreditTenant] = useState<
    PaymentsOverviewDto["tenants"][number] | null
  >(null);

  const [reversingPayment, setReversingPayment] = useState<PaymentDto | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function applyVaultState(base: PaymentsOverviewDto = serverOverview) {
    try {
      if (!offlineMode && navigator.onLine) {
        void cacheOfflinePoliciesMeta({
          policiesComplete: base.policiesComplete,
          receiptPrefix: base.receiptPrefix,
          overpaymentPolicy: base.overpaymentPolicy,
          proofMaxBytes: base.proofMaxBytes,
          proofMaxFilesPerRecord: base.proofMaxFilesPerRecord,
          missingPolicyLabels: base.missingPolicyLabels,
        });
      }

      const vault = await getOfflineVaultClientState();
      setPendingCount(vault.status.pendingCount);
      setNeedsAttentionCount(vault.status.needsAttentionCount);
      setLastSyncedAt(vault.status.lastSyncedAt);

      const custody = getVaultCustody();
      if (!custody.isUnlocked()) {
        setOverview(base);
        setSyncBadges({});
        return;
      }

      const db = getBrowserOfflineDb();
      const key = custody.getKey();
      if (offlineMode || !navigator.onLine) {
        const fromVault = await loadPaymentsOverviewFromVault(db, key);
        setOverview(fromVault.overview);
        setSyncBadges(fromVault.syncBadges);
        setLastSyncedAt(fromVault.lastSyncedAt);
        return;
      }

      const [projections, outbox] = await Promise.all([
        listDecryptedProjections(db, key, ["payment"]),
        listActiveOutboxRecords(db),
      ]);
      const merged = mergePaymentsOverviewWithVaultOverlay({
        baseOverview: base,
        projections,
        outbox,
      });
      setOverview(merged.overview);
      setSyncBadges(merged.syncBadges);
    } catch {
      // Ignore vault inspection failures cleanly.
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void applyVaultState(serverOverview);
    }, 0);
    const onVaultChange = () => {
      void applyVaultState(serverOverview);
    };
    window.addEventListener(DAISY_OFFLINE_VAULT_EVENT, onVaultChange);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener(DAISY_OFFLINE_VAULT_EVENT, onVaultChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineMode, online, serverOverview]);

  async function reloadPayments() {
    startRefreshTransition(async () => {
      try {
        if (offlineMode || !navigator.onLine) {
          await applyVaultState(serverOverview);
          return;
        }
        await triggerForegroundSyncIfUnlocked();
        const res = await fetch("/api/payments", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Could not refresh payment ledger.");
        }
        const next = (await res.json()) as PaymentsOverviewDto;
        setServerOverview(next);
        await applyVaultState(next);
      } catch (error) {
        await applyVaultState(serverOverview);
        if (navigator.onLine) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not refresh payment ledger.",
          );
        }
      }
    });
  }

  function handleResolveAttention(
    badge: OfflineEntitySyncBadge,
    action: "keep_mine" | "discard",
  ) {
    setErrorMessage(null);
    startRefreshTransition(async () => {
      try {
        if (action === "keep_mine") {
          await resolveNeedsAttentionKeepMine(badge.opId);
          toast.info(
            navigator.onLine
              ? "Marked your payment draft to try saving again."
              : "Marked your payment draft to save once online.",
          );
        } else {
          await resolveNeedsAttentionDiscard(badge.opId);
          toast.success("Removed saved payment draft.");
        }
        await reloadPayments();
      } catch (error) {
        if (error instanceof OfflineVaultLockedError) {
          setUnlockPromptOpen(true);
        } else {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not resolve local draft.",
          );
        }
      }
    });
  }

  function handleApplyCredit(tenantId: string) {
    setApplyingTenantId(tenantId);
    setErrorMessage(null);
    startCreditTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("tenantId", tenantId);
        const result = await applyTenantCreditAction(
          { status: "idle" },
          formData,
        );
        if (result.status === "error") {
          setErrorMessage(result.message);
        } else if (result.status === "saved") {
          toast.success(result.message);
          await reloadPayments();
        }
      } finally {
        setApplyingTenantId(null);
      }
    });
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredPayments = overview.payments.filter((payment) => {
    if (methodFilter !== "ALL" && payment.method !== methodFilter) {
      return false;
    }
    if (statusFilter !== "ALL" && payment.status !== statusFilter) {
      return false;
    }
    if (!normalizedQuery) return true;
    const haystack = [
      payment.receiptNumber ?? "reversal",
      payment.tenantName,
      payment.referenceNo ?? "",
      payment.allocations.map((a) => a.invoiceNumber ?? "").join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const tenantsWithCreditAndOpenInvoices = overview.tenants.filter(
    (t) =>
      parseMoneyDecimal(t.unallocatedCredit) > BigInt(0) &&
      parseMoneyDecimal(t.openBalance) > BigInt(0),
  );

  const {
    sortedRows: sortedPayments,
    sort,
    sortHeaderProps,
  } = useTableSort(filteredPayments, PAYMENT_SORT_COLUMNS, {
    key: "date",
    direction: "desc",
  });

  const { paginatedRows: paginatedPayments, paginationProps } =
    useTablePagination(sortedPayments, {
      resetKey: `${normalizedQuery}|${methodFilter}|${statusFilter}|${sort?.key ?? ""}|${sort?.direction ?? ""}`,
    });

  const hasActiveFilter =
    normalizedQuery !== "" || methodFilter !== "ALL" || statusFilter !== "ALL";

  function getPaymentRowActions(payment: PaymentDto): RowActionItem[] {
    const badge = syncBadges[payment.id];
    const hasNeedsAttention = badge && badge.status !== "pending";
    return [
      ...(hasNeedsAttention
        ? [
            {
              id: "keep-mine",
              label: "Keep local draft",
              onSelect: () => handleResolveAttention(badge, "keep_mine"),
            },
            {
              id: "discard-local",
              label: "Discard draft",
              tone: "danger" as const,
              onSelect: () => handleResolveAttention(badge, "discard"),
            },
          ]
        : []),
      ...(!badge || badge.status !== "pending"
        ? [
            {
              id: "inspect",
              label: "Inspect",
              href: `/payments/${payment.id}`,
            },
          ]
        : []),
      ...(payment.status === "POSTED" && !badge
        ? [
            {
              id: "reverse",
              label: isOfflineView ? "Reverse (online only)" : "Reverse",
              tone: "danger" as const,
              disabled: isOfflineView,
              onSelect: () => setReversingPayment(payment),
            },
          ]
        : []),
    ];
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Payments &amp; collections
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Official receipts, bill payments, verified payment photos, and
            permanent reversals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="md"
            variant="secondary"
            loading={refreshing}
            onClick={reloadPayments}
          >
            <RefreshIcon />
            Refresh
          </Button>
          <Link
            href="/payments/new"
            className={buttonClasses({ variant: "primary", size: "md" })}
          >
            Record payment
          </Link>
        </div>
      </header>

      <OfflineSnapshotBanner
        online={online}
        offlineMode={offlineMode}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        needsAttentionCount={needsAttentionCount}
        syncing={refreshing}
        onSyncNow={() => void reloadPayments()}
      />

      {!overview.policiesComplete && (
        <Alert tone="warning" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Configure {overview.missingPolicyLabels.join(" and ")} in Settings
              before recording payments or minting official receipts.
            </span>
            <Link
              href="/settings/policies"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Configure policies
            </Link>
          </div>
        </Alert>
      )}

      {tenantsWithCreditAndOpenInvoices.map((tenant) => (
        <Alert key={tenant.id} tone="info" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="tabular-nums">
              <strong>{tenant.fullName}</strong> has{" "}
              {formatPhpCurrency(tenant.unallocatedCredit)} unallocated credit
              and {formatPhpCurrency(tenant.openBalance)} open balance.
            </span>
            <Button
              size="sm"
              variant="secondary"
              loading={applyingTenantId === tenant.id}
              disabled={isOfflineView}
              onClick={() => setConfirmCreditTenant(tenant)}
            >
              {isOfflineView
                ? "Apply credit (online only)"
                : "Apply credit to open invoices"}
            </Button>
          </div>
        </Alert>
      ))}
      <ConfirmDialog
        open={confirmCreditTenant !== null}
        onClose={() => setConfirmCreditTenant(null)}
        onConfirm={() => {
          if (!confirmCreditTenant) return;
          const tenantId = confirmCreditTenant.id;
          setConfirmCreditTenant(null);
          handleApplyCredit(tenantId);
        }}
        title="Apply tenant credit?"
        description="Available tenant credit will be applied to the oldest open bills first."
        details={
          confirmCreditTenant ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Tenant</span>
                <span className="font-medium text-foreground">
                  {confirmCreditTenant.fullName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Available credit</span>
                <span className="font-semibold text-foreground">
                  {formatPhpCurrency(confirmCreditTenant.unallocatedCredit)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Open balance</span>
                <span className="text-foreground">
                  {formatPhpCurrency(confirmCreditTenant.openBalance)}
                </span>
              </div>
            </>
          ) : null
        }
        confirmLabel="Apply credit"
        confirmVariant="primary"
      />

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      <div className="grid gap-3.5 sm:grid-cols-3">
        <MetricCard
          label="Collected this month"
          value={formatPhpCurrency(overview.totals.collectedMonthAmount)}
          description={`${overview.totals.collectedMonthCount} ${overview.totals.collectedMonthCount === 1 ? "receipt" : "receipts"} in current month`}
          tone="success"
          icon={<CollectedIcon />}
        />
        <MetricCard
          label="Credit left"
          value={formatPhpCurrency(overview.totals.unallocatedCreditAmount)}
          description="Extra paid held for future bills"
          icon={<CreditIcon />}
        />
        <MetricCard
          label="Verified proofs"
          value={overview.totals.proofCount}
          description={`${overview.totals.reversedCount} reversed ${overview.totals.reversedCount === 1 ? "entry" : "entries"}`}
          icon={<ProofIcon />}
        />
      </div>

      <SearchFilterBar
        aria-label="Find payments"
        hasActiveFilters={hasActiveFilter}
        onClearAll={() => {
          setSearchQuery("");
          setMethodFilter("ALL");
          setStatusFilter("ALL");
        }}
      >
        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 lg:items-end">
          <div className="md:col-span-2 lg:col-span-6">
            <Field id="payments-search" label="Find a payment">
              {(fieldProps) => (
                <SearchFilterInput
                  id={fieldProps.id}
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder="Receipt #, boarder, reference #, or invoice #"
                />
              )}
            </Field>
          </div>

          <div className="lg:col-span-3">
            <Field id="payments-method-filter" label="Method">
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  variant="filter"
                  value={methodFilter}
                  onChange={(event) =>
                    setMethodFilter(
                      event.target.value as PaymentMethodValue | "ALL",
                    )
                  }
                >
                  <option value="ALL">All methods</option>
                  {PAYMENT_METHODS.map((item) => (
                    <option key={item} value={item}>
                      {PAYMENT_METHOD_LABELS[item]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="lg:col-span-3">
            <Field id="payments-status-filter" label="Status">
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  variant="filter"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as PaymentStatusValue | "ALL",
                    )
                  }
                >
                  <option value="ALL">All statuses</option>
                  {PAYMENT_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {PAYMENT_STATUS_LABELS[item]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>
      </SearchFilterBar>

      {filteredPayments.length === 0 ? (
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
                ? "No matching payments"
                : "No payments recorded yet"}
            </EmptyStateTitle>
            <EmptyStateDescription>
              {hasActiveFilter
                ? "Clear what you entered or reset your selections to view all receipts."
                : "Record rent or deposit collections with optional photo/PDF proofs."}
            </EmptyStateDescription>
          </div>
          <EmptyStateActions>
            {hasActiveFilter ? (
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setSearchQuery("");
                  setMethodFilter("ALL");
                  setStatusFilter("ALL");
                }}
              >
                Clear
              </Button>
            ) : (
              <Link
                href="/payments/new"
                className={buttonClasses({ variant: "primary", size: "md" })}
              >
                Record payment
              </Link>
            )}
          </EmptyStateActions>
        </EmptyState>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <TableCardHeader
            title="Payments"
            count={`${filteredPayments.length} ${filteredPayments.length === 1 ? "record" : "records"}`}
          />
          {/* Mobile 360 px card list */}
          <div className="grid divide-y divide-border md:hidden">
            {paginatedPayments.map((payment) => (
              <div key={payment.id} className="grid gap-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid gap-0.5">
                    <Link
                      href={`/payments/${payment.id}`}
                      className="font-mono text-sm font-semibold text-foreground tabular-nums hover:text-primary"
                    >
                      {payment.receiptNumber ??
                        (payment.status === "REVERSAL"
                          ? "Reversal entry"
                          : "Pending receipt")}
                    </Link>
                    <span className="text-sm font-medium text-foreground">
                      {payment.tenantName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {PAYMENT_METHOD_LABELS[payment.method]}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatManilaDate(payment.paidDateManila)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <OfflineSyncBadge badge={syncBadges[payment.id]} />
                    <Badge tone={PAYMENT_BADGE_TONE[payment.status]}>
                      {PAYMENT_STATUS_LABELS[payment.status]}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-start justify-between text-xs text-muted-foreground tabular-nums">
                  <div className="grid gap-0.5">
                    <span>
                      {payment.proofs.length}{" "}
                      {payment.proofs.length === 1 ? "proof" : "proofs"}
                    </span>
                    <span>
                      {payment.allocations.length}{" "}
                      {payment.allocations.length === 1
                        ? "invoice"
                        : "invoices"}
                    </span>
                  </div>
                  <span className="font-semibold text-foreground">
                    {formatPhpCurrency(payment.amount)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                  <span className="text-xs text-muted-foreground">Actions</span>
                  <RowActionMenu
                    label={`Actions for payment ${payment.receiptNumber ?? "Reversal"}`}
                    items={getPaymentRowActions(payment)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop ledger table */}
          <div className="hidden md:block">
            <Table containerClassName="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead {...sortHeaderProps("receipt")}>Receipt</TableHead>
                  <TableHead {...sortHeaderProps("boarder")}>Boarder</TableHead>
                  <TableHead {...sortHeaderProps("date")}>Date</TableHead>
                  <TableHead {...sortHeaderProps("method")}>Method</TableHead>
                  <TableHead numeric {...sortHeaderProps("amount")}>
                    Amount
                  </TableHead>
                  <TableHead numeric {...sortHeaderProps("unallocated")}>
                    Credit left
                  </TableHead>
                  <TableHead {...sortHeaderProps("proofs")}>Proofs</TableHead>
                  <TableHead {...sortHeaderProps("status")}>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs font-semibold tabular-nums">
                      <Link
                        href={`/payments/${payment.id}`}
                        className="text-foreground hover:text-primary"
                      >
                        {payment.receiptNumber ??
                          (payment.status === "REVERSAL"
                            ? "Reversal"
                            : "Pending receipt")}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <Link
                          href={
                            payment.tenantId
                              ? `/tenants/${payment.tenantId}`
                              : "/transients/stays"
                          }
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {payment.tenantName}
                        </Link>
                        {payment.referenceNo && (
                          <span className="font-mono text-xs text-muted-foreground">
                            Ref: {payment.referenceNo}
                          </span>
                        )}
                      </div>
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
                    <TableCell numeric className="text-muted-foreground">
                      {formatPhpCurrency(payment.unallocatedAmount)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {payment.proofs.length > 0 ? (
                        <Badge tone="info">
                          {payment.proofs.length}{" "}
                          {payment.proofs.length === 1 ? "file" : "files"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          None
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={PAYMENT_BADGE_TONE[payment.status]}>
                          {PAYMENT_STATUS_LABELS[payment.status]}
                        </Badge>
                        <OfflineSyncBadge badge={syncBadges[payment.id]} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionMenu
                        label={`Actions for payment ${payment.receiptNumber ?? "Reversal"}`}
                        items={getPaymentRowActions(payment)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            {...paginationProps}
            label="Payments table pagination"
          />
        </Card>
      )}

      <ReversePaymentDialog
        payment={reversingPayment}
        onClose={() => setReversingPayment(null)}
        onSaved={async (message) => {
          toast.success(message);
          await reloadPayments();
        }}
      />

      <OfflineVaultUnlockDialog
        open={unlockPromptOpen}
        onClose={() => setUnlockPromptOpen(false)}
        onUnlocked={() => reloadPayments()}
      />
    </div>
  );
}
