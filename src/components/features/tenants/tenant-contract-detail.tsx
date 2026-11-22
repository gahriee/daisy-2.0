"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { BackLink, Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TableCardHeader } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { archiveTenantContractAction } from "@/features/tenants/actions";
import {
  CONTRACT_SCAN_MODE_LABELS,
  type TenantContractDto,
  type TenantDto,
} from "@/features/tenants/schemas";
import { formatManilaDate, formatManilaDateTime } from "@/lib/dates";

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TenantContractDetail({
  tenant,
  contract: initialContract,
}: {
  tenant: Pick<TenantDto, "id" | "fullName">;
  contract: TenantContractDto;
}) {
  const router = useRouter();
  const [contract, setContract] = useState(initialContract);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archivePending, startArchive] = useTransition();

  function handleArchive() {
    setArchiveError(null);
    startArchive(async () => {
      const result = await archiveTenantContractAction({
        tenantId: tenant.id,
        contractId: contract.id,
        expectedVersion: contract.version,
      });
      if (result.status === "saved" && result.contract) {
        setContract(result.contract);
        setConfirmOpen(false);
        toast.success(result.message ?? "Signed contract archived.");
        router.refresh();
      } else {
        setArchiveError(
          result.status === "error"
            ? result.message
            : "Could not archive this contract right now.",
        );
      }
    });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <BackLink href={`/tenants/${tenant.id}`}>{tenant.fullName}</BackLink>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {contract.title}
              </h1>
              <Badge tone={contract.archivedAt ? "neutral" : "success"}>
                {contract.archivedAt ? "Archived" : "Stored"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Private signed agreement record for {tenant.fullName}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/tenants/${tenant.id}/contracts/new`}
              className={buttonClasses({ variant: "secondary", size: "md" })}
            >
              Add contract
            </Link>
            {!contract.archivedAt && (
              <Button
                type="button"
                variant="danger"
                size="md"
                onClick={() => setConfirmOpen(true)}
              >
                Archive contract
              </Button>
            )}
          </div>
        </header>
      </div>

      <Card className="grid gap-4 p-5 sm:p-6">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Signed date</dt>
            <dd className="font-medium text-foreground">
              {contract.signedDateManila
                ? formatManilaDate(contract.signedDateManila)
                : "Not specified"}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Room assignment</dt>
            <dd className="font-medium text-foreground">
              {contract.assignmentRoomNumber
                ? `Room ${contract.assignmentRoomNumber}`
                : "General tenant contract"}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Pages</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {contract.pageCount} {contract.pageCount === 1 ? "page" : "pages"}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Uploaded</dt>
            <dd className="font-medium text-foreground">
              {formatManilaDateTime(new Date(contract.createdAt))}
            </dd>
          </div>
        </dl>

        {contract.notes && (
          <div className="grid gap-1 border-t border-border pt-3 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Notes
            </span>
            <p className="whitespace-pre-wrap text-foreground">
              {contract.notes}
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-4">
        {contract.pages.map((page) => (
          <Card key={page.id} className="overflow-hidden p-0 sm:p-0">
            <TableCardHeader
              title={
                page.label
                  ? `Page ${page.pageOrder}: ${page.label}`
                  : `Page ${page.pageOrder}`
              }
              description={`${page.fileName} (${formatByteSize(page.byteSize)})`}
              count={CONTRACT_SCAN_MODE_LABELS[page.filterMode]}
              actions={
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  download={page.fileName}
                  className={buttonClasses({
                    variant: "secondary",
                    size: "sm",
                  })}
                >
                  Open / Download
                </a>
              }
            />
            <div className="bg-surface-muted p-4 sm:p-5">
              {page.mimeType === "application/pdf" ? (
                <object
                  data={page.url}
                  type="application/pdf"
                  aria-label={page.fileName}
                  className="h-[560px] w-full rounded-control bg-background"
                >
                  <div className="p-6 text-sm text-muted-foreground">
                    Inline PDF preview is unavailable in this browser. Use Open
                    / Download above to open {page.fileName}.
                  </div>
                </object>
              ) : (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.url}
                    alt={
                      page.label
                        ? `${page.label} (Page ${page.pageOrder})`
                        : `Signed contract page ${page.pageOrder}`
                    }
                    className="max-h-[780px] w-auto max-w-full rounded-control object-contain"
                  />
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          if (!archivePending) {
            setArchiveError(null);
            setConfirmOpen(false);
          }
        }}
        onConfirm={handleArchive}
        title="Archive signed contract?"
        description="This marks the signed contract as archived while keeping it in your records."
        errorMessage={archiveError}
        confirmLabel="Archive contract"
        confirmVariant="danger"
        loading={archivePending}
      />
    </div>
  );
}
