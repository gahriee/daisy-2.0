"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  PropertyAddressAutocompleteInput,
  PropertyMapPinPicker,
} from "@/components/ui/property-map-pin";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";
import { toast } from "@/components/ui/toaster";
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
  type SettingsModule,
} from "@/features/settings/schemas";
import {
  DEFAULT_OVERDUE_SMS_TEMPLATE,
  estimateSmsSegments,
  OVERDUE_SMS_TEMPLATE_VARIABLES,
  renderOverdueSmsTemplate,
} from "@/features/sms/schemas";
import { sendTestOverdueSmsAction } from "@/features/sms/actions";

export type SettingsSectionKey = SettingsModule | "devices";
type BusinessSettingsFormSection = Exclude<
  SettingsModule,
  "house_rules" | "email"
>;

type DraftState = {
  version: number;
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  businessLatitude: string;
  businessLongitude: string;
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
  transientPolicyNote: string;
  offlineUnlockMaxDays: string;
  proofMaxMb: string;
  proofMaxFilesPerRecord: string;
  smsOverdueEnabled: boolean;
  smsOverdueFrequencyDays: string;
  smsOverdueSendTimeManila: string;
  smsApiKey: string;
  smsApiKeyConfigured: boolean;
  smsApiKeyLast4: string | null;
  smsSenderName: string;
  smsOverdueTemplate: string;
  policiesComplete: boolean;
  stayScheduleComplete: boolean;
};

const MODULE_DRAFT_KEYS: Record<
  BusinessSettingsFormSection,
  readonly (keyof DraftState)[]
> = {
  profile: [
    "businessName",
    "businessPhone",
    "businessAddress",
    "businessLatitude",
    "businessLongitude",
    "tin",
  ],
  policies: [
    "billingDayOfMonth",
    "gracePeriodDays",
    "prorationPolicy",
    "depositPolicy",
    "overpaymentPolicy",
    "invoicePrefix",
    "receiptPrefix",
  ],
  operations: [
    "checkInTimeManila",
    "checkOutTimeManila",
    "offlineUnlockMaxDays",
    "proofMaxMb",
    "proofMaxFilesPerRecord",
  ],
  sms: [
    "smsOverdueEnabled",
    "smsOverdueFrequencyDays",
    "smsOverdueSendTimeManila",
    "smsApiKey",
    "smsSenderName",
    "smsOverdueTemplate",
  ],
};

const MODULE_META: Record<
  BusinessSettingsFormSection,
  {
    dirtyLabel: string;
    cleanLabel: string;
    footerHint: string;
    submitLabel: string;
    pendingLabel: string;
  }
> = {
  profile: {
    dirtyLabel: "Unsaved profile edits",
    cleanLabel: "Profile saved",
    footerHint: "Saves property profile independently online.",
    submitLabel: "Save property profile",
    pendingLabel: "Saving profile…",
  },
  policies: {
    dirtyLabel: "Unsaved policy edits",
    cleanLabel: "Policies saved",
    footerHint: "Saves billing & policies independently online.",
    submitLabel: "Save billing & policies",
    pendingLabel: "Saving policies…",
  },
  operations: {
    dirtyLabel: "Unsaved stays & limits edits",
    cleanLabel: "Stays & limits saved",
    footerHint: "Saves stays & limits independently online.",
    submitLabel: "Save stays & limits",
    pendingLabel: "Saving stays & limits…",
  },
  sms: {
    dirtyLabel: "Unsaved changes",
    cleanLabel: "Saved",
    footerHint: "Saves right away.",
    submitLabel: "Save SMS settings",
    pendingLabel: "Saving…",
  },
};

function mergeSavedModule(
  prevDraft: DraftState,
  savedDraft: DraftState,
  settingsModule: BusinessSettingsFormSection,
): DraftState {
  const next: DraftState = {
    ...prevDraft,
    version: savedDraft.version,
    policiesComplete: savedDraft.policiesComplete,
    stayScheduleComplete: savedDraft.stayScheduleComplete,
    smsApiKeyConfigured: savedDraft.smsApiKeyConfigured,
    smsApiKeyLast4: savedDraft.smsApiKeyLast4,
  };
  for (const key of MODULE_DRAFT_KEYS[settingsModule]) {
    (next[key] as DraftState[typeof key]) = savedDraft[key];
  }
  return next;
}

