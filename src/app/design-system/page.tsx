import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const metadata = { title: "Design system · Daisy" };

export default function DesignSystemPage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-12 px-5 py-12 sm:px-8">
      <header className="grid gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Garden Ledger</h1>
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
            Forest
            <br />
            <span className="font-mono text-sm">#245747</span>
          </div>
          <div className="min-w-32 rounded-panel border border-border bg-background p-5">
            Linen
            <br />
            <span className="font-mono text-sm">#F7F6F0</span>
          </div>
          <div className="min-w-32 rounded-panel bg-accent p-5 text-accent-foreground">
            Muted gold
            <br />
            <span className="font-mono text-sm">#E6CE8C</span>
          </div>
        </div>
      </section>
      <Separator />
      <section aria-labelledby="buttons-title" className="grid gap-5">
        <h2 id="buttons-title" className="text-xl font-semibold">
          Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button>Primary action</Button>
          <Button variant="secondary">Secondary action</Button>
          <Button variant="ghost">Quiet action</Button>
          <Button variant="danger">Destructive action</Button>
          <Button disabled>Unavailable</Button>
          <Button loading>Saving example</Button>
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
          <Badge tone="success">Synced</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="danger">Needs attention</Badge>
          <Badge tone="info">Information</Badge>
        </div>
        <Alert role="note">
          Information example. Connection state and sync state use separate
          messages.
        </Alert>
        <Alert role="note" tone="success">
          Success example. Confirmed state follows server acknowledgement.
        </Alert>
        <Alert role="note" tone="warning">
          Pending example. A local draft is waiting to sync.
        </Alert>
        <Alert role="note" tone="danger">
          Error example. Preserve the draft and explain the next step.
        </Alert>
      </section>
      <section aria-labelledby="surfaces-title" className="grid gap-5">
        <h2 id="surfaces-title" className="text-xl font-semibold">
          Surfaces and loading
        </h2>
        <Card className="grid gap-3">
          <h3 className="font-semibold">A quiet surface</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            A border defines the container. No decorative shadow competes with
            the content.
          </p>
        </Card>
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
    </main>
  );
}
