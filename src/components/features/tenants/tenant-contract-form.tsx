"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ContractCameraScanDialog,
  type ConfirmedCameraScan,
} from "@/components/features/tenants/contract-camera-scan-dialog";
import { Alert } from "@/components/ui/alert";
import { AttachmentDropbox } from "@/components/ui/attachment-dropbox";
import { Badge } from "@/components/ui/badge";
import { BackLink, Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import {
  createTenantContractAction,
  type TenantContractActionResult,
} from "@/features/tenants/actions";
import {
  CONTRACT_ALLOWED_MIME_TYPES,
  CONTRACT_MAX_FILE_BYTES,
  CONTRACT_MAX_PAGES,
  CONTRACT_SCAN_MODE_LABELS,
  CONTRACT_SCAN_MODES,
  TENANT_ASSIGNMENT_STATUS_LABELS,
  type ContractAllowedMimeType,
  type ContractScanModeValue,
  type TenantAssignmentDto,
  type TenantDto,
} from "@/features/tenants/schemas";
import { formatManilaDate } from "@/lib/dates";
import {
  computeBlobSha256Hex,
  processContractScanFile,
} from "@/lib/document-scanner";

const ACCEPT_ATTR = CONTRACT_ALLOWED_MIME_TYPES.join(",");

type EditableContractPage = {
  localId: string;
  sourceFile: File;
  isPdf: boolean;
  filterMode: ContractScanModeValue;
  rotationQuarterTurns: number;
  label: string;
  fileName: string;
  mimeType: ContractAllowedMimeType;
  byteSize: number;
  intentId: string | null;
  previewObjectUrl: string | null;
  status: "processing" | "uploading" | "ready" | "error";
  errorMessage: string | null;
};

function resolveContractFileKind(
  file: File,
): { mimeType: ContractAllowedMimeType; isPdf: boolean } | null {
  const rawType = file.type.trim().toLowerCase();
  const lowerName = file.name.trim().toLowerCase();
  if (rawType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return { mimeType: "application/pdf", isPdf: true };
  }
  if (
    rawType === "image/jpeg" ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg")
  ) {
    return { mimeType: "image/jpeg", isPdf: false };
  }
  if (rawType === "image/png" || lowerName.endsWith(".png")) {
    return { mimeType: "image/png", isPdf: false };
  }
  if (rawType === "image/webp" || lowerName.endsWith(".webp")) {
    return { mimeType: "image/webp", isPdf: false };
  }
  return null;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadContractPageBlob(params: {
  tenantId: string;
  blob: Blob;
  fileName: string;
  mimeType: ContractAllowedMimeType;
  sha256: string;
}): Promise<{ intentId: string }> {
  const intentResponse = await fetch("/api/tenants/contracts/intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantId: params.tenantId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      byteSize: params.blob.size,
      sha256: params.sha256,
    }),
  });

  if (!intentResponse.ok) {
    const body = (await intentResponse.json().catch(() => null)) as {
      error?: { message?: string };
      message?: string;
    } | null;
    throw new Error(
      body?.error?.message ??
        body?.message ??
        "Could not start contract page upload.",
    );
  }

  const intentData = (await intentResponse.json()) as {
    intentId: string;
    uploadUrl: string;
  };

  const putResponse = await fetch(intentData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": params.mimeType },
    body: params.blob,
  });

  if (!putResponse.ok) {
    const body = (await putResponse.json().catch(() => null)) as {
      error?: { message?: string };
      message?: string;
    } | null;
    throw new Error(
      body?.error?.message ??
        body?.message ??
        "Could not upload scanned contract bytes.",
    );
  }

  return { intentId: intentData.intentId };
}

