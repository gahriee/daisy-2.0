"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import Link from "next/link";
import { DaisyLogoLoader } from "@/components/common/daisy-logo-loader";
import { PasswordVisibilityButton } from "@/components/features/auth/password-visibility-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toaster";
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
  const [busyAction, setBusyAction] = useState<"sign-in" | "recheck" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const feedbackRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const busy = busyAction !== null;

  useEffect(() => {
    if (sessionState !== "authenticated") return;
    window.location.replace("/");
  }, [sessionState]);

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
    setRetryAfter(null);
    setBusyAction("recheck");
    try {
      const next = await readSessionState();
      setSessionState(next);
      if (next === "authenticated") {
        clearFormState();
        toast.success("Signed in. Opening your dashboard…");
        setSessionState("authenticated");
        return;
      } else if (next === "unauthenticated") {
        toast.info("You are not signed in yet. Sign in below.");
      } else {
        setError(
          "We could not check if you are signed in. Try signing in or wait a moment.",
        );
      }
      focusFeedback();
    } catch {
      setSessionState("unavailable");
      setError(
        !getOnlineSnapshot()
          ? "You appear to be offline. Connect to the internet before signing in."
          : "We could not finish checking your sign-in status. Wait a moment and try again.",
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
            "Sign-in could not be completed on this page. Reload and try again.",
          );
        } else if (response.status >= 500) {
          setError(
            "Sign-in is not available right now. Wait a moment and try again.",
          );
        } else {
          setError(
            "Email or password was not recognized, or this account cannot open the workspace.",
          );
        }
        focusFeedback();
        return;
      }

      const verified = await readSessionState();
      if (verified === "authenticated") {
        clearFormState();
        setSessionState("authenticated");
        toast.success("Signed in. Opening your dashboard…");
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
            ? "Account access could not be confirmed. Please reload the page and try again."
            : "Email or password was not recognized, or this account cannot open the workspace.",
        );
      } else {
        setSessionState("unavailable");
        setError(
          "Sign-in finished, but we could not verify your access right now.",
        );
      }
      focusFeedback();
    } catch {
      setError(
        !getOnlineSnapshot()
          ? "You appear to be offline. Connect to the internet and try signing in again."
          : "The connection was interrupted before sign-in could finish. Your entries are still here, so please try again.",
      );
      focusFeedback();
    } finally {
      setBusyAction(null);
    }
  }

  if (sessionState === "authenticated") {
    return <DaisyLogoLoader label="Opening dashboard…" className="py-16" />;
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-[28px] leading-8 font-semibold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Enter your email and password to open Daisy.
        </p>
      </div>

      <div
        ref={feedbackRef}
        tabIndex={-1}
        className="grid gap-3 rounded-control empty:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
      >
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
            You appear to be offline. Connect to the internet to sign in or sign
            out.
          </Alert>
        )}
        {sessionState === "unavailable" && !error && (
          <Alert tone="warning" role="status" className="grid gap-3">
            <span>
              We could not check if you are already signed in. Try checking
              again or sign in below.
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
    </div>
  );
}
