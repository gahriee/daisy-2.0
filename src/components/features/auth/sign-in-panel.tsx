"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PasswordVisibilityButton } from "@/components/features/auth/password-visibility-button";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  formatRetryWaitMessage,
  parseRetryAfterSeconds,
} from "@/features/auth/sign-in/retry-after";
import {
  signInSchema,
  type AuthSessionState,
} from "@/features/auth/sign-in/schemas";

function subscribeOnlineStatus(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function getOnlineServerSnapshot() {
  return true;
}

async function readSessionState(): Promise<AuthSessionState> {
  const response = await fetch("/api/auth/get-session", {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return "unavailable";
  const payload: unknown = await response.json().catch(() => null);
  if (
    payload &&
    typeof payload === "object" &&
    "authenticated" in payload &&
    typeof payload.authenticated === "boolean"
  ) {
    return payload.authenticated ? "authenticated" : "unauthenticated";
  }
  return "unavailable";
}

type SignInPanelProps = {
  initialSession: AuthSessionState;
};

export function SignInPanel({ initialSession }: SignInPanelProps) {
  const router = useRouter();
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const [sessionState, setSessionState] =
    useState<AuthSessionState>(initialSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "sign-in" | "sign-out" | "recheck" | null
  >(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const feedbackRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const busy = busyAction !== null;

  function focusFeedback() {
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  function clearFormState() {
    setPassword("");
    setEmail("");
    setShowPassword(false);
    setEmailError("");
    setPasswordError("");
  }

  async function handleRecheck() {
    if (busy) return;
    setError("");
    setNotice("");
    setRetryAfter(null);
    setBusyAction("recheck");
    try {
      const next = await readSessionState();
      setSessionState(next);
      if (next === "authenticated") {
        clearFormState();
        setNotice("Session confirmed. Opening your dashboard…");
        router.replace("/");
        router.refresh();
        return;
      } else if (next === "unauthenticated") {
        setNotice("No active session found. Sign in below.");
      } else {
        setError(
          "Session check could not be completed. Try signing in or wait a moment.",
        );
      }
      focusFeedback();
    } catch {
      setSessionState("unavailable");
      setError(
        !getOnlineSnapshot()
          ? "You appear to be offline. Connect to the internet to check your session."
          : "Session check could not be completed right now. Wait a moment and try again.",
      );
      focusFeedback();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    setRetryAfter(null);
    setEmailError("");
    setPasswordError("");

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      let nextEmailError = "";
      let nextPasswordError = "";
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "email" && !nextEmailError) {
          nextEmailError = "Enter a valid email address.";
        }
        if (issue.path[0] === "password" && !nextPasswordError) {
          nextPasswordError = "Enter your password.";
        }
      }
      setEmailError(nextEmailError);
      setPasswordError(nextPasswordError);
      if (nextEmailError) {
        emailRef.current?.focus();
      } else if (nextPasswordError) {
        passwordRef.current?.focus();
      } else {
        feedbackRef.current?.focus();
      }
      return;
    }

    setBusyAction("sign-in");
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        if (response.status === 429) {
          const delaySeconds = parseRetryAfterSeconds(
            response.headers.get("retry-after"),
          );
          setRetryAfter(delaySeconds ?? 0);
          setError("Too many sign-in attempts.");
        } else if (response.status === 403) {
          setError(
            "Sign-in was rejected by origin verification. Reload this page and try again.",
          );
        } else if (response.status >= 500) {
          setError(
            "Sign-in is temporarily unavailable. Check service connectivity and try again shortly.",
          );
        } else {
          setError(
            "Email or password was not recognized, or this account is not authorized for Owner access.",
          );
        }
        focusFeedback();
        return;
      }

      const verified = await readSessionState();
      if (verified === "authenticated") {
        clearFormState();
        setSessionState("authenticated");
        setNotice("Signed in. Opening your dashboard…");
        router.replace("/");
        router.refresh();
        return;
      }

      if (verified === "unauthenticated") {
        let cleanupFailed = false;
        try {
          const cleanup = await fetch("/api/auth/sign-out", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          });
          cleanupFailed = !cleanup.ok;
        } catch {
          cleanupFailed = true;
        }
        setSessionState("unauthenticated");
        setError(
          cleanupFailed
            ? "Owner authorization could not be confirmed, and clearing the temporary session failed. Reload and try again."
            : "Email or password was not recognized, or this account is not authorized for Owner access.",
        );
      } else {
        setSessionState("unavailable");
        setError(
          "Sign-in completed, but Owner session verification could not be confirmed right now.",
        );
      }
      focusFeedback();
    } catch {
      setError(
        !getOnlineSnapshot()
          ? "You appear to be offline. Connect to the internet and try signing in again."
          : "The connection was interrupted before sign-in could be confirmed. Your entries remain in this form and were not queued offline.",
      );
      focusFeedback();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSignOut() {
    if (busy) return;
    setError("");
    setNotice("");
    setRetryAfter(null);
    setBusyAction("sign-out");
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        setError(
          response.status >= 500
            ? "Sign-out could not reach the auth service. Your session may still be active."
            : "Sign-out could not be confirmed. Reload and verify your session before leaving this device.",
        );
        focusFeedback();
        return;
      }
      clearFormState();
      setSessionState("unauthenticated");
      setNotice("Signed out. Enter your credentials to start a new session.");
      router.refresh();
      focusFeedback();
    } catch {
      setError(
        !getOnlineSnapshot()
          ? "You appear to be offline. Sign-out requires an internet connection to revoke the server session."
          : "The connection was interrupted before sign-out could be confirmed. Try again before leaving this device.",
      );
      focusFeedback();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-[28px] leading-8 font-semibold tracking-tight text-foreground">
          {sessionState === "authenticated" ? "You’re signed in" : "Sign in"}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {sessionState === "authenticated"
            ? "Your session is active on this browser."
            : "Enter your email and password to open Daisy."}
        </p>
      </div>

      <div
        ref={feedbackRef}
        tabIndex={-1}
        className="grid gap-3 rounded-control empty:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
      >
        <div aria-live="polite" className="empty:hidden">
          {notice && <Alert tone="success">{notice}</Alert>}
        </div>
        <div role="alert" className="empty:hidden">
          {error && (
            <Alert role="presentation" tone="danger" className="grid gap-1">
              <span>{error}</span>
              {retryAfter !== null && (
                <span className="tabular-nums">
                  {formatRetryWaitMessage(retryAfter > 0 ? retryAfter : null)}
                </span>
              )}
            </Alert>
          )}
        </div>
        {!isOnline && (
          <Alert tone="warning" role="status">
            You appear to be offline. Sign-in and sign-out require an internet
            connection and cannot be queued locally.
          </Alert>
        )}
        {sessionState === "unavailable" && !error && (
          <Alert tone="warning" role="status" className="grid gap-3">
            <span>
              Could not verify an existing session right now. You can retry the
              session check or sign in below.
            </span>
            <div>
              <Button
                variant="secondary"
                size="sm"
                loading={busyAction === "recheck"}
                disabled={busy}
                onClick={handleRecheck}
              >
                {busyAction === "recheck" ? "Checking…" : "Retry check"}
              </Button>
            </div>
          </Alert>
        )}
      </div>

      {sessionState === "authenticated" ? (
        <div className="grid gap-3">
          {busy ? (
            <Button disabled className="w-full">
              Go to dashboard
            </Button>
          ) : (
            <Link href="/" className={buttonClasses({ className: "w-full" })}>
              Go to dashboard
            </Link>
          )}
          <Button
            variant="secondary"
            loading={busyAction === "sign-out"}
            disabled={busy}
            onClick={handleSignOut}
            className="w-full"
          >
            {busyAction === "sign-out" ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      ) : (
        <>
          <form
            method="post"
            action="/auth/sign-in"
            noValidate
            onSubmit={handleSignIn}
            className="grid gap-4"
          >
            <Field
              id="sign-in-email"
              label="Email"
              required
              {...(emailError ? { error: emailError } : {})}
            >
              {(control) => (
                <Input
                  {...control}
                  ref={emailRef}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  maxLength={254}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailError) setEmailError("");
                  }}
                  disabled={busy}
                />
              )}
            </Field>

            <div className="grid gap-1">
              <Field
                id="sign-in-password"
                label="Password"
                required
                {...(passwordError ? { error: passwordError } : {})}
              >
                {(control) => (
                  <div className="relative">
                    <Input
                      {...control}
                      ref={passwordRef}
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      maxLength={256}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (passwordError) setPasswordError("");
                      }}
                      disabled={busy}
                      className="pr-12"
                    />
                    <PasswordVisibilityButton
                      visible={showPassword}
                      disabled={busy}
                      aria-controls={control.id}
                      onClick={() => setShowPassword((prev) => !prev)}
                    />
                  </div>
                )}
              </Field>

              <div className="flex justify-end">
                <Link
                  href="/auth/reset-password"
                  className="inline-flex min-h-11 items-center text-[13px] font-medium text-primary underline-offset-4 transition-colors duration-(--duration-control) ease-(--ease-control) hover:text-primary-hover hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              loading={busyAction === "sign-in"}
              disabled={busy}
              className="w-full"
            >
              {busyAction === "sign-in" ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <Separator />

          <p className="text-sm leading-6 text-muted-foreground">
            Need to set or change your password?{" "}
            <Link
              href="/auth/reset-password"
              className="font-medium text-foreground underline underline-offset-4 transition-colors duration-(--duration-control) ease-(--ease-control) hover:text-primary"
            >
              Reset password
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
