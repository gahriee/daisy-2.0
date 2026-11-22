import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function PageHeaderSkeleton({
  actions = 2,
  withBackLink = false,
}: {
  actions?: number;
  withBackLink?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid gap-2">
        {withBackLink && <Skeleton className="h-4 w-24" />}
        <Skeleton className="h-7 w-56 sm:h-8 sm:w-64" />
        <Skeleton className="h-4 w-72 max-w-[80vw] sm:w-96" />
      </div>
      {actions > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          {Array.from({ length: actions }).map((_, idx) => (
            <Skeleton key={idx} className="h-10 w-28 sm:w-32" />
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCardsSkeleton({ count }: { count: number }) {
  if (count <= 0) return null;
  const gridClass =
    count === 3
      ? "grid grid-cols-1 gap-3.5 sm:grid-cols-3"
      : "grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className={gridClass}>
      {Array.from({ length: count }).map((_, idx) => (
        <Card key={idx} className="grid gap-3 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="size-8 rounded-control" />
          </div>
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3.5 w-36" />
        </Card>
      ))}
    </div>
  );
}

function SearchFilterBarSkeleton({ filters = 2 }: { filters?: number }) {
  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          className={
            filters <= 1 ? "sm:col-span-2 lg:col-span-3" : "sm:col-span-2"
          }
        >
          <div className="grid gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        {Array.from({ length: filters }).map((_, idx) => (
          <div key={idx} className="grid gap-1.5">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TableCardSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-20" />
      </div>

      {/* Mobile stacked rows */}
      <div className="grid divide-y divide-border md:hidden">
        {Array.from({ length: Math.min(rows, 4) }).map((_, idx) => (
          <div key={idx} className="grid gap-2.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-52" />
            <div className="flex items-center justify-between gap-2 pt-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table rows */}
      <div className="hidden md:block">
        <div className="grid grid-cols-12 gap-4 border-b border-border bg-background/60 px-5 py-3">
          {Array.from({ length: columns }).map((_, idx) => (
            <Skeleton
              key={idx}
              className={
                idx === 0
                  ? "col-span-4 h-3.5 w-24"
                  : idx === columns - 1
                    ? "col-span-2 ml-auto h-3.5 w-16"
                    : "col-span-2 h-3.5 w-20"
              }
            />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <div
              key={rowIdx}
              className="grid grid-cols-12 items-center gap-4 px-5 py-4"
            >
              {Array.from({ length: columns }).map((_, colIdx) => (
                <div
                  key={colIdx}
                  className={
                    colIdx === 0
                      ? "col-span-4 grid gap-1.5"
                      : colIdx === columns - 1
                        ? "col-span-2 flex justify-end"
                        : "col-span-2"
                  }
                >
                  {colIdx === 0 ? (
                    <>
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-3 w-32" />
                    </>
                  ) : colIdx === columns - 1 ? (
                    <Skeleton className="h-8 w-8" />
                  ) : (
                    <Skeleton className="h-4 w-24" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/**
 * Dashboard skeleton covering KPIs, two-column summary/chart cards, and
 * operational lists. Does not include the sidebar or topbar.
 */
export function DashboardPageSkeleton() {
  return (
    <div
      className="grid gap-5"
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <span className="sr-only">Loading dashboard…</span>
      <PageHeaderSkeleton actions={1} />
      <MetricCardsSkeleton count={4} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="grid gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="grid gap-1.5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-56" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-52 w-full rounded-panel" />
        </Card>

        <Card className="grid gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="grid gap-1.5">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3.5 w-52" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded-control border border-border p-3"
              >
                <div className="grid gap-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Card key={idx} className="grid gap-3 p-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3.5 w-48" />
            <div className="grid gap-2.5 pt-1">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Standard list/table workspace skeleton used across Rooms, Tenants, Billing,
 * Payments, Transients, Maintenance, Notices, Notifications, and Audit.
 */
export function ListWorkspaceSkeleton({
  metrics = 4,
  filters = 2,
  actions = 2,
  rows = 6,
  label = "Loading workspace",
}: {
  metrics?: number;
  filters?: number;
  actions?: number;
  rows?: number;
  label?: string;
}) {
  return (
    <div
      className="grid gap-5"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <span className="sr-only">{label}…</span>
      <PageHeaderSkeleton actions={actions} />
      <MetricCardsSkeleton count={metrics} />
      <SearchFilterBarSkeleton filters={filters} />
      <TableCardSkeleton rows={rows} />
    </div>
  );
}

/**
 * Split create-form + card-grid skeleton for Room Types workspaces.
 */
export function SplitCreateListSkeleton() {
  return (
    <div
      className="grid gap-5"
      role="status"
      aria-busy="true"
      aria-label="Loading room types"
    >
      <span className="sr-only">Loading room types…</span>
      <PageHeaderSkeleton actions={1} />
      <MetricCardsSkeleton count={3} />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <Card className="grid gap-4 p-5 sm:p-6">
          <div className="grid gap-1.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3.5 w-56" />
          </div>
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="grid gap-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className={idx === 2 ? "h-24 w-full" : "h-10 w-full"} />
            </div>
          ))}
          <Skeleton className="ml-auto h-10 w-36" />
        </Card>

        <div className="grid min-w-0 gap-4">
          <SearchFilterBarSkeleton filters={1} />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Card key={idx} className="grid gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Inner content skeleton for Reports (also reused during client-side report
 * tab/date updates).
 */
export function ReportsContentSkeleton() {
  return (
    <div
      className="grid gap-5"
      role="status"
      aria-busy="true"
      aria-label="Loading report"
    >
      <span className="sr-only">Loading report…</span>
      <MetricCardsSkeleton count={4} />
      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-64" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-72 w-full rounded-panel" />
      </Card>
      <TableCardSkeleton rows={5} />
    </div>
  );
}

/**
 * Full Reports page skeleton including header and tab/date filter bar.
 */
export function ReportsPageSkeleton() {
  return (
    <div className="grid gap-5">
      <PageHeaderSkeleton actions={2} />
      <Card className="grid gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} className="h-9 w-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-36" />
        </div>
      </Card>
      <ReportsContentSkeleton />
    </div>
  );
}

/**
 * Detail page skeleton for individual Room, Tenant, Contract, Invoice,
 * Payment, Booking Request, and Maintenance detail routes.
 */
export function DetailPageSkeleton() {
  return (
    <div
      className="grid gap-5"
      role="status"
      aria-busy="true"
      aria-label="Loading details"
    >
      <span className="sr-only">Loading details…</span>
      <PageHeaderSkeleton actions={2} withBackLink />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="grid gap-5 lg:col-span-2">
          <Card className="grid gap-4 p-5 sm:p-6">
            <Skeleton className="h-5 w-40" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="grid gap-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-5 w-40" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="grid gap-4 p-5 sm:p-6">
            <Skeleton className="h-5 w-44" />
            <div className="grid gap-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton key={idx} className="h-14 w-full" />
              ))}
            </div>
          </Card>
        </div>

        <Card className="grid h-fit gap-4 p-5 sm:p-6">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
        </Card>
      </div>
    </div>
  );
}

/**
 * Create/edit form page skeleton with optional right-hand summary panel.
 */
export function FormPageSkeleton({
  withSummary = false,
}: {
  withSummary?: boolean;
}) {
  return (
    <div
      className="grid gap-5"
      role="status"
      aria-busy="true"
      aria-label="Loading form"
    >
      <span className="sr-only">Loading form…</span>
      <PageHeaderSkeleton actions={0} withBackLink />

      <div
        className={
          withSummary
            ? "grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
            : "grid max-w-3xl gap-5"
        }
      >
        <Card className="grid gap-5 p-5 sm:p-6">
          <div className="grid gap-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-64" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="grid gap-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-36" />
          </div>
        </Card>

        {withSummary && (
          <Card className="grid gap-4 p-5 sm:p-6">
            <Skeleton className="h-5 w-28" />
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3"
                >
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * Settings section skeleton for profile, policies, operations, SMS, and devices.
 */
export function SettingsPageSkeleton({
  withTable = false,
}: {
  withTable?: boolean;
}) {
  return (
    <div
      className="grid gap-5"
      role="status"
      aria-busy="true"
      aria-label="Loading settings"
    >
      <span className="sr-only">Loading settings…</span>
      <PageHeaderSkeleton actions={0} />

      <Card className="grid gap-5 p-5 sm:p-6">
        <div className="grid gap-1.5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="grid gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-1">
          <Skeleton className="h-10 w-32" />
        </div>
      </Card>

      {withTable && <TableCardSkeleton rows={4} columns={4} />}
    </div>
  );
}

/**
 * Public booking availability grid skeleton (used for `/book` route loading
 * and client-side availability search loading).
 */
export function PublicBookingCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-busy="true"
      aria-label="Loading available rooms"
    >
      <span className="sr-only">Loading available rooms…</span>
      {Array.from({ length: count }).map((_, idx) => (
        <Card key={idx} className="overflow-hidden p-0 sm:p-0">
          <Skeleton className="aspect-[4/3] h-auto w-full rounded-none border-0" />
          <div className="grid gap-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
            <div className="flex items-center justify-between gap-3 pt-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * Full `/book` page skeleton for public transient storefront navigation.
 */
export function PublicBookingPageSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
      <PublicBookingCardsSkeleton count={3} />
    </div>
  );
}
