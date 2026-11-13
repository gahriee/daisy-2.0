"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  requestCodeSchema,
  resetPasswordSchema,
} from "@/features/auth/recovery/schemas";

type Stage = "request" | "reset" | "complete";
export function ResetPasswordForm() {
  const [stage, setStage] = useState<Stage>("request");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [confirmationError, setConfirmationError] = useState("");
  const [codeError, setCodeError] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  const code = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    setMessage("");
    setRetryAfter(0);
    setConfirmationError("");
    setCodeError("");
    const enteredEmail = String(data.get("email") ?? email)
      .trim()
      .toLowerCase();
    const password = String(data.get("password") ?? "");
    const otp = String(data.get("otp") ?? "").trim();
    const parsed =
      stage === "request"
        ? requestCodeSchema.safeParse({ email: enteredEmail })
        : resetPasswordSchema.safeParse({ email: enteredEmail, otp, password });
    if (stage === "reset" && password !== data.get("confirmation")) {
      setConfirmationError("The passwords do not match.");
      form.querySelector<HTMLInputElement>('[name="confirmation"]')?.focus();
      return;
    }
    if (!parsed.success) {
      setError(
        stage === "request"
          ? "Enter a valid email address."
          : "Check the code and use matching passwords of 12–128 characters.",
      );
      feedback.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/auth/recovery/${stage === "request" ? "request" : "reset"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const text =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Recovery is unavailable. Try again shortly.";
        setError(text);
        if (response.status === 429)
          setRetryAfter(
            Math.max(1, Number(response.headers.get("retry-after")) || 60),
          );
        if (response.status === 400 && stage === "reset") {
          setCodeError(text);
          code.current?.focus();
        } else {
          feedback.current?.focus();
        }
        return;
      }
      if (stage === "request") {
        setEmail(enteredEmail);
        setStage("reset");
        setMessage(
          "If this is the Owner’s email, a code is on its way. Check your inbox and spam folder.",
        );
        requestAnimationFrame(() => code.current?.focus());
      } else {
        form.reset();
        setEmail("");
        setStage("complete");
        requestAnimationFrame(() => feedback.current?.focus());
      }
    } catch {
      setError(
        stage === "reset"
          ? "The connection was interrupted. Your password may have changed. Try signing in before resetting again."
          : "The request could not be confirmed. Check your connection before trying again.",
      );
      feedback.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (stage === "complete")
    return (
      <div className="grid gap-6">
        <div
          ref={feedback}
          tabIndex={-1}
          className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <Alert tone="success">
            Your password was updated. Use your new password the next time you
            sign in.
          </Alert>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          This page has cleared your email, code and password. Close it when
          you’re finished.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-medium text-primary underline"
        >
          Return to Daisy
        </Link>
      </div>
    );

  return (
    <form
      method="post"
      action="/auth/reset-password"
      onSubmit={submit}
      className="grid gap-6"
    >
      <div
        ref={feedback}
        tabIndex={-1}
        className="grid gap-3 rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
      >
        <div aria-live="polite">{message && <Alert>{message}</Alert>}</div>
        <div role="alert">
          {error && (
            <Alert role="presentation" tone="danger">
              {error}
              {retryAfter > 0 && (
                <span className="block">
                  Wait at least {Math.ceil(retryAfter / 60)} minute(s) before
                  trying again.
                </span>
              )}
            </Alert>
          )}
        </div>
      </div>
      {stage === "request" ? (
        <Field
          id="recovery-email"
          label="Owner email"
          required
          description="Use the email address on your existing Owner account."
        >
          {(control) => (
            <Input
              {...control}
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              defaultValue={email}
              disabled={busy}
            />
          )}
        </Field>
      ) : (
        <>
          <p className="break-words text-sm text-muted-foreground">
            Code requested for{" "}
            <span className="font-medium text-foreground">{email}</span>
          </p>
          <Field
            id="recovery-code"
            {...(codeError ? { error: codeError } : {})}
            label="Email code"
            required
            description="Enter the code from your latest email. Codes expire and can only be used once."
          >
            {(control) => (
              <Input
                {...control}
                ref={code}
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                minLength={6}
                maxLength={10}
                disabled={busy}
              />
            )}
          </Field>
          <Field
            id="recovery-password"
            label="New password"
            required
            description="Use 12–128 characters. A long, unique passphrase works well."
          >
            {(control) => (
              <Input
                {...control}
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                disabled={busy}
              />
            )}
          </Field>
          <Field
            id="recovery-confirmation"
            {...(confirmationError ? { error: confirmationError } : {})}
            label="Confirm new password"
            required
          >
            {(control) => (
              <Input
                {...control}
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                disabled={busy}
              />
            )}
          </Field>
        </>
      )}
      <Button type="submit" loading={busy}>
        {busy
          ? "Please wait…"
          : stage === "request"
            ? "Send reset code"
            : "Set new password"}
      </Button>
      {stage === "reset" && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setStage("request");
            setError("");
            setMessage("");
            setRetryAfter(0);
          }}
        >
          Use another email or request a new code
        </Button>
      )}
      <p className="text-sm leading-6 text-muted-foreground">
        An internet connection is required. Codes and passwords stay out of
        local storage and the sync queue.
      </p>
    </form>
  );
}
