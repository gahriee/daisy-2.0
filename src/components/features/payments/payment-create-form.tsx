"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OfflineVaultUnlockDialog } from "@/components/features/offline/offline-vault-unlock";
import { Alert } from "@/components/ui/alert";
import { AttachmentDropbox } from "@/components/ui/attachment-dropbox";
import { Badge } from "@/components/ui/badge";
import { BackLink, Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  recordPaymentAction,
  type PaymentActionResult,
} from "@/features/payments/actions";
import {
  autoDistributePaymentCentavos,
  computePaymentDistribution,
} from "@/features/payments/calculations";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PROOF_ALLOWED_ACCEPT_ATTR,
  PROOF_ALLOWED_MIME_TYPES,
  RecordPaymentSyncPayloadSchema,
  type PaymentMethodValue,
  type PaymentOpenInvoiceOptionDto,
  type PaymentTenantOptionDto,
  type PaymentTransientOptionDto,
  type ProofMimeType,
} from "@/features/payments/schemas";
import {
  OVERPAYMENT_POLICY_LABELS,
  type OverpaymentPolicyValue,
} from "@/features/settings/schemas";
import { formatManilaDate, toManilaDate } from "@/lib/dates";
import {
  formatMoneyDecimal,
  formatPhpCurrency,
  parseMoneyDecimal,
} from "@/lib/money";
import { navigateOfflineInMemory } from "@/offline/navigation";
import {
  cacheOfflinePoliciesMeta,
  getOfflineVaultClientState,
  OfflineVaultLockedError,
  submitOfflineCapableMutation,
} from "@/offline/workspace-bridge";

type UploadedProofItem = {
  localId: string;
  fileName: string;
  mimeType: ProofMimeType;
  byteSize: number;
  status: "uploading" | "ready" | "error";
  intentId: string | null;
  queuedBytes?: Uint8Array;
  errorMessage: string | null;
};

