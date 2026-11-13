"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  saveBusinessSettingsAction,
  type SaveSettingsActionState,
} from "@/features/settings/actions";
import {
  DEPOSIT_POLICIES,
  DEPOSIT_POLICY_LABELS,
  OVERPAYMENT_POLICIES,
  OVERPAYMENT_POLICY_LABELS,
  PRORATION_POLICIES,
  PRORATION_POLICY_LABELS,
  type BusinessSettingsDto,
} from "@/features/settings/schemas";

export type SettingsTabKey = "profile" | "policies" | "operations" | "devices";

type DraftState = {
  version: number;
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  tin: string;
  billingDayOfMonth: string;
  gracePeriodDays: string;
  prorationPolicy: string;
  depositPolicy: string;
  overpaymentPolicy: string;
  invoicePrefix: string;
  receiptPrefix: string;
  checkInTimeManila: string;
  checkOutTimeManila: string;
  offlineUnlockMaxDays: string;
  proofMaxMb: string;
  proofMaxFilesPerRecord: string;
  policiesComplete: boolean;
};

const FIELD_TAB_MAP: Record<string, Exclude<SettingsTabKey, "devices">> = {
  businessName: "profile",
  businessPhone: "profile",
  businessAddress: "profile",
  tin: "profile",
  billingDayOfMonth: "policies",
  gracePeriodDays: "policies",
  prorationPolicy: "policies",
  depositPolicy: "policies",
  overpaymentPolicy: "policies",
  invoicePrefix: "policies",
  receiptPrefix: "policies",
  checkInTimeManila: "operations",
  checkOutTimeManila: "operations",
  offlineUnlockMaxDays: "operations",
  proofMaxMb: "operations",
  proofMaxFilesPerRecord: "operations",
};

const FIELD_ELEMENT_ID_MAP: Record<string, string> = {
  businessName: "settings-business-name",
  businessPhone: "settings-business-phone",
  businessAddress: "settings-business-address",
  tin: "settings-tin",
  billingDayOfMonth: "settings-billing-day",
  gracePeriodDays: "settings-grace-days",
  prorationPolicy: "settings-proration",
  depositPolicy: "settings-deposit",
  overpaymentPolicy: "settings-overpayment",
  invoicePrefix: "settings-invoice-prefix",
  receiptPrefix: "settings-receipt-prefix",
  checkInTimeManila: "settings-checkin-time",
  checkOutTimeManila: "settings-checkout-time",
  offlineUnlockMaxDays: "settings-offline-days",
  proofMaxMb: "settings-proof-mb",
  proofMaxFilesPerRecord: "settings-proof-files",
};

function toDraft(settings: BusinessSettingsDto): DraftState {
  return {
    version: settings.version,
    businessName: settings.businessName,
    businessPhone: settings.businessPhone ?? "",
    businessAddress: settings.businessAddress ?? "",
    tin: settings.tin ?? "",
    billingDayOfMonth:
      settings.billingDayOfMonth !== null
        ? String(settings.billingDayOfMonth)
        : "",
    gracePeriodDays:
      settings.gracePeriodDays !== null ? String(settings.gracePeriodDays) : "",
    prorationPolicy: settings.prorationPolicy ?? "",
    depositPolicy: settings.depositPolicy ?? "",
    overpaymentPolicy: settings.overpaymentPolicy ?? "",
    invoicePrefix: settings.invoicePrefix ?? "",
    receiptPrefix: settings.receiptPrefix ?? "",
    checkInTimeManila: settings.checkInTimeManila ?? "",
    checkOutTimeManila: settings.checkOutTimeManila ?? "",
    offlineUnlockMaxDays: String(settings.offlineUnlockMaxDays),
    proofMaxMb: String(Math.round(settings.proofMaxBytes / (1024 * 1024))),
    proofMaxFilesPerRecord: String(settings.proofMaxFilesPerRecord),
    policiesComplete: settings.policiesComplete,
  };
}

function hasFieldErrorInTab(
  fieldErrors: Record<string, string>,
  tab: Exclude<SettingsTabKey, "devices">,
): boolean {
  return Object.keys(fieldErrors).some((key) => FIELD_TAB_MAP[key] === tab);
}

