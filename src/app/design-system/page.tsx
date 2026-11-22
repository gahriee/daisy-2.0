import { DaisyBrand } from "@/components/layout/daisy-brand";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ActionLink, BackLink, Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToastPreview } from "./_components/toast-preview";

export const metadata = { title: "Design system · Daisy" };

export default function DesignSystemPage() {
  return (
    <WorkspaceShell
      title="Design system"
      primaryAction={{ label: "Dashboard", href: "/" }}
    >
      <div className="grid gap-10">
        <header className="grid gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Rausch and charcoal
          </h1>
          <p className="max-w-prose leading-7 text-muted-foreground">
            Daisy’s shared colors, controls and states. These are examples;
            nothing here saves business data.
          </p>
        </header>
        <section aria-labelledby="palette-title" className="grid gap-5">
          <h2 id="palette-title" className="text-xl font-semibold">
            Brand palette
          </h2>
          <div className="flex flex-wrap gap-4">
            <div className="min-w-32 rounded-panel bg-primary p-5 text-primary-foreground">
              Rausch crimson
              <br />
              <span className="font-mono text-sm">#E00B41</span>
            </div>
            <div className="min-w-32 rounded-panel border border-border bg-background p-5">
              Soft stone
              <br />
              <span className="font-mono text-sm">#F7F7F7</span>
            </div>
            <div className="min-w-32 rounded-panel bg-accent p-5 text-accent-foreground">
              Rausch blush
              <br />
              <span className="font-mono text-sm">#FFE8EE</span>
            </div>
          </div>
        </section>
        <Separator />
        <section aria-labelledby="brand-marks-title" className="grid gap-5">
          <div className="grid gap-1">
            <h2 id="brand-marks-title" className="text-xl font-semibold">
              Brand marks
            </h2>
            <p className="text-sm text-muted-foreground">
              Icon, wordmark, and combined lockup in light, dark, and single-ink
              monochrome variants (exported in{" "}
              <code className="font-mono text-xs">/brand/*.png</code> and{" "}
              <code className="font-mono text-xs">/brand/*.svg</code>).
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-4 rounded-panel border border-border bg-surface p-5">
              <span className="text-xs font-medium text-muted-foreground">
                Light surface
              </span>
              <div className="grid gap-4">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <DaisyBrand asLink={false} show="icon" tone="light" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Icon
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <DaisyBrand asLink={false} show="wordmark" tone="light" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Brand name
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <DaisyBrand asLink={false} show="lockup" tone="light" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Lockup
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 rounded-panel bg-foreground p-5 text-surface">
              <span className="text-xs font-medium text-surface/70">
                Dark surface
              </span>
              <div className="grid gap-4">
                <div className="flex items-center justify-between border-b border-surface/15 pb-3">
                  <DaisyBrand asLink={false} show="icon" tone="dark" />
                  <span className="font-mono text-xs text-surface/70">
                    Icon
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-surface/15 pb-3">
                  <DaisyBrand asLink={false} show="wordmark" tone="dark" />
                  <span className="font-mono text-xs text-surface/70">
                    Brand name
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <DaisyBrand asLink={false} show="lockup" tone="dark" />
                  <span className="font-mono text-xs text-surface/70">
                    Lockup
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 rounded-panel border border-border bg-background p-5">
              <span className="text-xs font-medium text-muted-foreground">
                Monochrome (adaptive ink)
              </span>
              <div className="grid gap-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <DaisyBrand asLink={false} show="icon" tone="monochrome" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Icon
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <DaisyBrand
                    asLink={false}
                    show="wordmark"
                    tone="monochrome"
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    Brand name
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <DaisyBrand asLink={false} show="lockup" tone="monochrome" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Lockup
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <Separator />
        <section aria-labelledby="brand-marks-title" className="grid gap-5">
          <div className="grid gap-1">
            <h2 id="brand-marks-title" className="text-xl font-semibold">
              Brand marks
            </h2>
            <p className="text-sm text-muted-foreground">
              Icon, wordmark, and combined lockup in light, dark, and single-ink
              monochrome variants (exported in{" "}
              <code className="font-mono text-xs">/brand/*.png</code> and{" "}
              <code className="font-mono text-xs">/brand/*.svg</code>).
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-4 rounded-panel border border-border bg-surface p-5">
              <span className="text-xs font-medium text-muted-foreground">
                Light surface
              </span>
              <div className="grid gap-4">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <DaisyBrand asLink={false} show="icon" tone="light" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Icon
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <DaisyBrand asLink={false} show="wordmark" tone="light" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Brand name
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <DaisyBrand asLink={false} show="lockup" tone="light" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Lockup
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 rounded-panel bg-foreground p-5 text-surface">
              <span className="text-xs font-medium text-surface/70">
                Dark surface
              </span>
              <div className="grid gap-4">
                <div className="flex items-center justify-between border-b border-surface/15 pb-3">
                  <DaisyBrand asLink={false} show="icon" tone="dark" />
                  <span className="font-mono text-xs text-surface/70">
                    Icon
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-surface/15 pb-3">
                  <DaisyBrand asLink={false} show="wordmark" tone="dark" />
                  <span className="font-mono text-xs text-surface/70">
                    Brand name
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <DaisyBrand asLink={false} show="lockup" tone="dark" />
                  <span className="font-mono text-xs text-surface/70">
                    Lockup
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 rounded-panel border border-border bg-background p-5">
              <span className="text-xs font-medium text-muted-foreground">
                Monochrome (adaptive ink)
              </span>
              <div className="grid gap-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <DaisyBrand asLink={false} show="icon" tone="monochrome" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Icon
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <DaisyBrand
                    asLink={false}
                    show="wordmark"
                    tone="monochrome"
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    Brand name
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <DaisyBrand asLink={false} show="lockup" tone="monochrome" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Lockup
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <Separator />
        <section aria-labelledby="buttons-title" className="grid gap-5">
          <h2 id="buttons-title" className="text-xl font-semibold">
            Actions
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary action</Button>
            <Button variant="ghost">Quiet action</Button>
            <Button variant="danger">Destructive action</Button>
            <Button variant="secondary" size="sm">
              Compact control
            </Button>
            <Button disabled>Unavailable</Button>
            <Button loading>Saving example</Button>
            <ActionLink href="/reports">Analytics</ActionLink>
            <BackLink href="/tenants">Tenants</BackLink>
          </div>
        </section>
        <Separator />
        <section
          id="fields"
          aria-labelledby="fields-title"
          className="grid gap-5"
        >
          <h2 id="fields-title" className="text-xl font-semibold">
            Form controls
          </h2>
          <form action="/design-system#fields" className="grid max-w-lg gap-6">
            <Field
              id="example-email"
              label="Example email"
              required
              description="Enter an email to try native form validation. This value is not submitted."
            >
              {(control) => (
                <Input
                  {...control}
                  type="email"
                  autoComplete="off"
                  placeholder="name@example.com"
                />
              )}
            </Field>
            <Field
              id="example-invalid"
              label="Example validation error"
              error="Enter a value before continuing."
            >
              {(control) => (
                <Input {...control} placeholder="Validation state example" />
              )}
            </Field>
            <Field id="example-select" label="Example selection">
              {(control) => (
                <Select {...control} defaultValue="">
                  <option value="" disabled>
                    Choose an option
                  </option>
                  <option value="first">First option</option>
                  <option value="second">Second option</option>
                </Select>
              )}
            </Field>
            <Field
              id="example-notes"
              label="Example notes"
              description="A multiline control that you can resize vertically."
            >
              {(control) => (
                <Textarea
                  {...control}
                  placeholder="Try a longer piece of text…"
                />
              )}
            </Field>
            <Field id="example-disabled" label="Unavailable field">
              {(control) => (
                <Input {...control} disabled value="Disabled example" />
              )}
            </Field>
            <Checkbox label="Example option" />
            <Checkbox label="Unavailable option" disabled />
            <Button type="submit" className="justify-self-start">
              Try validation
            </Button>
          </form>
        </section>
        <Separator />
        <section aria-labelledby="states-title" className="grid gap-5">
          <h2 id="states-title" className="text-xl font-semibold">
            Status and feedback
          </h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="success">Up to date</Badge>
            <Badge tone="warning">Pending</Badge>
            <Badge tone="danger">Needs attention</Badge>
            <Badge tone="info">Information</Badge>
          </div>
          <Alert role="note">
            Information example. Internet connection and saved status use
            separate messages.
          </Alert>
          <Alert role="note" tone="success">
            Success example. Confirmed status means changes are saved online.
          </Alert>
          <Alert role="note" tone="warning">
            Pending example. A change on this device is waiting to save online.
          </Alert>
          <Alert role="note" tone="danger">
            Error example. Keep the draft and explain the next step.
          </Alert>
          <div className="grid gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Action feedback toasts (mounted globally via Sonner)
            </p>
            <ToastPreview />
          </div>
        </section>
        <section aria-labelledby="surfaces-title" className="grid gap-5">
          <h2 id="surfaces-title" className="text-xl font-semibold">
            Surfaces and loading
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="grid gap-2">
              <h3 className="text-base font-medium">Hairline surface</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                A 1 px hairline border defines the panel cleanly against the
                soft stone canvas.
              </p>
            </Card>
            <Card variant="tonal" interactive className="grid gap-2">
              <h3 className="text-base font-medium">Tonal interactive card</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Interactive surfaces step 2 px on pointer hover without resting
                shadows.
              </p>
            </Card>
          </div>
          <EmptyState>
            <EmptyStateIcon>
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M9 12h6" />
              </svg>
            </EmptyStateIcon>
            <div className="grid gap-1.5">
              <EmptyStateTitle>Empty ledger example</EmptyStateTitle>
              <EmptyStateDescription>
                Module views reuse one hairline empty-state container when no
                entries have been recorded.
              </EmptyStateDescription>
            </div>
          </EmptyState>
          <div
            role="status"
            aria-label="Loading example"
            className="grid max-w-sm gap-3"
          >
            <Skeleton className="w-2/3" />
            <Skeleton />
            <Skeleton className="w-4/5" />
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