async function computeFileSha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function resolveProofMimeType(file: File): ProofMimeType | null {
  const raw = file.type.trim().toLowerCase();
  if ((PROOF_ALLOWED_MIME_TYPES as readonly string[]).includes(raw)) {
    return raw as ProofMimeType;
  }
  const lowerName = file.name.trim().toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".heic")) return "image/heic";
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  return null;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function mapPaymentIssuesToFields(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export function PaymentCreateForm({
  tenants,
  transientGuests,
  openInvoices,
  initialTenantId,
  initialInvoiceId,
  policiesComplete,
  missingPolicyLabels,
  overpaymentPolicy,
  proofMaxBytes,
  proofMaxFilesPerRecord,
  offlineMode = false,
}: {
  tenants: PaymentTenantOptionDto[];
  transientGuests: PaymentTransientOptionDto[];
  openInvoices: PaymentOpenInvoiceOptionDto[];
  initialTenantId: string | null;
  initialInvoiceId: string | null;
  policiesComplete: boolean;
  missingPolicyLabels: string[];
  overpaymentPolicy: OverpaymentPolicyValue | null;
  proofMaxBytes: number;
  proofMaxFilesPerRecord: number;
  offlineMode?: boolean;
}) {
  const router = useRouter();
  const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);

  useEffect(() => {
    if (offlineMode || !navigator.onLine) return;
    const timer = window.setTimeout(() => {
      void cacheOfflinePoliciesMeta({
        policiesComplete,
        overpaymentPolicy,
        proofMaxBytes,
        proofMaxFilesPerRecord,
        missingPolicyLabels,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    missingPolicyLabels,
    offlineMode,
    overpaymentPolicy,
    policiesComplete,
    proofMaxBytes,
    proofMaxFilesPerRecord,
  ]);
  const initialInvoice = initialInvoiceId
    ? (openInvoices.find((inv) => inv.id === initialInvoiceId) ?? null)
    : null;
  const resolvedDefaultKey = initialInvoice?.transientGuestId
    ? `transient:${initialInvoice.transientGuestId}`
    : initialInvoice?.tenantId
      ? `tenant:${initialInvoice.tenantId}`
      : initialTenantId
        ? `tenant:${initialTenantId}`
        : tenants[0]
          ? `tenant:${tenants[0].id}`
          : transientGuests[0]
            ? `transient:${transientGuests[0].id}`
            : "";

  const [payerKey, setPayerKey] = useState(resolvedDefaultKey);
  const selectedTenantId = payerKey.startsWith("tenant:")
    ? payerKey.slice("tenant:".length)
    : "";
  const selectedTransientGuestId = payerKey.startsWith("transient:")
    ? payerKey.slice("transient:".length)
    : "";

  const [method, setMethod] = useState<PaymentMethodValue>("CASH");
  const [paidDateManila, setPaidDateManila] = useState(() =>
    toManilaDate(new Date()),
  );
  const [amountInput, setAmountInput] = useState(
    initialInvoice ? initialInvoice.balanceAmount : "",
  );
  const [allocMap, setAllocMap] = useState<Record<string, string>>(() =>
    initialInvoice ? { [initialInvoice.id]: initialInvoice.balanceAmount } : {},
  );
  const [proofs, setProofs] = useState<UploadedProofItem[]>([]);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const tenantInvoices = openInvoices.filter((inv) =>
    selectedTransientGuestId
      ? inv.transientGuestId === selectedTransientGuestId
      : inv.tenantId === selectedTenantId,
  );
  const selectedPayer =
    tenants.find((t) => t.id === selectedTenantId) ??
    transientGuests.find((g) => g.id === selectedTransientGuestId) ??
    null;

  const [state, submitAction, pending] = useActionState(
    async (
      prev: PaymentActionResult,
      formData: FormData,
    ): Promise<PaymentActionResult> => {
      const vault = await getOfflineVaultClientState();
      const useOfflineBridge =
        offlineMode ||
        !vault.online ||
        (vault.vaultUnlocked && Boolean(vault.deviceId));

      if (useOfflineBridge) {
        const queuedProofItems = proofs.filter(
          (item) => item.status === "ready" && Boolean(item.queuedBytes),
        );
        const alreadyUploadedIntentIds = proofs
          .filter(
            (item) =>
              item.status === "ready" && item.intentId && !item.queuedBytes,
          )
          .map((item) => item.intentId as string);

        let allocationsParsed: unknown = [];
        try {
          allocationsParsed = JSON.parse(
            String(formData.get("allocationsJson") ?? "[]"),
          );
        } catch {
          allocationsParsed = [];
        }

        const parsed = RecordPaymentSyncPayloadSchema.safeParse({
          tenantId: selectedTenantId || null,
          transientGuestId: selectedTransientGuestId || null,
          amount: String(formData.get("amount") ?? amountInput),
          method,
          paidDateManila,
          referenceNo: String(formData.get("referenceNo") ?? ""),
          notes: String(formData.get("notes") ?? ""),
          allocations: allocationsParsed,
          proofIntentIds: alreadyUploadedIntentIds,
        });
        if (!parsed.success) {
          return {
            status: "error",
            message:
              parsed.error.issues[0]?.message ??
              "Review payment details before saving.",
            fieldErrors: mapPaymentIssuesToFields(parsed.error.issues),
          };
        }

        try {
          const entityId = crypto.randomUUID();
          const nowIso = new Date().toISOString();
          const allocatedCentavos = parsed.data.allocations.reduce(
            (acc, item) => acc + parseMoneyDecimal(item.amount),
            BigInt(0),
          );
          const totalCentavos = parseMoneyDecimal(parsed.data.amount);
          const unallocatedCentavos =
            totalCentavos > allocatedCentavos
              ? totalCentavos - allocatedCentavos
              : BigInt(0);

          const res = await submitOfflineCapableMutation({
            type: "payment.record",
            entityId,
            baseVersion: 0,
            payload: parsed.data,
            projectionPayload: {
              id: entityId,
              payerKind: selectedTransientGuestId ? "TRANSIENT" : "TENANT",
              tenantId: parsed.data.tenantId,
              transientGuestId: parsed.data.transientGuestId,
              tenantName: selectedPayer?.fullName ?? "Payer",
              receiptNumber: null,
              status: "POSTED",
              method: parsed.data.method,
              amount: parsed.data.amount,
              allocatedAmount: formatMoneyDecimal(allocatedCentavos),
              unallocatedAmount: formatMoneyDecimal(unallocatedCentavos),
              paidAt: nowIso,
              paidDateManila:
                parsed.data.paidDateManila ?? toManilaDate(new Date()),
              referenceNo: parsed.data.referenceNo,
              notes: parsed.data.notes,
              createdAt: nowIso,
              updatedAt: nowIso,
              allocations: parsed.data.allocations.map((alloc) => {
                const match = tenantInvoices.find(
                  (inv) => inv.id === alloc.invoiceId,
                );
                return {
                  id: crypto.randomUUID(),
                  invoiceId: alloc.invoiceId,
                  invoiceNumber: match?.invoiceNumber ?? null,
                  billingPeriod: match?.billingPeriod ?? null,
                  amount: alloc.amount,
                };
              }),
              proofs: queuedProofItems.map((item) => ({
                id: item.localId,
                intentId: item.intentId ?? item.localId,
                fileName: item.fileName,
                mimeType: item.mimeType,
                byteSize: item.byteSize,
                sha256: "",
                createdAt: nowIso,
                downloadPath: "",
              })),
            },
            ...(queuedProofItems.length > 0
              ? {
                  attachments: {
                    kind: "payment_proof" as const,
                    files: queuedProofItems.map((item) => ({
                      attachmentId: item.localId,
                      clientFileId: item.localId,
                      fileName: item.fileName,
                      mimeType: item.mimeType,
                      bytes: item.queuedBytes!,
                    })),
                    maxBytes: proofMaxBytes,
                    maxFiles: proofMaxFilesPerRecord,
                  },
                }
              : {}),
            syncedMessage: "Payment saved.",
            queuedMessage:
              "Payment saved on this device (waiting to go online).",
          });

          if (res.delivery === "synced") {
            toast.success(res.message);
            if (offlineMode || !navigator.onLine) {
              navigateOfflineInMemory(`/payments/${entityId}`);
            } else {
              router.push(`/payments/${entityId}`);
            }
          } else {
            if (res.delivery === "needs_attention") {
              toast.warning(res.reason);
            } else {
              toast.info(res.message);
            }
            if (offlineMode || !navigator.onLine) {
              navigateOfflineInMemory("/payments");
            } else {
              router.push("/payments");
            }
          }
          if (navigator.onLine && !offlineMode) {
            router.refresh();
          }
          return {
            status: "saved",
            message:
              res.delivery === "needs_attention" ? res.reason : res.message,
            paymentId: entityId,
          };
        } catch (error) {
          if (error instanceof OfflineVaultLockedError) {
            setUnlockPromptOpen(true);
          }
          return {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not save payment locally.",
            fieldErrors: {},
          };
        }
      }

      const result = await recordPaymentAction(prev, formData);
      if (result.status === "saved") {
        toast.success(result.message);
        router.push(
          result.paymentId ? `/payments/${result.paymentId}` : "/payments",
        );
        router.refresh();
      }
      return result;
    },
    { status: "idle" },
  );

  function handlePayerChange(nextKey: string) {
    setPayerKey(nextKey);
    const nextIsTransient = nextKey.startsWith("transient:");
    const nextId = nextKey.includes(":")
      ? nextKey.slice(nextKey.indexOf(":") + 1)
      : nextKey;
    const nextInvoices = openInvoices.filter((inv) =>
      nextIsTransient
        ? inv.transientGuestId === nextId
        : inv.tenantId === nextId,
    );
    const totalOpen = nextInvoices.reduce(
      (acc, inv) => acc + parseMoneyDecimal(inv.balanceAmount),
      BigInt(0),
    );
    const nextAmountStr =
      totalOpen > BigInt(0) ? formatMoneyDecimal(totalOpen) : "";
    setAmountInput(nextAmountStr);
    if (totalOpen > BigInt(0)) {
      const distributed = autoDistributePaymentCentavos({
        paymentAmountCentavos: totalOpen,
        openInvoices: nextInvoices.map((inv) => ({
          invoiceId: inv.id,
          openBalanceCentavos: parseMoneyDecimal(inv.balanceAmount),
        })),
      });
      setAllocMap(
        Object.fromEntries(
          distributed.allocations.map((item) => [item.invoiceId, item.amount]),
        ),
      );
    } else {
      setAllocMap({});
    }
  }

  function handleAutoAllocate() {
    let amountCentavos = BigInt(0);
    try {
      amountCentavos = parseMoneyDecimal(amountInput);
    } catch {
      return;
    }
    if (amountCentavos <= BigInt(0)) return;
    const distributed = autoDistributePaymentCentavos({
      paymentAmountCentavos: amountCentavos,
      openInvoices: tenantInvoices.map((inv) => ({
        invoiceId: inv.id,
        openBalanceCentavos: parseMoneyDecimal(inv.balanceAmount),
      })),
    });
    setAllocMap(
      Object.fromEntries(
        distributed.allocations.map((item) => [item.invoiceId, item.amount]),
      ),
    );
  }

  function toggleInvoiceSelection(
    inv: PaymentOpenInvoiceOptionDto,
    checked: boolean,
  ) {
    setAllocMap((prev) => {
      const next = { ...prev };
      if (!checked) {
        delete next[inv.id];
      } else {
        next[inv.id] = inv.balanceAmount;
      }
      return next;
    });
  }

  async function addProofFiles(selected: File[]) {
    setUploadNotice(null);

    if (selected.length === 0) return;

    const remainingSlots = proofMaxFilesPerRecord - proofs.length;
    if (remainingSlots <= 0) {
      setUploadNotice(
        `You can attach up to ${proofMaxFilesPerRecord} proof files per payment.`,
      );
      return;
    }

    const batch = selected.slice(0, remainingSlots);
    if (selected.length > remainingSlots) {
      setUploadNotice(
        `Only the first ${remainingSlots} ${remainingSlots === 1 ? "file was" : "files were"} added to stay within your limit of ${proofMaxFilesPerRecord}.`,
      );
    }

    for (const file of batch) {
      const localId = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const mimeType = resolveProofMimeType(file);
      if (!mimeType) {
        setProofs((prev) => [
          ...prev,
          {
            localId,
            fileName: file.name,
            mimeType: "image/jpeg",
            byteSize: file.size,
            status: "error",
            intentId: null,
            errorMessage: "Use JPG, PNG, WebP, HEIC image or PDF.",
          },
        ]);
        continue;
      }
      if (file.size <= 0 || file.size > proofMaxBytes) {
        setProofs((prev) => [
          ...prev,
          {
            localId,
            fileName: file.name,
            mimeType,
            byteSize: file.size,
            status: "error",
            intentId: null,
            errorMessage: `File exceeds max ${formatByteSize(proofMaxBytes)} limit.`,
          },
        ]);
        continue;
      }

      const vaultState = await getOfflineVaultClientState();
      if (
        offlineMode ||
        !vaultState.online ||
        (vaultState.vaultUnlocked && Boolean(vaultState.deviceId))
      ) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        setProofs((prev) => [
          ...prev,
          {
            localId: crypto.randomUUID(),
            fileName: file.name,
            mimeType,
            byteSize: file.size,
            status: "ready",
            intentId: null,
            queuedBytes: bytes,
            errorMessage: null,
          },
        ]);
        continue;
      }

      setProofs((prev) => [
        ...prev,
        {
          localId,
          fileName: file.name,
          mimeType,
          byteSize: file.size,
          status: "uploading",
          intentId: null,
          errorMessage: null,
        },
      ]);

      try {
        const sha256 = await computeFileSha256Hex(file);
        const intentRes = await fetch("/api/payments/proofs/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            mimeType,
            byteSize: file.size,
            sha256,
          }),
          cache: "no-store",
        });

        const intentPayload = (await intentRes.json()) as {
          intentId?: string;
          proxyUploadPath?: string;
          error?: string;
        };
        if (
          !intentRes.ok ||
          !intentPayload.intentId ||
          !intentPayload.proxyUploadPath
        ) {
          throw new Error(
            intentPayload.error ??
              "Could not start uploading this payment photo.",
          );
        }

        const uploadRes = await fetch(intentPayload.proxyUploadPath, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: file,
          cache: "no-store",
        });

        if (!uploadRes.ok) {
          const uploadErr = (await uploadRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(uploadErr.error ?? "Proof storage upload failed.");
        }

        setProofs((prev) =>
          prev.map((item) =>
            item.localId === localId
              ? {
                  ...item,
                  status: "ready",
                  intentId: intentPayload.intentId ?? null,
                }
              : item,
          ),
        );
      } catch (err) {
        setProofs((prev) =>
          prev.map((item) =>
            item.localId === localId
              ? {
                  ...item,
                  status: "error",
                  errorMessage:
                    err instanceof Error
                      ? err.message
                      : "Proof upload failed. Remove and retry.",
                }
              : item,
          ),
        );
      }
    }
  }

  const activeAllocations: Array<{ invoiceId: string; amount: string }> = [];
  for (const inv of tenantInvoices) {
    const raw = allocMap[inv.id]?.trim();
    if (!raw) continue;
    try {
      const centavos = parseMoneyDecimal(raw);
      if (centavos > BigInt(0)) {
        activeAllocations.push({
          invoiceId: inv.id,
          amount: formatMoneyDecimal(centavos),
        });
      }
    } catch {
      // Wait for user to fix typed decimal
    }
  }

  const readyProofCount = proofs.filter(
    (p) =>
      p.status === "ready" && (Boolean(p.intentId) || Boolean(p.queuedBytes)),
  ).length;
  const readyProofIntentIds = proofs
    .filter((p) => p.status === "ready" && p.intentId)
    .map((p) => p.intentId as string);
  const hasUploadingProofs = proofs.some((p) => p.status === "uploading");

  let previewDistribution:
    | ReturnType<typeof computePaymentDistribution>
    | { ok: false; kind: "invalid_amount"; message: string }
    | null = null;
  if (amountInput.trim() && overpaymentPolicy) {
    try {
      const paymentCentavos = parseMoneyDecimal(amountInput);
      if (paymentCentavos > BigInt(0)) {
        previewDistribution = computePaymentDistribution({
          paymentAmountCentavos: paymentCentavos,
          allocations: activeAllocations.map((item) => {
            const match = tenantInvoices.find((i) => i.id === item.invoiceId);
            return {
              invoiceId: item.invoiceId,
              amountCentavos: parseMoneyDecimal(item.amount),
              openBalanceCentavos: match
                ? parseMoneyDecimal(match.balanceAmount)
                : BigInt(0),
            };
          }),
          overpaymentPolicy,
        });
      }
    } catch {
      previewDistribution = {
        ok: false,
        kind: "invalid_amount",
        message: "Enter a valid positive peso amount.",
      };
    }
  }

  const hasAnyPayers = tenants.length > 0 || transientGuests.length > 0;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <BackLink href="/payments">Payments</BackLink>
        <header className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Record payment
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Assigns an atomic official receipt number and updates selected
            invoice balances.
          </p>
        </header>
      </div>

      {!policiesComplete && (
        <Alert tone="warning" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Receipt policies ({missingPolicyLabels.join(" and ")}) are not
              ready yet. Ask your setup contact to check the server
              configuration.
            </span>
          </div>
        </Alert>
      )}

      {state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}

      <CompactFormScope>
        <form
          action={submitAction}
          className="grid items-start gap-5 lg:grid-cols-12"
          noValidate
        >
          <input
            type="hidden"
            name="allocationsJson"
            value={JSON.stringify(activeAllocations)}
          />
          <input
            type="hidden"
            name="proofIntentIdsJson"
            value={JSON.stringify(readyProofIntentIds)}
          />

          <div className="grid gap-5 lg:col-span-8">
            <Card className="grid gap-4">
              <div className="grid gap-1">
                <h2 className="text-base font-semibold text-foreground">
                  Collection details
                </h2>
                <p className="text-xs text-muted-foreground">
                  Choose the payer, tender method, collection date, and amount
                  received.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="payment-tenant"
                  label="Boarder or transient guest"
                  required
                  error={
                    state.status === "error"
                      ? state.fieldErrors.tenantId
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <>
                      <input
                        type="hidden"
                        name="tenantId"
                        value={selectedTenantId}
                      />
                      <input
                        type="hidden"
                        name="transientGuestId"
                        value={selectedTransientGuestId}
                      />
                      <Select
                        {...fieldProps}
                        value={payerKey}
                        onChange={(event) =>
                          handlePayerChange(event.target.value)
                        }
                      >
                        {tenants.length > 0 && (
                          <optgroup label="Boarders">
                            {tenants.map((tenant) => (
                              <option
                                key={tenant.id}
                                value={`tenant:${tenant.id}`}
                              >
                                {tenant.fullName}
                                {tenant.openInvoiceCount > 0
                                  ? ` (${formatPhpCurrency(tenant.openBalance)} open)`
                                  : ""}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {transientGuests.length > 0 && (
                          <optgroup label="Transient guests">
                            {transientGuests.map((guest) => (
                              <option
                                key={guest.id}
                                value={`transient:${guest.id}`}
                              >
                                {guest.fullName}
                                {guest.openInvoiceCount > 0
                                  ? ` (${formatPhpCurrency(guest.openBalance)} open)`
                                  : ""}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </Select>
                    </>
                  )}
                </Field>

                <Field
                  id="payment-method"
                  label="Payment method"
                  required
                  error={
                    state.status === "error"
                      ? state.fieldErrors.method
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      name="method"
                      value={method}
                      onChange={(event) =>
                        setMethod(event.target.value as PaymentMethodValue)
                      }
                    >
                      {PAYMENT_METHODS.map((item) => (
                        <option key={item} value={item}>
                          {PAYMENT_METHOD_LABELS[item]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="payment-amount"
                  label="Amount received (PHP)"
                  required
                  error={
                    state.status === "error"
                      ? state.fieldErrors.amount
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      name="amount"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amountInput}
                      onChange={(event) => setAmountInput(event.target.value)}
                    />
                  )}
                </Field>

                <Field
                  id="payment-date"
                  label="Collection date"
                  required
                  error={
                    state.status === "error"
                      ? state.fieldErrors.paidDateManila
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <DatePicker
                      {...fieldProps}
                      required
                      name="paidDateManila"
                      value={paidDateManila}
                      onValueChange={setPaidDateManila}
                    />
                  )}
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="payment-reference"
                  label="Reference number"
                  description="Optional GCash/bank transfer ref or check #"
                  error={
                    state.status === "error"
                      ? state.fieldErrors.referenceNo
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      name="referenceNo"
                      maxLength={80}
                      placeholder="e.g. GCASH-928371"
                    />
                  )}
                </Field>

                <Field
                  id="payment-notes"
                  label="Notes"
                  error={
                    state.status === "error"
                      ? state.fieldErrors.notes
                      : undefined
                  }
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      name="notes"
                      maxLength={500}
                      placeholder="Optional collection notes"
                    />
                  )}
                </Field>
              </div>
            </Card>

            <Card className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Invoice allocations
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {overpaymentPolicy
                      ? `Policy: ${OVERPAYMENT_POLICY_LABELS[overpaymentPolicy]}`
                      : "Overpayment policy not configured."}
                  </p>
                </div>
                {tenantInvoices.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedPayer &&
                      parseMoneyDecimal(selectedPayer.openBalance) >
                        BigInt(0) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAmountInput(selectedPayer.openBalance);
                            const dist = autoDistributePaymentCentavos({
                              paymentAmountCentavos: parseMoneyDecimal(
                                selectedPayer.openBalance,
                              ),
                              openInvoices: tenantInvoices.map((inv) => ({
                                invoiceId: inv.id,
                                openBalanceCentavos: parseMoneyDecimal(
                                  inv.balanceAmount,
                                ),
                              })),
                            });
                            setAllocMap(
                              Object.fromEntries(
                                dist.allocations.map((a) => [
                                  a.invoiceId,
                                  a.amount,
                                ]),
                              ),
                            );
                          }}
                        >
                          Fill open balance
                        </Button>
                      )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleAutoAllocate}
                    >
                      Auto-allocate FIFO
                    </Button>
                  </div>
                )}
              </div>

              {tenantInvoices.length === 0 ? (
                <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                  No open issued invoices for this payer.
                  {overpaymentPolicy === "CREDIT_NEXT_INVOICE"
                    ? " The full payment will be held as unallocated credit for future invoices."
                    : " Issue an invoice first or change your overpayment policy in Settings."}
                </p>
              ) : (
                <div className="divide-y divide-border border-t border-border">
                  {tenantInvoices.map((inv) => {
                    const allocatedVal = allocMap[inv.id] ?? "";
                    const checked = allocatedVal.trim() !== "";
                    return (
                      <div
                        key={inv.id}
                        className="grid gap-2 py-3 last:pb-0 sm:grid-cols-[1fr_9rem] sm:items-center"
                      >
                        <Checkbox
                          aria-label={`Apply payment to ${inv.invoiceNumber ?? inv.id}`}
                          checked={checked}
                          onChange={(event) =>
                            toggleInvoiceSelection(inv, event.target.checked)
                          }
                          label={
                            <div className="grid gap-0.5 text-xs">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono font-semibold text-foreground tabular-nums">
                                  {inv.invoiceNumber ?? "Issued"}
                                </span>
                                {inv.isOverdue && (
                                  <Badge tone="danger">Overdue</Badge>
                                )}
                              </div>
                              <div className="grid gap-0.5 text-muted-foreground tabular-nums">
                                <span>
                                  Due {formatManilaDate(inv.dueDateManila)}
                                </span>
                                <span>
                                  Open{" "}
                                  <strong className="font-semibold text-foreground">
                                    {formatPhpCurrency(inv.balanceAmount)}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          }
                        />

                        <Input
                          aria-label={`Amount applied to ${inv.invoiceNumber ?? inv.id}`}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={allocatedVal}
                          onChange={(event) =>
                            setAllocMap((prev) => ({
                              ...prev,
                              [inv.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {previewDistribution && !previewDistribution.ok && (
                <Alert tone="warning" role="status">
                  {previewDistribution.message}
                </Alert>
              )}

              {previewDistribution &&
                previewDistribution.ok &&
                previewDistribution.unallocatedCentavos > BigInt(0) && (
                  <Alert tone="info" role="status">
                    PHP{" "}
                    {formatMoneyDecimal(
                      previewDistribution.unallocatedCentavos,
                    )}{" "}
                    will carry forward as unallocated credit.
                  </Alert>
                )}
            </Card>

            <Card className="grid gap-4">
              <div className="grid gap-0.5">
                <h2 className="text-base font-semibold text-foreground">
                  Proof attachments (optional)
                </h2>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Up to {proofMaxFilesPerRecord} files, max{" "}
                  {formatByteSize(proofMaxBytes)} each (JPG, PNG, WebP, HEIC, or
                  PDF).
                </p>
              </div>

              <AttachmentDropbox
                accept={PROOF_ALLOWED_ACCEPT_ATTR}
                multiple
                disabled={pending || proofs.length >= proofMaxFilesPerRecord}
                title="Drop payment receipts or screenshots here"
                description="GCash, Maya, bank transfer slips, or PDF receipts"
                buttonLabel="Add attachment"
                onFilesSelected={(files) => void addProofFiles(files)}
              />

              {uploadNotice && (
                <Alert tone="warning" role="status">
                  {uploadNotice}
                </Alert>
              )}

              {proofs.length > 0 && (
                <div className="divide-y divide-border border-t border-border">
                  {proofs.map((item) => (
                    <div
                      key={item.localId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 last:pb-0 text-xs"
                    >
                      <div className="grid min-w-0 gap-0.5">
                        <span className="truncate font-medium text-foreground">
                          {item.fileName}
                        </span>
                        <span className="text-muted-foreground">
                          {item.mimeType}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatByteSize(item.byteSize)}
                        </span>
                        {item.errorMessage && (
                          <span className="text-danger">
                            {item.errorMessage}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            item.status === "ready"
                              ? "success"
                              : item.status === "uploading"
                                ? "info"
                                : "danger"
                          }
                        >
                          {item.status === "ready"
                            ? item.queuedBytes
                              ? "Waiting to save"
                              : "Verified"
                            : item.status === "uploading"
                              ? "Uploading"
                              : "Failed"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-danger"
                          onClick={() =>
                            setProofs((prev) =>
                              prev.filter((p) => p.localId !== item.localId),
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="grid gap-4 lg:sticky lg:top-6 lg:col-span-4">
            <h2 className="text-base font-semibold text-foreground">Summary</h2>

            <dl className="grid gap-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Payer</dt>
                <dd className="text-right font-medium text-foreground">
                  {selectedPayer ? selectedPayer.fullName : "None selected"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Open balance</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {selectedPayer
                    ? formatPhpCurrency(selectedPayer.openBalance)
                    : "₱0.00"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Invoices selected</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {activeAllocations.length}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Proofs</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {readyProofCount}
                </dd>
              </div>
            </dl>

            <div className="hidden gap-2.5 border-t border-border pt-3 lg:grid">
              <Button
                type="submit"
                size="md"
                loading={pending}
                disabled={
                  !policiesComplete ||
                  !hasAnyPayers ||
                  hasUploadingProofs ||
                  (previewDistribution !== null && !previewDistribution.ok)
                }
              >
                {hasUploadingProofs ? "Uploading proofs…" : "Post payment"}
              </Button>
              <Link
                href="/payments"
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
              disabled={
                !policiesComplete ||
                !hasAnyPayers ||
                hasUploadingProofs ||
                (previewDistribution !== null && !previewDistribution.ok)
              }
              className="w-full"
            >
              {hasUploadingProofs ? "Uploading proofs…" : "Post payment"}
            </Button>
            <Link
              href="/payments"
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

      <OfflineVaultUnlockDialog
        open={unlockPromptOpen}
        onClose={() => setUnlockPromptOpen(false)}
      />
    </div>
  );
}