function SettingsRow({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:gap-10">
      <div className="grid content-start gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {badge}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

/**
 * Atomic, version-checked property settings form split across Profile, Policies,
 * and Stays & limits while preserving unsaved drafts across navigation sections.
 */
export function BusinessSettingsForm({
  initialSettings,
  activeTab,
  onSelectTab,
  onSaved,
}: {
  initialSettings: BusinessSettingsDto;
  activeTab: SettingsTabKey;
  onSelectTab: (tab: SettingsTabKey) => void;
  onSaved?: (settings: BusinessSettingsDto) => void;
}) {
  const [savedSnapshot, setSavedSnapshot] = useState<DraftState>(() =>
    toDraft(initialSettings),
  );
  const [draft, setDraft] = useState<DraftState>(() =>
    toDraft(initialSettings),
  );

  const [state, formAction, pending] = useActionState<
    SaveSettingsActionState,
    FormData
  >(
    async (prev, formData) => {
      const next = await saveBusinessSettingsAction(prev, formData);
      if (next.status === "saved") {
        const nextDraft = toDraft(next.settings);
        setSavedSnapshot(nextDraft);
        setDraft(nextDraft);
        onSaved?.(next.settings);
      } else if (next.status === "error") {
        const firstField = Object.keys(next.fieldErrors)[0];
        if (firstField) {
          const targetTab = FIELD_TAB_MAP[firstField];
          if (targetTab && targetTab !== activeTab) {
            onSelectTab(targetTab);
          }
          const elementId = FIELD_ELEMENT_ID_MAP[firstField];
          if (elementId) {
            requestAnimationFrame(() => {
              document.getElementById(elementId)?.focus();
            });
          }
        }
      }
      return next;
    },
    { status: "idle" },
  );

  const fieldErrors = state.status === "error" ? state.fieldErrors : {};
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedSnapshot);

  return (
    <form
      action={formAction}
      noValidate
      hidden={activeTab === "devices"}
      className={activeTab === "devices" ? "hidden" : "grid gap-5"}
    >
      <input type="hidden" name="expectedVersion" value={draft.version} />

      {activeTab !== "devices" && !draft.policiesComplete && (
        <Alert tone="warning" title="Required before billing or bookings">
          Configure billing day, grace period, proration, deposit, overpayment,
          document prefixes, and stay check-in/out times. No financial policy
          has an implicit default.
        </Alert>
      )}

      {activeTab !== "devices" && state.status === "saved" && (
        <Alert tone="success" role="status">
          {state.message}
        </Alert>
      )}

      {activeTab !== "devices" && state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
          {hasFieldErrorInTab(fieldErrors, "profile") &&
            activeTab !== "profile" &&
            " Check Property profile."}
          {hasFieldErrorInTab(fieldErrors, "policies") &&
            activeTab !== "policies" &&
            " Check Billing & policies."}
          {hasFieldErrorInTab(fieldErrors, "operations") &&
            activeTab !== "operations" &&
            " Check Stays & limits."}
        </Alert>
      )}

      <div className="overflow-hidden rounded-panel border border-border bg-surface">
        <section
          hidden={activeTab !== "profile"}
          aria-hidden={activeTab !== "profile"}
          className="divide-y divide-border"
        >
          <SettingsRow
            title="Property identity"
            description="Boarding house name, primary phone, and street address printed on invoices and notices."
          >
            <Field
              id="settings-business-name"
              label="Boarding house name"
              required
              {...(fieldErrors.businessName
                ? { error: fieldErrors.businessName }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="businessName"
                  value={draft.businessName}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      businessName: event.target.value,
                    }))
                  }
                  placeholder="e.g. Daisy Residences"
                  autoComplete="organization"
                />
              )}
            </Field>

            <Field
              id="settings-business-phone"
              label="Contact phone"
              {...(fieldErrors.businessPhone
                ? { error: fieldErrors.businessPhone }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="businessPhone"
                  type="tel"
                  inputMode="tel"
                  value={draft.businessPhone}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      businessPhone: event.target.value,
                    }))
                  }
                  placeholder="+63 917 000 0000"
                  autoComplete="tel"
                />
              )}
            </Field>

            <Field
              id="settings-business-address"
              label="Property address"
              className="sm:col-span-2"
              {...(fieldErrors.businessAddress
                ? { error: fieldErrors.businessAddress }
                : {})}
            >
              {(props) => (
                <Textarea
                  {...props}
                  name="businessAddress"
                  value={draft.businessAddress}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      businessAddress: event.target.value,
                    }))
                  }
                  placeholder="Street, barangay, city"
                  className="min-h-20"
                />
              )}
            </Field>
          </SettingsRow>

          <SettingsRow
            title="Tax registration"
            description="Optional BIR Tax Identification Number shown on issued receipts and billing statements."
          >
            <Field
              id="settings-tin"
              label="TIN (optional)"
              {...(fieldErrors.tin ? { error: fieldErrors.tin } : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="tin"
                  value={draft.tin}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, tin: event.target.value }))
                  }
                  placeholder="000-000-000-000"
                />
              )}
            </Field>
          </SettingsRow>
        </section>

        <section
          hidden={activeTab !== "policies"}
          aria-hidden={activeTab !== "policies"}
          className="divide-y divide-border"
        >
          <SettingsRow
            title="Billing schedule"
            description="Monthly rent generation day and payment grace window before invoices are marked overdue."
            badge={
              <Badge tone={draft.policiesComplete ? "success" : "warning"}>
                {draft.policiesComplete ? "Configured" : "Action needed"}
              </Badge>
            }
          >
            <Field
              id="settings-billing-day"
              label="Monthly billing day (1–28)"
              description="Day of each month rent invoices generate."
              {...(fieldErrors.billingDayOfMonth
                ? { error: fieldErrors.billingDayOfMonth }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="billingDayOfMonth"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={28}
                  value={draft.billingDayOfMonth}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      billingDayOfMonth: event.target.value,
                    }))
                  }
                  placeholder="1"
                />
              )}
            </Field>

            <Field
              id="settings-grace-days"
              label="Payment grace period (days)"
              description="Days after billing date before due date."
              {...(fieldErrors.gracePeriodDays
                ? { error: fieldErrors.gracePeriodDays }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="gracePeriodDays"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={60}
                  value={draft.gracePeriodDays}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      gracePeriodDays: event.target.value,
                    }))
                  }
                  placeholder="5"
                />
              )}
            </Field>
          </SettingsRow>

          <SettingsRow
            title="Financial policies"
            description="Explicit Owner rules for mid-month move-ins, deposits, and surplus payments."
          >
            <Field
              id="settings-proration"
              label="Proration policy"
              {...(fieldErrors.prorationPolicy
                ? { error: fieldErrors.prorationPolicy }
                : {})}
            >
              {(props) => (
                <Select
                  {...props}
                  name="prorationPolicy"
                  value={draft.prorationPolicy}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      prorationPolicy: event.target.value,
                    }))
                  }
                >
                  <option value="">Not configured yet</option>
                  {PRORATION_POLICIES.map((policy) => (
                    <option key={policy} value={policy}>
                      {PRORATION_POLICY_LABELS[policy]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              id="settings-deposit"
              label="Security deposit policy"
              {...(fieldErrors.depositPolicy
                ? { error: fieldErrors.depositPolicy }
                : {})}
            >
              {(props) => (
                <Select
                  {...props}
                  name="depositPolicy"
                  value={draft.depositPolicy}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      depositPolicy: event.target.value,
                    }))
                  }
                >
                  <option value="">Not configured yet</option>
                  {DEPOSIT_POLICIES.map((policy) => (
                    <option key={policy} value={policy}>
                      {DEPOSIT_POLICY_LABELS[policy]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              id="settings-overpayment"
              label="Overpayment policy"
              className="sm:col-span-2"
              {...(fieldErrors.overpaymentPolicy
                ? { error: fieldErrors.overpaymentPolicy }
                : {})}
            >
              {(props) => (
                <Select
                  {...props}
                  name="overpaymentPolicy"
                  value={draft.overpaymentPolicy}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      overpaymentPolicy: event.target.value,
                    }))
                  }
                >
                  <option value="">Not configured yet</option>
                  {OVERPAYMENT_POLICIES.map((policy) => (
                    <option key={policy} value={policy}>
                      {OVERPAYMENT_POLICY_LABELS[policy]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </SettingsRow>

          <SettingsRow
            title="Document numbering"
            description="Uppercase prefixes prepended to generated invoices and official payment receipts."
          >
            <Field
              id="settings-invoice-prefix"
              label="Invoice number prefix"
              description="2–12 uppercase letters, numbers, or hyphens."
              {...(fieldErrors.invoicePrefix
                ? { error: fieldErrors.invoicePrefix }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="invoicePrefix"
                  value={draft.invoicePrefix}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      invoicePrefix: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="INV-"
                />
              )}
            </Field>

            <Field
              id="settings-receipt-prefix"
              label="Receipt number prefix"
              description="2–12 uppercase letters, numbers, or hyphens."
              {...(fieldErrors.receiptPrefix
                ? { error: fieldErrors.receiptPrefix }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="receiptPrefix"
                  value={draft.receiptPrefix}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      receiptPrefix: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="RCP-"
                />
              )}
            </Field>
          </SettingsRow>
        </section>

        <section
          hidden={activeTab !== "operations"}
          aria-hidden={activeTab !== "operations"}
          className="divide-y divide-border"
        >
          <SettingsRow
            title="Stay check-in & check-out"
            description="Default Asia/Manila daily schedule used for transient check-ins and turnovers."
          >
            <Field
              id="settings-checkin-time"
              label="Standard check-in time (Asia/Manila)"
              description="24-hour HH:MM (e.g. 14:00)."
              {...(fieldErrors.checkInTimeManila
                ? { error: fieldErrors.checkInTimeManila }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="checkInTimeManila"
                  value={draft.checkInTimeManila}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      checkInTimeManila: event.target.value,
                    }))
                  }
                  placeholder="14:00"
                />
              )}
            </Field>

            <Field
              id="settings-checkout-time"
              label="Standard check-out time (Asia/Manila)"
              description="24-hour HH:MM (e.g. 12:00)."
              {...(fieldErrors.checkOutTimeManila
                ? { error: fieldErrors.checkOutTimeManila }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="checkOutTimeManila"
                  value={draft.checkOutTimeManila}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      checkOutTimeManila: event.target.value,
                    }))
                  }
                  placeholder="12:00"
                />
              )}
            </Field>
          </SettingsRow>

          <SettingsRow
            title="Offline & proof limits"
            description="Duration an encrypted browser copy can work offline plus upload size and file caps."
          >
            <Field
              id="settings-offline-days"
              label="Offline unlock period (days)"
              required
              {...(fieldErrors.offlineUnlockMaxDays
                ? { error: fieldErrors.offlineUnlockMaxDays }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="offlineUnlockMaxDays"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={30}
                  value={draft.offlineUnlockMaxDays}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      offlineUnlockMaxDays: event.target.value,
                    }))
                  }
                />
              )}
            </Field>

            <Field
              id="settings-proof-mb"
              label="Max proof size (MB)"
              required
              {...(fieldErrors.proofMaxMb
                ? { error: fieldErrors.proofMaxMb }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="proofMaxMb"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={draft.proofMaxMb}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      proofMaxMb: event.target.value,
                    }))
                  }
                />
              )}
            </Field>

            <Field
              id="settings-proof-files"
              label="Max proof files per record"
              required
              {...(fieldErrors.proofMaxFilesPerRecord
                ? { error: fieldErrors.proofMaxFilesPerRecord }
                : {})}
            >
              {(props) => (
                <Input
                  {...props}
                  name="proofMaxFilesPerRecord"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={draft.proofMaxFilesPerRecord}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      proofMaxFilesPerRecord: event.target.value,
                    }))
                  }
                />
              )}
            </Field>
          </SettingsRow>
        </section>

        {activeTab !== "devices" && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/60 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge tone={isDirty ? "warning" : "neutral"}>
                {isDirty ? "Unsaved edits" : "All changes saved"}
              </Badge>
              <span>
                Applies across all settings sections atomically online.
              </span>
            </div>
            <Button type="submit" loading={pending} disabled={pending}>
              {pending ? "Saving settings…" : "Save settings"}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
