"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  PropertyAddressAutocompleteInput,
  PropertyMapPinPicker,
} from "@/components/ui/property-map-pin";
import { TimePicker } from "@/components/ui/time-picker";
import { toast } from "@/components/ui/toaster";
import {
  saveBusinessSettingsAction,
  type SaveSettingsActionState,
} from "@/features/settings/actions";
import type { BusinessSettingsDto } from "@/features/settings/schemas";

export type SettingsSectionKey = "property" | "devices";

type PropertyDraftState = {
  version: number;
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  businessLatitude: string;
  businessLongitude: string;
  tin: string;
  checkInTimeManila: string;
  checkOutTimeManila: string;
  smsConfigured: boolean;
  smsOverdueEnabled: boolean;
  smsOverdueSendTimeManila: string;
};

const EDITABLE_DRAFT_KEYS: readonly (keyof PropertyDraftState)[] = [
  "businessName",
  "businessPhone",
  "businessAddress",
  "businessLatitude",
  "businessLongitude",
  "tin",
  "checkInTimeManila",
  "checkOutTimeManila",
  "smsOverdueEnabled",
  "smsOverdueSendTimeManila",
];

const FIELD_ELEMENT_ID_MAP: Record<string, string> = {
  businessName: "settings-business-name",
  businessPhone: "settings-business-phone",
  businessAddress: "settings-business-address",
  tin: "settings-tin",
  checkInTimeManila: "settings-checkin-time",
  checkOutTimeManila: "settings-checkout-time",
  smsOverdueEnabled: "settings-sms-enabled",
  smsOverdueSendTimeManila: "settings-sms-send-time",
};

function toDraft(settings: BusinessSettingsDto): PropertyDraftState {
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
    checkInTimeManila: settings.checkInTimeManila,
    checkOutTimeManila: settings.checkOutTimeManila,
    smsConfigured: settings.smsConfigured,
    smsOverdueEnabled: settings.smsOverdueEnabled,
    smsOverdueSendTimeManila: settings.smsOverdueSendTimeManila,
  };
}

function isDraftDirty(
  draft: PropertyDraftState,
  saved: PropertyDraftState,
): boolean {
  return EDITABLE_DRAFT_KEYS.some((key) => draft[key] !== saved[key]);
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

/**
 * Single senior-friendly Settings form combining Property details, Stay
 * check-in/out times, and a simple Overdue SMS reminder toggle.
 */
export function BusinessSettingsForm({
  initialSettings,
  onSaved,
}: {
  initialSettings: BusinessSettingsDto;
  onSaved?: (settings: BusinessSettingsDto) => void;
}) {
  const [savedSnapshot, setSavedSnapshot] = useState<PropertyDraftState>(() =>
    toDraft(initialSettings),
  );
  const [draft, setDraft] = useState<PropertyDraftState>(() =>
    toDraft(initialSettings),
  );

  const dirty = isDraftDirty(draft, savedSnapshot);

  const [state, formAction, pending] = useActionState<
    SaveSettingsActionState,
    FormData
  >(
    async (prev, formData) => {
      const next = await saveBusinessSettingsAction(prev, formData);
      if (next.status === "saved") {
        const nextSaved = toDraft(next.settings);
        setSavedSnapshot(nextSaved);
        setDraft(nextSaved);
        toast.success(next.message);
        onSaved?.(next.settings);
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

  function handleDiscard() {
    setDraft(savedSnapshot);
  }

  return (
    <form action={formAction} noValidate className="grid gap-5">
      <input type="hidden" name="module" value="property" />
      <input
        type="hidden"
        name="expectedVersion"
        value={savedSnapshot.version}
      />

      {state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}

      <div className="overflow-clip rounded-panel border border-border bg-surface">
        <section className="divide-y divide-border">
          <SettingsRow
            title="Property details"
            description="Your boarding house name, phone number, address, and optional TIN shown on bills, notices, and the booking page."
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
              description="Type an address or place the pin on the map below."
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
                  placeholder="Street, barangay, or city…"
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

            <Field
              id="settings-tin"
              label="TIN (optional)"
              description="Printed on receipts and billing statements if provided."
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

          <SettingsRow
            title="Check-in & check-out times"
            description="Standard arrival and departure times for short-stay guests."
          >
            <Field
              id="settings-checkin-time"
              label="Check-in time"
              required
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
              label="Check-out time"
              required
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
            title="Automatic overdue rent texts"
            description="Send an automatic text reminder to boarders who have an unpaid overdue bill."
            badge={
              <Badge
                tone={
                  !savedSnapshot.smsConfigured
                    ? "neutral"
                    : savedSnapshot.smsOverdueEnabled
                      ? "success"
                      : "info"
                }
              >
                {!savedSnapshot.smsConfigured
                  ? "Not connected"
                  : savedSnapshot.smsOverdueEnabled
                    ? "On"
                    : "Off"}
              </Badge>
            }
          >
            {!draft.smsConfigured && (
              <div className="sm:col-span-2">
                <Alert tone="info">
                  Automatic texting is not connected yet. Ask your setup contact
                  if you want SMS reminders turned on.
                </Alert>
              </div>
            )}

            <div className="sm:col-span-2">
              <Checkbox
                id="settings-sms-enabled"
                name="smsOverdueEnabled"
                checked={draft.smsOverdueEnabled}
                disabled={pending || !draft.smsConfigured}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    smsOverdueEnabled: event.target.checked,
                  }))
                }
                label="Send automatic overdue rent reminders"
              />
            </div>

            {draft.smsConfigured ? (
              <Field
                id="settings-sms-send-time"
                label="Send time"
                description="Time of day overdue reminders go out."
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
            ) : (
              <input
                type="hidden"
                name="smsOverdueSendTimeManila"
                value={draft.smsOverdueSendTimeManila}
              />
            )}
          </SettingsRow>
        </section>

        <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-border bg-surface px-4 pt-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-8px_20px_-14px_rgb(34_34_34/0.16)] sm:static sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:bg-background/60 sm:px-6 sm:py-4 sm:shadow-none">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge tone={dirty ? "warning" : "neutral"}>
              {dirty ? "Unsaved changes" : "Saved"}
            </Badge>
            <span>Saves right away when online.</span>
          </div>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={handleDiscard}
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
              {pending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
