"use client";

import { useActionState, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  saveBusinessSettingsAction,
  sendTestEmailAction,
  type SaveSettingsActionState,
} from "@/features/settings/actions";
import type {
  BusinessSettingsDto,
  TestEmailTemplate,
} from "@/features/settings/schemas";

type EmailDraft = {
  version: number;
  smtpEnabled: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpPassConfigured: boolean;
  smtpPassLast4: string | null;
  smtpFromName: string;
  smtpFromEmail: string;
};

function toEmailDraft(settings: BusinessSettingsDto): EmailDraft {
  return {
    version: settings.version,
    smtpEnabled: settings.smtpEnabled,
    smtpUser: settings.smtpUser ?? "",
    smtpPass: "",
    smtpPassConfigured: settings.smtpPassConfigured,
    smtpPassLast4: settings.smtpPassLast4,
    smtpFromName: settings.smtpFromName ?? "",
    smtpFromEmail: settings.smtpFromEmail ?? "",
  };
}

export function EmailSettingsPanel({
  initialSettings,
}: {
  initialSettings: BusinessSettingsDto;
}) {
  const [saved, setSaved] = useState<EmailDraft>(() =>
    toEmailDraft(initialSettings),
  );
  const [draft, setDraft] = useState<EmailDraft>(() =>
    toEmailDraft(initialSettings),
  );
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState(
    initialSettings.smtpUser ?? "",
  );
  const [testTemplate, setTestTemplate] =
    useState<TestEmailTemplate>("approved");
  const [testPending, setTestPending] = useState(false);
  const [testResult, setTestResult] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  const clearPassInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const isDirty =
    draft.smtpEnabled !== saved.smtpEnabled ||
    draft.smtpUser !== saved.smtpUser ||
    draft.smtpPass !== "" ||
    draft.smtpFromName !== saved.smtpFromName ||
    draft.smtpFromEmail !== saved.smtpFromEmail;

  const [actionState, formAction, pending] = useActionState<
    SaveSettingsActionState,
    FormData
  >(
    async (prev, formData) => {
      const result = await saveBusinessSettingsAction(prev, formData);
      if (result.status === "saved") {
        const next = toEmailDraft(result.settings);
        setSaved(next);
        setDraft(next);
        if (clearPassInputRef.current) {
          clearPassInputRef.current.value = "";
        }
        if (next.smtpUser && !testRecipient.trim()) {
          setTestRecipient(next.smtpUser);
        }
        toast.success(result.message);
      } else if (result.status === "error") {
        toast.error(result.message);
      }
      return result;
    },
    { status: "idle" },
  );

  const fieldErrors =
    actionState.status === "error" ? actionState.fieldErrors : {};

  function handleConfirmDisconnect() {
    setDisconnectOpen(false);
    setDraft((prev) => ({
      ...prev,
      smtpEnabled: false,
      smtpPass: "",
    }));
    if (clearPassInputRef.current) {
      clearPassInputRef.current.value = "on";
    }
    window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  }

  async function handleSendTestEmail() {
    setTestResult(null);
    setTestPending(true);
    try {
      const res = await sendTestEmailAction(testRecipient, testTemplate);
      if (res.status === "sent") {
        setTestResult({ tone: "success", message: res.message });
        toast.success(res.message);
      } else {
        setTestResult({ tone: "danger", message: res.message });
        toast.error(res.message);
      }
    } finally {
      setTestPending(false);
    }
  }

  return (
    <div className="grid gap-5">
      <form
        ref={formRef}
        action={formAction}
        noValidate
        className="overflow-clip rounded-panel border border-border bg-surface"
      >
        <input type="hidden" name="module" value="email" />
        <input type="hidden" name="expectedVersion" value={draft.version} />
        <input
          ref={clearPassInputRef}
          type="hidden"
          name="clearSmtpPass"
          defaultValue=""
        />

        {actionState.status === "error" && (
          <div className="border-b border-border p-4 sm:px-6">
            <Alert tone="danger" role="alert">
              {actionState.message}
            </Alert>
          </div>
        )}

        <div className="divide-y divide-border">
          {/* Email delivery */}
          <div className="grid grid-cols-1 gap-4 p-4 sm:gap-5 sm:p-6 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:gap-10">
            <div className="grid content-start gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Email delivery
                </h2>
                <Badge
                  tone={
                    saved.smtpEnabled && saved.smtpPassConfigured
                      ? "success"
                      : "neutral"
                  }
                >
                  {saved.smtpEnabled && saved.smtpPassConfigured
                    ? "Active"
                    : "Off"}
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Send automatic booking request and confirmation emails through
                Gmail.
              </p>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-1">
                <Checkbox
                  id="settings-smtp-enabled"
                  name="smtpEnabled"
                  checked={draft.smtpEnabled}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      smtpEnabled: event.target.checked,
                    }))
                  }
                  label="Turn on automatic booking emails"
                  disabled={pending}
                />
                <p className="pl-7 text-xs leading-5 text-muted-foreground">
                  Guests receive a pending email when they submit a request and
                  a confirmation email once you approve it.
                </p>
              </div>

              <p className="rounded-control border border-border bg-surface-muted/45 p-3.5 text-xs leading-5 text-muted-foreground">
                <strong className="font-medium text-foreground">
                  Gmail setup:
                </strong>{" "}
                Turn on 2-Step Verification in your Google Account, create a
                16-character App Password, and paste it below.
              </p>
            </div>
          </div>

          {/* Account Login */}
          <div className="grid grid-cols-1 gap-4 p-4 sm:gap-5 sm:p-6 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:gap-10">
            <div className="grid content-start gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Google Account login
                </h2>
                {saved.smtpPassConfigured && (
                  <Badge tone="success">
                    Password saved{" "}
                    {saved.smtpPassLast4 ? `••••${saved.smtpPassLast4}` : ""}
                  </Badge>
                )}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Your app password is stored securely and never shown again after
                saving.
              </p>
            </div>

            <div className="grid gap-4">
              <Field
                id="settings-smtp-user"
                label="Gmail address"
                description="The Google Account used to send booking confirmation emails."
                error={fieldErrors.smtpUser}
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="email"
                    name="smtpUser"
                    value={draft.smtpUser}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        smtpUser: event.target.value,
                      }))
                    }
                    placeholder="yourproperty@gmail.com"
                    autoComplete="off"
                    disabled={pending}
                  />
                )}
              </Field>

              <Field
                id="settings-smtp-pass"
                label="Google App Password"
                description={
                  saved.smtpPassConfigured
                    ? "Leave blank to keep your saved password, or paste a new one to replace it."
                    : "Paste your 16-character Google App Password."
                }
                error={fieldErrors.smtpPass}
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="password"
                    name="smtpPass"
                    value={draft.smtpPass}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        smtpPass: event.target.value,
                      }))
                    }
                    placeholder={
                      saved.smtpPassConfigured
                        ? "Saved password (leave blank to keep)"
                        : "xxxx xxxx xxxx xxxx"
                    }
                    autoComplete="new-password"
                    disabled={pending}
                  />
                )}
              </Field>

              {saved.smtpPassConfigured && (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="text-danger"
                    disabled={pending}
                    onClick={() => setDisconnectOpen(true)}
                  >
                    Disconnect email
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Sender Display */}
          <div className="grid grid-cols-1 gap-4 p-4 sm:gap-5 sm:p-6 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:gap-10">
            <div className="grid content-start gap-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Sender display
              </h2>
              <p className="text-xs leading-5 text-muted-foreground">
                Optional name and sender address shown in the guest&apos;s
                inbox.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="settings-smtp-from-name"
                label="Sender name (optional)"
                description="Defaults to your property name if left blank."
                error={fieldErrors.smtpFromName}
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    name="smtpFromName"
                    value={draft.smtpFromName}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        smtpFromName: event.target.value,
                      }))
                    }
                    placeholder={
                      initialSettings.businessName || "Daisy Residences"
                    }
                    disabled={pending}
                  />
                )}
              </Field>

              <Field
                id="settings-smtp-from-email"
                label="From email (optional)"
                description="Defaults to your Gmail address above."
                error={fieldErrors.smtpFromEmail}
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="email"
                    name="smtpFromEmail"
                    value={draft.smtpFromEmail}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        smtpFromEmail: event.target.value,
                      }))
                    }
                    placeholder={draft.smtpUser || "yourproperty@gmail.com"}
                    disabled={pending}
                  />
                )}
              </Field>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_20px_-14px_rgb(34_34_34/0.16)] sm:static sm:px-6 sm:py-4 sm:shadow-none">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge tone={isDirty ? "warning" : "neutral"}>
              {isDirty ? "Unsaved changes" : "Saved"}
            </Badge>
            <span>Saves right away.</span>
          </div>

          <Button
            type="submit"
            size="md"
            loading={pending}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? "Saving…" : "Save email settings"}
          </Button>
        </div>
      </form>

      {/* Test Email Card */}
      <section className="rounded-panel border border-border bg-surface p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:gap-10">
          <div className="grid content-start gap-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Send a test email
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              Save your Gmail settings above first, then send yourself a quick
              test message to make sure delivery works.
            </p>
          </div>

          <div className="grid gap-3">
            {testResult && (
              <Alert tone={testResult.tone} role="status">
                {testResult.message}
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="settings-smtp-test-template" label="Email template">
                {(fieldProps) => (
                  <Select
                    {...fieldProps}
                    value={testTemplate}
                    onChange={(event) =>
                      setTestTemplate(event.target.value as TestEmailTemplate)
                    }
                    disabled={testPending}
                  >
                    <option value="pending">Booking request (Pending)</option>
                    <option value="approved">
                      Booking confirmed (Approved)
                    </option>
                  </Select>
                )}
              </Field>

              <Field id="settings-smtp-test-recipient" label="Send test to">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="email"
                    value={testRecipient}
                    onChange={(event) => setTestRecipient(event.target.value)}
                    placeholder="you@gmail.com"
                    disabled={testPending}
                  />
                )}
              </Field>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="md"
                loading={testPending}
                disabled={testPending || !testRecipient.trim()}
                onClick={() => void handleSendTestEmail()}
                className="w-full sm:w-auto"
              >
                {testPending ? "Sending…" : "Send test email"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={handleConfirmDisconnect}
        title="Disconnect Gmail account?"
        description="This removes your saved Google App Password and turns off automatic booking confirmation emails until you add a new password."
        confirmLabel="Disconnect email"
        confirmVariant="danger"
      />
    </div>
  );
}