function isModuleDirty(
  draft: DraftState,
  savedSnapshot: DraftState,
  settingsModule: BusinessSettingsFormSection,
): boolean {
  return MODULE_DRAFT_KEYS[settingsModule].some(
    (key) => draft[key] !== savedSnapshot[key],
  );
}

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
  transientPolicyNote: "settings-house-rules",
  offlineUnlockMaxDays: "settings-offline-days",
  proofMaxMb: "settings-proof-mb",
  proofMaxFilesPerRecord: "settings-proof-files",
  smsOverdueEnabled: "settings-sms-enabled",
  smsOverdueFrequencyDays: "settings-sms-frequency-days",
  smsOverdueSendTimeManila: "settings-sms-send-time",
  smsApiKey: "settings-sms-api-key",
  smsSenderName: "settings-sms-sender-name",
  smsOverdueTemplate: "settings-sms-template",
};

function toDraft(settings: BusinessSettingsDto): DraftState {
  return {
    version: settings.version,
    businessName: settings.businessName,
    businessPhone: settings.businessPhone ?? "",
    businessAddress: settings.businessAddress ?? "",
    businessLatitude:
      settings.businessLatitude !== null
        ? String(settings.businessLatitude)
        : "",
    businessLongitude:
      settings.businessLongitude !== null
        ? String(settings.businessLongitude)
        : "",
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
    transientPolicyNote: settings.transientPolicyNote ?? "",
    offlineUnlockMaxDays: String(settings.offlineUnlockMaxDays),
    proofMaxMb: String(Math.round(settings.proofMaxBytes / (1024 * 1024))),
    proofMaxFilesPerRecord: String(settings.proofMaxFilesPerRecord),
    smsOverdueEnabled: settings.smsOverdueEnabled,
    smsOverdueFrequencyDays: String(settings.smsOverdueFrequencyDays),
    smsOverdueSendTimeManila: settings.smsOverdueSendTimeManila,
    smsApiKey: "",
    smsApiKeyConfigured: settings.smsApiKeyConfigured,
    smsApiKeyLast4: settings.smsApiKeyLast4,
    smsSenderName: settings.smsSenderName ?? "",
    smsOverdueTemplate: settings.smsOverdueTemplate ?? "",
    policiesComplete: settings.policiesComplete,
    stayScheduleComplete: settings.stayScheduleComplete,
  };
}

