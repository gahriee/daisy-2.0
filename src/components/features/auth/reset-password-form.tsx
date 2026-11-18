"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { PasswordVisibilityButton } from "@/components/features/auth/password-visibility-button";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
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
        setShowPassword(false);
        setShowConfirmation(false);
        setMessage(
          "If that email matches your account, a reset code is on its way. Check your inbox and spam folder.",
        );
        requestAnimationFrame(() => code.current?.focus());
      } else {
        form.reset();
        setEmail("");
        setShowPassword(false);
        setShowConfirmation(false);
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

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-[28px] leading-8 font-semibold tracking-tight text-foreground">
          {stage === "complete"
            ? "Password updated"
            : stage === "reset"
              ? "Enter email code"
              : "Reset your password"}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {stage === "complete"
            ? "Your password is updated. Use it next time you sign in."
            : stage === "reset"
              ? `Enter the code sent to ${email} and choose a new 12–128 character password.`
              : "Enter your email and we’ll send a one-time code to set a new password."}
        </p>
      </div>

      {stage === "complete" ? (
        <div className="grid gap-5">
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
          <Link
            href="/auth/sign-in"
            className={buttonClasses({ className: "w-full" })}
          >
            Return to sign in
          </Link>
        </div>
      ) : (
        <>
          <form
            method="post"
            action="/auth/reset-password"
            noValidate
            onSubmit={submit}
            className="grid gap-5"
          >
            <div
              ref={feedback}
              tabIndex={-1}
              className="grid gap-3 rounded-control empty:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
            >
              <div aria-live="polite" className="empty:hidden">
                {message && <Alert>{message}</Alert>}
              </div>
              <div role="alert" className="empty:hidden">
                {error && (
                  <Alert role="presentation" tone="danger">
                    {error}
                    {retryAfter > 0 && (
                      <span className="mt-1 block tabular-nums">
                        Wait at least {Math.ceil(retryAfter / 60)} minute(s)
                        before trying again.
                      </span>
                    )}
                  </Alert>
                )}
              </div>
            </div>

            {stage === "request" ? (
              <Field
                id="recovery-email"
                label="Email"
                required
                description="We’ll send a one-time reset code to this address."
              >
                {(control) => (
                  <Input
                    {...control}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    maxLength={254}
                    defaultValue={email}
                    disabled={busy}
                  />
                )}
              </Field>
            ) : (
              <>
                <Field
                  id="recovery-code"
                  {...(codeError ? { error: codeError } : {})}
                  label="Email code"
                  required
                  description="Enter the code from your latest email. Codes expire and work once."
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
                  description="Use 12–128 characters."
                >
                  {(control) => (
                    <div className="relative">
                      <Input
                        {...control}
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        disabled={busy}
                        className="pr-12"
                      />
                      <PasswordVisibilityButton
                        visible={showPassword}
                        label="Show new password"
                        disabled={busy}
                        aria-controls={control.id}
                        onClick={() => setShowPassword((prev) => !prev)}
                      />
                    </div>
                  )}
                </Field>

                <Field
                  id="recovery-confirmation"
                  {...(confirmationError ? { error: confirmationError } : {})}
                  label="Confirm new password"
                  required
                >
                  {(control) => (
                    <div className="relative">
                      <Input
                        {...control}
                        name="confirmation"
                        type={showConfirmation ? "text" : "password"}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        disabled={busy}
                        className="pr-12"
                      />
                      <PasswordVisibilityButton
                        visible={showConfirmation}
                        label="Show confirmation password"
                        disabled={busy}
                        aria-controls={control.id}
                        onClick={() => setShowConfirmation((prev) => !prev)}
                      />
                    </div>
                  )}
                </Field>
              </>
            )}

            <Button type="submit" loading={busy} className="w-full">
              {busy
                ? "Please wait…"
                : stage === "request"
                  ? "Send reset code"
                  : "Set new password"}
            </Button>

            {stage === "reset" && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setStage("request");
                  setError("");
                  setMessage("");
                  setRetryAfter(0);
                }}
                className="w-full"
              >
                Use another email
              </Button>
            )}
          </form>

          <Separator />

          <p className="text-sm leading-6 text-muted-foreground">
            Remembered your password?{" "}
            <Link
              href="/auth/sign-in"
              className="font-medium text-foreground underline underline-offset-4 transition-colors duration-(--duration-control) ease-(--ease-control) hover:text-primary"
            >
              Return to sign in
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