export function TenantContractForm({
  tenant,
  assignments,
}: {
  tenant: Pick<TenantDto, "id" | "fullName">;
  assignments: TenantAssignmentDto[];
}) {
  const router = useRouter();
  const [defaultFilterMode, setDefaultFilterMode] =
    useState<ContractScanModeValue>("MAGIC_WHITE");
  const [pages, setPages] = useState<EditableContractPage[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);

  const objectUrlsRef = useRef<Set<string>>(new Set());
  const generationByLocalIdRef = useRef<Map<string, number>>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const urls = objectUrlsRef.current;
    return () => {
      mountedRef.current = false;
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  function trackObjectUrl(url: string) {
    objectUrlsRef.current.add(url);
    return url;
  }

  function releaseObjectUrl(url: string | null) {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }

  async function processAndUploadPage(params: {
    localId: string;
    sourceFile: File;
    isPdf: boolean;
    mode: ContractScanModeValue;
    rotationQuarterTurns: number;
  }) {
    const nextGen =
      (generationByLocalIdRef.current.get(params.localId) ?? 0) + 1;
    generationByLocalIdRef.current.set(params.localId, nextGen);

    setPages((prev) =>
      prev.map((item) =>
        item.localId === params.localId
          ? {
              ...item,
              filterMode: params.isPdf ? "ORIGINAL" : params.mode,
              rotationQuarterTurns: params.rotationQuarterTurns,
              intentId: null,
              status: params.isPdf ? "uploading" : "processing",
              errorMessage: null,
            }
          : item,
      ),
    );

    let newPreviewUrl: string | null = null;
    try {
      let uploadBlob: Blob;
      let uploadFileName: string;
      let uploadMime: ContractAllowedMimeType;
      let sha256: string;

      if (params.isPdf) {
        if (params.sourceFile.size > CONTRACT_MAX_FILE_BYTES) {
          throw new Error("Keep each PDF contract under 15 MB.");
        }
        uploadBlob = params.sourceFile;
        uploadFileName = params.sourceFile.name || "signed-contract.pdf";
        uploadMime = "application/pdf";
        sha256 = await computeBlobSha256Hex(params.sourceFile);
      } else {
        const scanned = await processContractScanFile({
          sourceFile: params.sourceFile,
          mode: params.mode,
          rotationQuarterTurns: params.rotationQuarterTurns,
        });
        if (scanned.byteSize > CONTRACT_MAX_FILE_BYTES) {
          throw new Error("Keep each scanned contract page under 15 MB.");
        }
        uploadBlob = scanned.blob;
        uploadFileName = scanned.fileName;
        uploadMime = scanned.mimeType;
        sha256 = scanned.sha256;
        newPreviewUrl = trackObjectUrl(URL.createObjectURL(scanned.blob));

        if (
          !mountedRef.current ||
          generationByLocalIdRef.current.get(params.localId) !== nextGen
        ) {
          releaseObjectUrl(newPreviewUrl);
          return;
        }

        setPages((prev) =>
          prev.map((item) => {
            if (item.localId !== params.localId) return item;
            releaseObjectUrl(item.previewObjectUrl);
            return {
              ...item,
              fileName: uploadFileName,
              mimeType: uploadMime,
              byteSize: uploadBlob.size,
              previewObjectUrl: newPreviewUrl,
              status: "uploading",
            };
          }),
        );
      }

      const uploaded = await uploadContractPageBlob({
        tenantId: tenant.id,
        blob: uploadBlob,
        fileName: uploadFileName,
        mimeType: uploadMime,
        sha256,
      });

      if (
        !mountedRef.current ||
        generationByLocalIdRef.current.get(params.localId) !== nextGen
      ) {
        return;
      }

      setPages((prev) =>
        prev.map((item) =>
          item.localId === params.localId
            ? {
                ...item,
                fileName: uploadFileName,
                mimeType: uploadMime,
                byteSize: uploadBlob.size,
                intentId: uploaded.intentId,
                status: "ready",
                errorMessage: null,
              }
            : item,
        ),
      );
    } catch (error) {
      releaseObjectUrl(newPreviewUrl);
      if (
        !mountedRef.current ||
        generationByLocalIdRef.current.get(params.localId) !== nextGen
      ) {
        return;
      }
      setPages((prev) =>
        prev.map((item) =>
          item.localId === params.localId
            ? {
                ...item,
                intentId: null,
                status: "error",
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : "Could not process or upload this page.",
              }
            : item,
        ),
      );
    }
  }

  function addFilesFromList(files: File[]) {
    if (files.length === 0) return;
    setPickerError(null);

    if (pages.length + files.length > CONTRACT_MAX_PAGES) {
      setPickerError(
        `Attach up to ${CONTRACT_MAX_PAGES} pages per signed contract.`,
      );
      return;
    }

    const accepted: EditableContractPage[] = [];
    for (const file of files) {
      const kind = resolveContractFileKind(file);
      if (!kind) {
        setPickerError(
          "Only JPEG, PNG, WebP photos or PDF documents can be attached.",
        );
        return;
      }
      if (file.size === 0) {
        setPickerError(`"${file.name}" is empty.`);
        return;
      }
      if (kind.isPdf && file.size > CONTRACT_MAX_FILE_BYTES) {
        setPickerError(`Keep "${file.name}" under 15 MB.`);
        return;
      }

      const localId = crypto.randomUUID();
      accepted.push({
        localId,
        sourceFile: file,
        isPdf: kind.isPdf,
        filterMode: kind.isPdf ? "ORIGINAL" : defaultFilterMode,
        rotationQuarterTurns: 0,
        label: "",
        fileName: file.name || "contract-page",
        mimeType: kind.mimeType,
        byteSize: file.size,
        intentId: null,
        previewObjectUrl: null,
        status: kind.isPdf ? "uploading" : "processing",
        errorMessage: null,
      });
    }

    setPages((prev) => [...prev, ...accepted]);
    for (const entry of accepted) {
      void processAndUploadPage({
        localId: entry.localId,
        sourceFile: entry.sourceFile,
        isPdf: entry.isPdf,
        mode: entry.filterMode,
        rotationQuarterTurns: entry.rotationQuarterTurns,
      });
    }
  }

  async function handleCameraScanConfirmed(scan: ConfirmedCameraScan) {
    setPickerError(null);
    if (pages.length >= CONTRACT_MAX_PAGES) {
      setPickerError(
        `Attach up to ${CONTRACT_MAX_PAGES} pages per signed contract.`,
      );
      return;
    }

    const localId = crypto.randomUUID();
    const nextGen = (generationByLocalIdRef.current.get(localId) ?? 0) + 1;
    generationByLocalIdRef.current.set(localId, nextGen);
    const previewUrl = trackObjectUrl(URL.createObjectURL(scan.processed.blob));

    setPages((prev) => [
      ...prev,
      {
        localId,
        sourceFile: scan.sourceFile,
        isPdf: false,
        filterMode: scan.mode,
        rotationQuarterTurns: scan.rotationQuarterTurns,
        label: "",
        fileName: scan.processed.fileName,
        mimeType: scan.processed.mimeType,
        byteSize: scan.processed.byteSize,
        intentId: null,
        previewObjectUrl: previewUrl,
        status: "uploading",
        errorMessage: null,
      },
    ]);

    try {
      const uploaded = await uploadContractPageBlob({
        tenantId: tenant.id,
        blob: scan.processed.blob,
        fileName: scan.processed.fileName,
        mimeType: scan.processed.mimeType,
        sha256: scan.processed.sha256,
      });

      if (
        !mountedRef.current ||
        generationByLocalIdRef.current.get(localId) !== nextGen
      ) {
        return;
      }

      setPages((prev) =>
        prev.map((item) =>
          item.localId === localId
            ? {
                ...item,
                intentId: uploaded.intentId,
                status: "ready",
                errorMessage: null,
              }
            : item,
        ),
      );
    } catch (error) {
      if (
        !mountedRef.current ||
        generationByLocalIdRef.current.get(localId) !== nextGen
      ) {
        return;
      }
      setPages((prev) =>
        prev.map((item) =>
          item.localId === localId
            ? {
                ...item,
                intentId: null,
                status: "error",
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : "Could not upload this scanned page.",
              }
            : item,
        ),
      );
    }
  }

  function handleRemovePage(localId: string) {
    generationByLocalIdRef.current.delete(localId);
    setPages((prev) => {
      const target = prev.find((item) => item.localId === localId);
      if (target) releaseObjectUrl(target.previewObjectUrl);
      return prev.filter((item) => item.localId !== localId);
    });
  }

  function handleMovePage(index: number, delta: -1 | 1) {
    setPages((prev) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      if (moved) {
        copy.splice(nextIndex, 0, moved);
      }
      return copy;
    });
  }

  const anyBusy = pages.some(
    (page) => page.status === "processing" || page.status === "uploading",
  );
  const anyError = pages.some((page) => page.status === "error");
  const allReady =
    pages.length > 0 &&
    !anyBusy &&
    !anyError &&
    pages.every((page) => page.intentId !== null);

  const [state, submitAction, pending] = useActionState(
    async (
      prev: TenantContractActionResult,
      formData: FormData,
    ): Promise<TenantContractActionResult> => {
      const pagesPayload = pages
        .filter((page) => page.status === "ready" && page.intentId)
        .map((page) => ({
          intentId: page.intentId!,
          filterMode: page.isPdf ? ("ORIGINAL" as const) : page.filterMode,
          label: page.label.trim() ? page.label.trim() : null,
        }));
      formData.set("pagesJson", JSON.stringify(pagesPayload));

      const result = await createTenantContractAction(prev, formData);
      if (result.status === "saved" && result.contract) {
        toast.success(
          result.message ?? "Signed contract saved privately for this tenant.",
        );
        router.push(`/tenants/${tenant.id}/contracts/${result.contract.id}`);
      }
      return result;
    },
    { status: "idle" },
  );

  const preferredAssignment =
    assignments.find((item) => item.status === "ACTIVE")?.id ??
    assignments[0]?.id ??
    "";

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <BackLink href={`/tenants/${tenant.id}`}>{tenant.fullName}</BackLink>
        <header className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Add signed contract
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Upload paper contract scans or PDF copies for {tenant.fullName}.
            Image captures are whitened and flattened in your browser before
            saving privately.
          </p>
        </header>
      </div>

      <CompactFormScope>
        <form
          action={submitAction}
          className="grid items-start gap-5 lg:grid-cols-12"
          noValidate
        >
          <input type="hidden" name="tenantId" value={tenant.id} />

          <div className="grid gap-5 lg:col-span-8">
            <Card className="grid gap-4 p-5 sm:p-6">
              <div className="grid gap-1">
                <h2 className="text-base font-semibold text-foreground">
                  Contract details
                </h2>
                <p className="text-xs leading-5 text-muted-foreground">
                  Identify the executed paper agreement and optionally link it
                  to a room assignment.
                </p>
              </div>

              {state.status === "error" && (
                <Alert tone="danger" role="alert">
                  {state.message}
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="contract-title"
                  label="Contract title"
                  required
                  className="sm:col-span-2"
                  error={
                    state.status === "error"
                      ? state.fieldErrors.title
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      name="title"
                      defaultValue="Signed Boarding Contract"
                      placeholder="e.g. Room 101 Lease Agreement"
                    />
                  )}
                </Field>

                <Field
                  id="contract-signed-date"
                  label="Signed date"
                  error={
                    state.status === "error"
                      ? state.fieldErrors.signedDateManila
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <DatePicker {...fieldProps} name="signedDateManila" />
                  )}
                </Field>

                <Field
                  id="contract-assignment"
                  label="Related assignment"
                  error={
                    state.status === "error"
                      ? state.fieldErrors.assignmentId
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      name="assignmentId"
                      defaultValue={preferredAssignment}
                    >
                      <option value="">General tenant contract (none)</option>
                      {assignments.map((assignment) => (
                        <option key={assignment.id} value={assignment.id}>
                          Room {assignment.roomNumber} (Bed{" "}
                          {assignment.bedNumber},{" "}
                          {TENANT_ASSIGNMENT_STATUS_LABELS[assignment.status]},{" "}
                          {formatManilaDate(assignment.startDateManila)})
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field
                  id="contract-notes"
                  label="Notes"
                  className="sm:col-span-2"
                  error={
                    state.status === "error"
                      ? state.fieldErrors.notes
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <Textarea
                      {...fieldProps}
                      name="notes"
                      rows={2}
                      placeholder="Optional witnesses, ID reference, or signed addendum notes"
                    />
                  )}
                </Field>
              </div>
            </Card>

            <Card className="grid gap-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <h2 className="text-base font-semibold text-foreground">
                    Scanned pages &amp; PDFs
                  </h2>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Attach up to {CONTRACT_MAX_PAGES} JPEG, PNG, WebP photos or
                    PDF documents (max 15 MB per file). Switch modes per page to
                    whiten paper shadows.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label="Default scan filter for newly added pages"
                    value={defaultFilterMode}
                    onChange={(e) =>
                      setDefaultFilterMode(
                        e.target.value as ContractScanModeValue,
                      )
                    }
                  >
                    {CONTRACT_SCAN_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        Default: {CONTRACT_SCAN_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <AttachmentDropbox
                accept={ACCEPT_ATTR}
                multiple
                disabled={pending || pages.length >= CONTRACT_MAX_PAGES}
                title="Drop signed contract photos or PDFs here"
                description="JPEG, PNG, WebP, or PDF, up to 15 MB per file"
                buttonLabel="Add attachment"
                onFilesSelected={addFilesFromList}
                secondaryAction={
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => setCameraDialogOpen(true)}
                    disabled={pending || pages.length >= CONTRACT_MAX_PAGES}
                  >
                    Scan with camera
                  </Button>
                }
              />

              {pickerError && (
                <Alert tone="danger" role="alert">
                  {pickerError}
                </Alert>
              )}
              {state.status === "error" && state.fieldErrors.pages && (
                <Alert tone="danger" role="alert">
                  {state.fieldErrors.pages}
                </Alert>
              )}

              {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No pages attached yet. Drop files above, click &ldquo;Add
                  attachment&rdquo;, or use &ldquo;Scan with camera&rdquo; to
                  capture and enhance a paper page.
                </p>
              ) : (
                <div className="divide-y divide-border border-t border-border">
                  {pages.map((page, index) => (
                    <div
                      key={page.localId}
                      className="grid gap-3 py-4 last:pb-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="grid gap-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              Page {index + 1}
                            </span>
                            <Badge
                              tone={
                                page.status === "ready"
                                  ? "success"
                                  : page.status === "error"
                                    ? "danger"
                                    : "info"
                              }
                            >
                              {page.status === "ready"
                                ? "Ready"
                                : page.status === "error"
                                  ? "Failed"
                                  : page.status === "processing"
                                    ? "Enhancing scan..."
                                    : "Uploading..."}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {page.fileName}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatByteSize(page.byteSize)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleMovePage(index, -1)}
                            disabled={index === 0 || pending}
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleMovePage(index, 1)}
                            disabled={index === pages.length - 1 || pending}
                          >
                            Down
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRemovePage(page.localId)}
                            disabled={pending}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>

                      {page.errorMessage && (
                        <Alert tone="danger" role="alert">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>{page.errorMessage}</span>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                void processAndUploadPage({
                                  localId: page.localId,
                                  sourceFile: page.sourceFile,
                                  isPdf: page.isPdf,
                                  mode: page.filterMode,
                                  rotationQuarterTurns:
                                    page.rotationQuarterTurns,
                                })
                              }
                            >
                              Retry upload
                            </Button>
                          </div>
                        </Alert>
                      )}

                      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                        <div className="flex min-h-[160px] items-center justify-center overflow-hidden rounded-control bg-surface-muted p-2">
                          {page.isPdf ? (
                            <div className="grid gap-1 text-center text-xs text-muted-foreground">
                              <Badge tone="neutral">PDF</Badge>
                              <span>Document attached</span>
                            </div>
                          ) : page.previewObjectUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={page.previewObjectUrl}
                              alt={`Scanned contract page ${index + 1}`}
                              className="max-h-52 w-auto max-w-full rounded object-contain"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Rendering preview...
                            </span>
                          )}
                        </div>

                        <div className="grid content-start gap-3">
                          <Field
                            id={`contract-page-label-${page.localId}`}
                            label="Page label (optional)"
                          >
                            {(fieldProps) => (
                              <Input
                                {...fieldProps}
                                value={page.label}
                                onChange={(e) => {
                                  const nextLabel = e.target.value;
                                  setPages((prev) =>
                                    prev.map((item) =>
                                      item.localId === page.localId
                                        ? { ...item, label: nextLabel }
                                        : item,
                                    ),
                                  );
                                }}
                                maxLength={60}
                                placeholder="e.g. Terms & Conditions, Signature page"
                                disabled={pending}
                              />
                            )}
                          </Field>

                          {!page.isPdf && (
                            <div className="flex flex-wrap items-center gap-2">
                              {CONTRACT_SCAN_MODES.map((mode) => (
                                <Button
                                  key={mode}
                                  type="button"
                                  size="sm"
                                  variant={
                                    page.filterMode === mode
                                      ? "primary"
                                      : "secondary"
                                  }
                                  disabled={pending}
                                  onClick={() =>
                                    void processAndUploadPage({
                                      localId: page.localId,
                                      sourceFile: page.sourceFile,
                                      isPdf: false,
                                      mode,
                                      rotationQuarterTurns:
                                        page.rotationQuarterTurns,
                                    })
                                  }
                                >
                                  {CONTRACT_SCAN_MODE_LABELS[mode]}
                                </Button>
                              ))}
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={pending}
                                onClick={() =>
                                  void processAndUploadPage({
                                    localId: page.localId,
                                    sourceFile: page.sourceFile,
                                    isPdf: false,
                                    mode: page.filterMode,
                                    rotationQuarterTurns:
                                      (page.rotationQuarterTurns + 1) % 4,
                                  })
                                }
                              >
                                Rotate 90&deg;
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="grid gap-4 p-5 lg:col-span-4 lg:sticky lg:top-6 sm:p-6">
            <h2 className="text-base font-semibold text-foreground">Summary</h2>

            <dl className="grid gap-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Tenant</dt>
                <dd className="text-right font-medium text-foreground">
                  {tenant.fullName}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Pages attached</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {pages.length} / {CONTRACT_MAX_PAGES}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Default scanner mode</dt>
                <dd className="font-medium text-foreground">
                  {CONTRACT_SCAN_MODE_LABELS[defaultFilterMode]}
                </dd>
              </div>
            </dl>

            <div className="hidden gap-2 pt-2 lg:grid">
              <Button
                type="submit"
                size="md"
                loading={pending}
                disabled={pending || !allReady}
              >
                {anyBusy
                  ? "Uploading scans..."
                  : pending
                    ? "Saving contract..."
                    : "Save signed contract"}
              </Button>
              <Link
                href={`/tenants/${tenant.id}`}
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
              disabled={pending || !allReady}
              className="w-full"
            >
              {anyBusy
                ? "Uploading scans..."
                : pending
                  ? "Saving contract..."
                  : "Save signed contract"}
            </Button>
            <Link
              href={`/tenants/${tenant.id}`}
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

      <ContractCameraScanDialog
        open={cameraDialogOpen}
        initialMode={defaultFilterMode}
        onClose={() => setCameraDialogOpen(false)}
        onConfirm={(scan) => void handleCameraScanConfirmed(scan)}
      />
    </div>
  );
}