function SettingsRow({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:gap-5 sm:p-6 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:gap-10">
      <div className="grid content-start gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {badge}
        </div>
        {description && (
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

function SettingsModulePanel({
  settingsModule,
  draft,
  savedSnapshot,
  banner,
  onModuleSaved,
  onDiscard,
  children,
}: {
  settingsModule: BusinessSettingsFormSection;
  draft: DraftState;
  savedSnapshot: DraftState;
  banner?: ReactNode;
  onModuleSaved: (saved: BusinessSettingsDto) => void;
  onDiscard: () => void;
  children: (fieldErrors: Record<string, string>) => ReactNode;
}) {
  const dirty = isModuleDirty(draft, savedSnapshot, settingsModule);
  const meta = MODULE_META[settingsModule];

  const [state, formAction, pending] = useActionState<
    SaveSettingsActionState,
    FormData
  >(
    async (prev, formData) => {
      const next = await saveBusinessSettingsAction(prev, formData);
      if (next.status === "saved") {
        toast.success(next.message);
        onModuleSaved(next.settings);
      } else if (next.status === "error") {
        const firstField = Object.keys(next.fieldErrors)[0];
        if (firstField) {
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

  return (
    <form action={formAction} noValidate className="grid gap-5">
      <input type="hidden" name="module" value={settingsModule} />
      <input
        type="hidden"
        name="expectedVersion"
        value={savedSnapshot.version}
      />

      {banner}

      {state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}

      <div className="overflow-clip rounded-panel border border-border bg-surface">
        <section className="divide-y divide-border">
          {children(fieldErrors)}
        </section>

        <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-border bg-surface px-4 pt-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-8px_20px_-14px_rgb(34_34_34/0.16)] sm:static sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:bg-background/60 sm:px-6 sm:py-4 sm:shadow-none">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge tone={dirty ? "warning" : "neutral"}>
              {dirty ? meta.dirtyLabel : meta.cleanLabel}
            </Badge>
            <span>{meta.footerHint}</span>
          </div>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={onDiscard}
                className="w-full sm:w-auto"
              >
                Discard changes
              </Button>
            )}
            <Button
              type="submit"
              loading={pending}
              disabled={pending}
              className="w-full sm:w-auto"
            >
              {pending ? meta.pendingLabel : meta.submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

/**
 * Independent, version-checked Settings module form rendered on its dedicated
 * page route (Profile, Billing & policies, or Stays & limits).
 */
export function BusinessSettingsForm({
  initialSettings,
  activeSection,
  onSaved,
}: {
  initialSettings: BusinessSettingsDto;
  activeSection: BusinessSettingsFormSection;
  onSaved?: (settings: BusinessSettingsDto) => void;
}) {
  const [savedSnapshot, setSavedSnapshot] = useState<DraftState>(() =>
    toDraft(initialSettings),
  );
  const [draft, setDraft] = useState<DraftState>(() =>
    toDraft(initialSettings),
  );
  const [showSmsApiKey, setShowSmsApiKey] = useState(false);
  const [testSmsPhone, setTestSmsPhone] = useState(
    () => initialSettings.businessPhone ?? "",
  );
  const [testSmsSending, setTestSmsSending] = useState(false);
  const [testSmsError, setTestSmsError] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const smsTemplateRef = useRef<HTMLTextAreaElement | null>(null);

  function handleModuleSaved(saved: BusinessSettingsDto) {
    const nextSaved = toDraft(saved);
    setSavedSnapshot(nextSaved);
    setDraft((prev) => mergeSavedModule(prev, nextSaved, activeSection));
    onSaved?.(saved);
  }

  function handleDiscardModule() {
    setDraft((prev) => mergeSavedModule(prev, savedSnapshot, activeSection));
    if (activeSection === "sms") {
      setShowSmsApiKey(false);
    }
  }

  const missingPoliciesBanner = !savedSnapshot.policiesComplete ? (
    <Alert tone="warning" title="Required before billing or payments">
      Configure billing day, grace period, proration policy, deposit policy,
      overpayment policy, invoice prefix, and receipt prefix. No financial
      policy has an implicit default.
    </Alert>
  ) : null;

  const missingStayScheduleBanner = !savedSnapshot.stayScheduleComplete ? (
    <Alert tone="warning" title="Stay schedule incomplete">
      Configure standard check-in and check-out times for transient check-ins
      and turnovers.
    </Alert>
  ) : null;

  if (activeSection === "profile") {
    return (
      <SettingsModulePanel
        settingsModule="profile"
        draft={draft}
        savedSnapshot={savedSnapshot}
        onModuleSaved={handleModuleSaved}
        onDiscard={handleDiscardModule}
      >
        {(fieldErrors) => (
          <>
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
                description="Linked with the map pin below: typing an address moves the pin, and pinning on the map fills this address."
                className="sm:col-span-2"
                {...(fieldErrors.businessAddress
                  ? { error: fieldErrors.businessAddress }
                  : {})}
              >
                {(props) => (
                  <PropertyAddressAutocompleteInput
                    {...props}
                    name="businessAddress"
                    value={draft.businessAddress}
                    onValueChange={(nextAddress) =>
                      setDraft((prev) => ({
                        ...prev,
                        businessAddress: nextAddress,
                      }))
                    }
                    onCoordinatesResolved={({ address, latitude, longitude }) =>
                      setDraft((prev) => ({
                        ...prev,
                        ...(address ? { businessAddress: address } : {}),
                        businessLatitude: String(latitude),
                        businessLongitude: String(longitude),
                      }))
                    }
                    placeholder="Start typing street, barangay, or city, or pin on the map below…"
                    autoComplete="street-address"
                  />
                )}
              </Field>

              <input
                type="hidden"
                name="businessLatitude"
                value={draft.businessLatitude}
              />
              <input
                type="hidden"
                name="businessLongitude"
                value={draft.businessLongitude}
              />
              <PropertyMapPinPicker
                latitude={
                  draft.businessLatitude.trim() !== ""
                    ? Number(draft.businessLatitude)
                    : null
                }
                longitude={
                  draft.businessLongitude.trim() !== ""
                    ? Number(draft.businessLongitude)
                    : null
                }
                addressQuery={draft.businessAddress}
                onChange={({ latitude, longitude, resolvedAddress }) =>
                  setDraft((prev) => ({
                    ...prev,
                    ...(resolvedAddress
                      ? { businessAddress: resolvedAddress }
                      : {}),
                    businessLatitude: latitude !== null ? String(latitude) : "",
                    businessLongitude:
                      longitude !== null ? String(longitude) : "",
                  }))
                }
              />
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
          </>
        )}
      </SettingsModulePanel>
    );
  }

  if (activeSection === "policies") {
    return (
      <SettingsModulePanel
        settingsModule="policies"
        draft={draft}
        savedSnapshot={savedSnapshot}
        banner={missingPoliciesBanner}
        onModuleSaved={handleModuleSaved}
        onDiscard={handleDiscardModule}
      >
        {(fieldErrors) => (
          <>
            <SettingsRow
              title="Billing schedule"
              description="Monthly rent generation day and payment grace window before invoices are marked overdue."
              badge={
                <Badge
                  tone={savedSnapshot.policiesComplete ? "success" : "warning"}
                >
                  {savedSnapshot.policiesComplete
                    ? "Configured"
                    : "Action needed"}
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
              title="Billing rules"
              description="Your rules for mid-month move-ins, deposits, and extra payments."
            >
              <Field
                id="settings-proration"
                label="Partial-month rent rule"
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
          </>
        )}
      </SettingsModulePanel>
    );
  }

  if (activeSection === "sms") {
    const samplePreview = renderOverdueSmsTemplate(draft.smsOverdueTemplate, {
      tenantName: "Maria Santos",
      roomNumber: "201",
      invoiceNumber: `${savedSnapshot.invoicePrefix || "INV-"}2026-000012`,
      billingPeriod: "Nov 2026",
      dueDate: "Nov 6, 2026",
      balance: "PHP 4,500.00",
      daysOverdue: 3,
      businessName: savedSnapshot.businessName.trim() || "Daisy Residences",
    });
    const smsMetrics = estimateSmsSegments(samplePreview);

    function insertTemplateVariable(token: string) {
      const textarea = smsTemplateRef.current;
      const start = textarea?.selectionStart ?? draft.smsOverdueTemplate.length;
      const end = textarea?.selectionEnd ?? draft.smsOverdueTemplate.length;
      setDraft((prev) => {
        const current = prev.smsOverdueTemplate;
        const before = current.slice(0, start);
        const after = current.slice(end);
        const needsLeadingSpace = before.length > 0 && !/[\s(]$/.test(before);
        const needsTrailingSpace =
          after.length > 0 && !/^[\s.,!?;:)]/.test(after);
        const inserted = `${needsLeadingSpace ? " " : ""}${token}${needsTrailingSpace ? " " : ""}`;
        const nextValue = `${before}${inserted}${after}`;
        const nextCursor = before.length + inserted.length;
        requestAnimationFrame(() => {
          if (smsTemplateRef.current) {
            smsTemplateRef.current.focus();
            smsTemplateRef.current.setSelectionRange(nextCursor, nextCursor);
          }
        });
        return {
          ...prev,
          smsOverdueTemplate: nextValue,
        };
      });
    }

    async function handleSendTestSms() {
      if (testSmsSending) return;
      setTestSmsError(null);
      setTestSmsSending(true);
      try {
        const res = await sendTestOverdueSmsAction({
          phone: testSmsPhone,
          messageTemplate: draft.smsOverdueTemplate || null,
          senderName: draft.smsSenderName || null,
        });
        if (res.status === "saved") {
          toast.success(res.message);
        } else if (res.status === "error") {
          setTestSmsError(res.message);
        }
      } finally {
        setTestSmsSending(false);
      }
    }

    async function handleConfirmDisconnect() {
      if (disconnecting) return;
      setDisconnectError(null);
      setDisconnecting(true);
      try {
        const fd = new FormData();
        fd.set("module", "sms");
        fd.set("expectedVersion", String(savedSnapshot.version));
        fd.set("clearSmsApiKey", "on");
        fd.set(
          "smsOverdueFrequencyDays",
          savedSnapshot.smsOverdueFrequencyDays || "1",
        );
        fd.set(
          "smsOverdueSendTimeManila",
          savedSnapshot.smsOverdueSendTimeManila || "09:00",
        );
        fd.set("smsSenderName", savedSnapshot.smsSenderName);
        fd.set("smsOverdueTemplate", savedSnapshot.smsOverdueTemplate);

        const next = await saveBusinessSettingsAction({ status: "idle" }, fd);
        if (next.status === "saved") {
          setDisconnectOpen(false);
          setShowSmsApiKey(false);
          handleModuleSaved(next.settings);
          toast.success("Semaphore disconnected and saved API key removed.");
        } else if (next.status === "error") {
          setDisconnectError(next.message);
        }
      } finally {
        setDisconnecting(false);
      }
    }

    return (
      <>
        <SettingsModulePanel
          settingsModule="sms"
          draft={draft}
          savedSnapshot={savedSnapshot}
          onModuleSaved={(saved) => {
            setShowSmsApiKey(false);
            handleModuleSaved(saved);
          }}
          onDiscard={handleDiscardModule}
        >
          {(fieldErrors) => (
            <>
              <SettingsRow
                title="Semaphore account"
                description="Credentials and schedule for overdue rent texts."
                badge={
                  <Badge
                    tone={
                      savedSnapshot.smsOverdueEnabled &&
                      savedSnapshot.smsApiKeyConfigured
                        ? "success"
                        : savedSnapshot.smsApiKeyConfigured
                          ? "info"
                          : "neutral"
                    }
                  >
                    {savedSnapshot.smsOverdueEnabled &&
                    savedSnapshot.smsApiKeyConfigured
                      ? "Automatic on"
                      : savedSnapshot.smsApiKeyConfigured
                        ? "Manual only"
                        : "Not set up"}
                  </Badge>
                }
              >
                <div className="sm:col-span-2">
                  <Checkbox
                    id="settings-sms-enabled"
                    name="smsOverdueEnabled"
                    checked={draft.smsOverdueEnabled}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        smsOverdueEnabled: event.target.checked,
                      }))
                    }
                    label="Send automatic overdue reminders"
                  />
                </div>

                <Field
                  id="settings-sms-frequency-days"
                  label="Repeat every (days)"
                  description="1 daily, 7 weekly."
                  required
                  {...(fieldErrors.smsOverdueFrequencyDays
                    ? { error: fieldErrors.smsOverdueFrequencyDays }
                    : {})}
                >
                  {(props) => (
                    <Input
                      {...props}
                      name="smsOverdueFrequencyDays"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={30}
                      value={draft.smsOverdueFrequencyDays}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          smsOverdueFrequencyDays: event.target.value,
                        }))
                      }
                      placeholder="1"
                    />
                  )}
                </Field>

                <Field
                  id="settings-sms-send-time"
                  label="Send time"
                  required
                  {...(fieldErrors.smsOverdueSendTimeManila
                    ? { error: fieldErrors.smsOverdueSendTimeManila }
                    : {})}
                >
                  {(props) => (
                    <TimePicker
                      {...props}
                      name="smsOverdueSendTimeManila"
                      value={draft.smsOverdueSendTimeManila}
                      onValueChange={(next) =>
                        setDraft((prev) => ({
                          ...prev,
                          smsOverdueSendTimeManila: next,
                        }))
                      }
                    />
                  )}
                </Field>

                <Field
                  id="settings-sms-api-key"
                  label="Semaphore API key"
                  description={
                    savedSnapshot.smsApiKeyConfigured
                      ? "Leave blank to keep saved key."
                      : "From your Semaphore dashboard."
                  }
                  {...(fieldErrors.smsApiKey
                    ? { error: fieldErrors.smsApiKey }
                    : {})}
                >
                  {(props) => (
                    <div className="relative">
                      <Input
                        {...props}
                        name="smsApiKey"
                        type={showSmsApiKey ? "text" : "password"}
                        autoComplete="off"
                        spellCheck={false}
                        value={draft.smsApiKey}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            smsApiKey: event.target.value,
                          }))
                        }
                        placeholder={
                          savedSnapshot.smsApiKeyConfigured
                            ? `••••••••${savedSnapshot.smsApiKeyLast4 ?? ""}`
                            : "Paste your Semaphore API key"
                        }
                        className="pr-16"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmsApiKey((prev) => !prev)}
                        aria-pressed={showSmsApiKey}
                        className="absolute inset-y-0 right-0 inline-flex min-w-14 cursor-pointer items-center justify-center rounded-r-control px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showSmsApiKey ? "Hide" : "Show"}
                      </button>
                    </div>
                  )}
                </Field>

                <Field
                  id="settings-sms-sender-name"
                  label="Sender name (optional)"
                  description="Up to 11 characters, no spaces."
                  {...(fieldErrors.smsSenderName
                    ? { error: fieldErrors.smsSenderName }
                    : {})}
                >
                  {(props) => (
                    <Input
                      {...props}
                      name="smsSenderName"
                      maxLength={11}
                      value={draft.smsSenderName}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          smsSenderName: event.target.value,
                        }))
                      }
                      placeholder="e.g. DAISYBH"
                    />
                  )}
                </Field>

                {savedSnapshot.smsApiKeyConfigured && (
                  <div className="flex flex-col items-start justify-between gap-2.5 border-t border-border pt-3 sm:col-span-2 sm:flex-row sm:items-center">
                    <p className="text-xs leading-5 text-muted-foreground">
                      Removes saved key and stops automatic texts.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="text-danger"
                      disabled={disconnecting}
                      onClick={() => {
                        setDisconnectError(null);
                        setDisconnectOpen(true);
                      }}
                    >
                      Disconnect Semaphore
                    </Button>
                  </div>
                )}
              </SettingsRow>

              <SettingsRow
                title="Reminder message"
                description={
                  'Leave blank for default. Don\u2019t start with "TEST".'
                }
              >
                <div className="grid gap-3 sm:col-span-2">
                  <Field
                    id="settings-sms-template"
                    label="Message text"
                    {...(fieldErrors.smsOverdueTemplate
                      ? { error: fieldErrors.smsOverdueTemplate }
                      : {})}
                  >
                    {(props) => (
                      <Textarea
                        {...props}
                        ref={smsTemplateRef}
                        name="smsOverdueTemplate"
                        rows={3}
                        maxLength={480}
                        value={draft.smsOverdueTemplate}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            smsOverdueTemplate: event.target.value,
                          }))
                        }
                        placeholder="Leave blank for default reminder"
                      />
                    )}
                  </Field>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Insert detail
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            smsOverdueTemplate:
                              prev.smsOverdueTemplate === ""
                                ? DEFAULT_OVERDUE_SMS_TEMPLATE
                                : "",
                          }))
                        }
                      >
                        {draft.smsOverdueTemplate === ""
                          ? "Load default"
                          : "Clear"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {OVERDUE_SMS_TEMPLATE_VARIABLES.map((variable) => (
                        <Button
                          key={variable.token}
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => insertTemplateVariable(variable.token)}
                        >
                          + {variable.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-1.5 border-t border-border pt-3 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Preview
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {smsMetrics.length} chars, {smsMetrics.segments}{" "}
                      {smsMetrics.segments === 1 ? "credit" : "credits"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {samplePreview}
                  </p>
                </div>
              </SettingsRow>

              <SettingsRow
                title="Test SMS"
                description="Send the preview to your phone."
              >
                {testSmsError && (
                  <div className="sm:col-span-2">
                    <Alert tone="danger" role="alert">
                      {testSmsError}
                    </Alert>
                  </div>
                )}

                <Field
                  id="settings-sms-test-phone"
                  label="Mobile number"
                  {...(!savedSnapshot.smsApiKeyConfigured
                    ? { description: "Save an API key first." }
                    : {})}
                  className="sm:col-span-2"
                >
                  {(props) => (
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                      <Input
                        {...props}
                        type="tel"
                        inputMode="tel"
                        value={testSmsPhone}
                        onChange={(event) => {
                          setTestSmsPhone(event.target.value);
                          if (testSmsError) setTestSmsError(null);
                        }}
                        placeholder="0917 123 4567"
                        className="min-w-0 sm:max-w-xs sm:flex-1"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-auto"
                        loading={testSmsSending}
                        disabled={
                          testSmsSending || !savedSnapshot.smsApiKeyConfigured
                        }
                        onClick={() => void handleSendTestSms()}
                      >
                        {testSmsSending ? "Sending…" : "Send test"}
                      </Button>
                    </div>
                  )}
                </Field>
              </SettingsRow>
            </>
          )}
        </SettingsModulePanel>

        <ConfirmDialog
          open={disconnectOpen}
          onClose={() => {
            if (disconnecting) return;
            setDisconnectError(null);
            setDisconnectOpen(false);
          }}
          onConfirm={() => void handleConfirmDisconnect()}
          title="Disconnect Semaphore?"
          description="Deletes your saved API key and turns off automatic reminders. Your message and schedule stay saved."
          errorMessage={disconnectError}
          confirmLabel="Disconnect Semaphore"
          confirmVariant="danger"
          loading={disconnecting}
        />
      </>
    );
  }

  return (
    <SettingsModulePanel
      settingsModule="operations"
      draft={draft}
      savedSnapshot={savedSnapshot}
      banner={missingStayScheduleBanner}
      onModuleSaved={handleModuleSaved}
      onDiscard={handleDiscardModule}
    >
      {(fieldErrors) => (
        <>
          <SettingsRow
            title="Stay check-in & check-out"
            description="Default daily schedule used for transient check-ins and turnovers."
            badge={
              <Badge
                tone={
                  savedSnapshot.stayScheduleComplete ? "success" : "warning"
                }
              >
                {savedSnapshot.stayScheduleComplete
                  ? "Configured"
                  : "Action needed"}
              </Badge>
            }
          >
            <Field
              id="settings-checkin-time"
              label="Standard check-in time"
              description="Default time guests can check in."
              {...(fieldErrors.checkInTimeManila
                ? { error: fieldErrors.checkInTimeManila }
                : {})}
            >
              {(props) => (
                <TimePicker
                  {...props}
                  name="checkInTimeManila"
                  value={draft.checkInTimeManila}
                  onValueChange={(next) =>
                    setDraft((prev) => ({
                      ...prev,
                      checkInTimeManila: next,
                    }))
                  }
                  placeholder="Select check-in time"
                />
              )}
            </Field>

            <Field
              id="settings-checkout-time"
              label="Standard check-out time"
              description="Default time guests should check out."
              {...(fieldErrors.checkOutTimeManila
                ? { error: fieldErrors.checkOutTimeManila }
                : {})}
            >
              {(props) => (
                <TimePicker
                  {...props}
                  name="checkOutTimeManila"
                  value={draft.checkOutTimeManila}
                  onValueChange={(next) =>
                    setDraft((prev) => ({
                      ...prev,
                      checkOutTimeManila: next,
                    }))
                  }
                  placeholder="Select check-out time"
                />
              )}
            </Field>
          </SettingsRow>

          <SettingsRow
            title="Offline & photo limits"
            description="How long offline records stay open on this device plus photo file size and upload limits."
          >
            <Field
              id="settings-offline-days"
              label="Days offline access stays active"
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
        </>
      )}
    </SettingsModulePanel>
  );
}
