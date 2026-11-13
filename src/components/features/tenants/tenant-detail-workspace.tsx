"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import {
  AssignBedDialog,
  EditTenantDialog,
  MoveOutAssignmentDialog,
} from "./tenant-dialogs";

const ASSIGNMENT_BADGE_TONE: Record<
  TenantAssignmentStatusValue,
  "info" | "success" | "neutral"
> = {
  ACTIVE: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export function TenantDetailWorkspace({
  initialDetail,
}: {
  initialDetail: TenantDetailDto;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
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
    derivedBalance,
    assignableBeds,
  } = initialDetail;
  const isArchived = tenant.archivedAt !== null;

  function handleArchiveRestore() {
    if (archivePending) return;
    setFeedback(null);
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
        setFeedback({ tone: "success", message: res.message });
        router.refresh();
      } else if (res.status === "error") {
        setFeedback({ tone: "danger", message: res.message });
      }
    });
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
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
            variant={isArchived ? "primary" : "ghost"}
            loading={archivePending}
            disabled={!isArchived && Boolean(activeAssignment)}
            onClick={handleArchiveRestore}
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
            <div className="grid gap-1 sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">
                Notes
              </dt>
              <dd className="text-foreground">{tenant.notes ?? "None"}</dd>
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

          <div className="rounded-control border border-border bg-background/60 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">
              Derived balance
            </span>
            <div className="mt-1 text-xl font-semibold text-foreground tabular-nums">
              {formatPhpCurrency(derivedBalance)}
            </div>
          </div>

          {activeAssignment ? (
            <div className="grid gap-3 rounded-control border border-border bg-surface p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  Room {activeAssignment.roomNumber} · Bed{" "}
                  {activeAssignment.bedNumber}
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
                  ? "Restore this tenant profile to assign a bed."
                  : "This tenant is not assigned to any bed right now."}
              </span>
              {!isArchived && (
                <Button size="md" onClick={() => setAssignOpen(true)}>
                  Assign bed
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6 sm:py-3.5">
          <h2 className="text-sm font-semibold text-foreground">
            Assignment history
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {assignments.length}{" "}
            {assignments.length === 1 ? "assignment" : "assignments"}
          </span>
        </div>

        {assignments.length === 0 ? (
          <EmptyState className="rounded-none border-0">
            <Image
              src="/illustrations/document-search.svg"
              alt=""
              width={160}
              height={118}
              className="h-24 w-auto"
            />
            <div className="grid gap-1">
              <EmptyStateTitle>No bed assignments yet</EmptyStateTitle>
              <EmptyStateDescription>
                Assign an available bed above to record move-in dates and rates.
              </EmptyStateDescription>
            </div>
            {!isArchived && (
              <EmptyStateActions>
                <Button size="md" onClick={() => setAssignOpen(true)}>
                  Assign bed
                </Button>
              </EmptyStateActions>
            )}
          </EmptyState>
        ) : (
          <Table containerClassName="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>Room &amp; bed</TableHead>
                <TableHead>Move-in</TableHead>
                <TableHead>Planned end</TableHead>
                <TableHead>Actual move-out</TableHead>
                <TableHead numeric>Monthly rate</TableHead>
                <TableHead numeric>Deposit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium tabular-nums">
                    Room {item.roomNumber} · Bed {item.bedNumber}
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
    </div>
  );
}
