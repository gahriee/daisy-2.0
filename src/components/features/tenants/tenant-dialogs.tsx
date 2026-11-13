"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  assignTenantToBedAction,
  createTenantAction,
  moveOutTenantAssignmentAction,
  updateTenantAction,
  type TenantActionResult,
} from "@/features/tenants/actions";
import type {
  AssignableBedOptionDto,
  TenantAssignmentDto,
  TenantDto,
} from "@/features/tenants/schemas";
import { addManilaDays, toManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";

export function CreateTenantDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [clientId, setClientId] = useState(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "",
  );

  const [state, submitAction, pending] = useActionState(
    async (
      prev: TenantActionResult,
      formData: FormData,
    ): Promise<TenantActionResult> => {
      const result = await createTenantAction(prev, formData);
      if (result.status === "saved") {
        if (
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
        ) {
          setClientId(crypto.randomUUID());
        }
        onClose();
        await onSaved(result.message);
      }
      return result;
    },
    { status: "idle" },
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissDisabled={pending}
      title="Add tenant"
      description="Create a managed boarder profile. Tenants do not sign in."
    >
      <form
        key={clientId || "tenant-form"}
        action={submitAction}
        className="grid gap-4"
        noValidate
      >
        {clientId && <input type="hidden" name="id" value={clientId} />}
        {state.status === "error" && (
          <Alert tone="danger" role="alert">
            {state.message}
          </Alert>
        )}

        <Field
          id="create-tenant-fullName"
          label="Full name"
          required
          error={
            state.status === "error" ? state.fieldErrors.fullName : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="fullName"
              placeholder="e.g. Juan Dela Cruz"
              autoComplete="name"
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="create-tenant-phone"
            label="Phone"
            error={
              state.status === "error" ? state.fieldErrors.phone : undefined
            }
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="+63 917 000 0000"
              />
            )}
          </Field>
          <Field
            id="create-tenant-email"
            label="Email"
            error={
              state.status === "error" ? state.fieldErrors.email : undefined
            }
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="email"
                type="email"
                inputMode="email"
                placeholder="Optional"
              />
            )}
          </Field>
        </div>

        <Field
          id="create-tenant-address"
          label="Home address"
          error={
            state.status === "error" ? state.fieldErrors.address : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="address"
              placeholder="Barangay, city or province"
            />
          )}
        </Field>

        <Field
          id="create-tenant-emergency"
          label="Emergency contact"
          error={
            state.status === "error"
              ? state.fieldErrors.emergencyContact
              : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="emergencyContact"
              placeholder="Name and phone number"
            />
          )}
        </Field>

        <Field
          id="create-tenant-notes"
          label="Notes"
          error={state.status === "error" ? state.fieldErrors.notes : undefined}
        >
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              name="notes"
              placeholder="Optional stay preferences or billing reminders"
            />
          )}
        </Field>

        <div className="flex flex-wrap justify-end gap-2.5 pt-2">
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {pending ? "Saving…" : "Save tenant"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function EditTenantDialog({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: TenantDto | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [state, submitAction, pending] = useActionState(
    async (
      prev: TenantActionResult,
      formData: FormData,
    ): Promise<TenantActionResult> => {
      const result = await updateTenantAction(prev, formData);
      if (result.status === "saved") {
        onClose();
        await onSaved(result.message);
      }
      return result;
    },
    { status: "idle" },
  );

  return (
    <Dialog
      open={Boolean(tenant)}
      onClose={onClose}
      dismissDisabled={pending}
      title={tenant ? `Edit ${tenant.fullName}` : "Edit tenant"}
      description="Update contact details or emergency contacts."
    >
      {tenant && (
        <form
          key={`${tenant.id}-${tenant.version}`}
          action={submitAction}
          className="grid gap-4"
          noValidate
        >
          <input type="hidden" name="tenantId" value={tenant.id} />
          <input type="hidden" name="expectedVersion" value={tenant.version} />
          {state.status === "error" && (
            <Alert tone="danger" role="alert">
              {state.message}
            </Alert>
          )}

          <Field
            id="edit-tenant-fullName"
            label="Full name"
            required
            error={
              state.status === "error" ? state.fieldErrors.fullName : undefined
            }
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="fullName"
                defaultValue={tenant.fullName}
              />
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="edit-tenant-phone" label="Phone">
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  defaultValue={tenant.phone ?? ""}
                />
              )}
            </Field>
            <Field
              id="edit-tenant-email"
              label="Email"
              error={
                state.status === "error" ? state.fieldErrors.email : undefined
              }
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  name="email"
                  type="email"
                  inputMode="email"
                  defaultValue={tenant.email ?? ""}
                />
              )}
            </Field>
          </div>

          <Field id="edit-tenant-address" label="Home address">
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="address"
                defaultValue={tenant.address ?? ""}
              />
            )}
          </Field>

          <Field id="edit-tenant-emergency" label="Emergency contact">
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="emergencyContact"
                defaultValue={tenant.emergencyContact ?? ""}
              />
            )}
          </Field>

          <Field id="edit-tenant-notes" label="Notes">
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                name="notes"
                defaultValue={tenant.notes ?? ""}
              />
            )}
          </Field>

          <div className="flex flex-wrap justify-end gap-2.5 pt-2">
            <Button variant="secondary" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function AssignBedForm({
  tenant,
  beds,
  onClose,
  onSaved,
}: {
  tenant: TenantDto;
  beds: AssignableBedOptionDto[];
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const firstBed = beds[0];
  const [selectedBedId, setSelectedBedId] = useState<string>(
    firstBed?.bedId ?? "",
  );
  const [monthlyRateDraft, setMonthlyRateDraft] = useState<string>(
    firstBed?.monthlyRate ?? "",
  );

  const effectiveBedId =
    beds.find((b) => b.bedId === selectedBedId)?.bedId ?? firstBed?.bedId ?? "";
  const effectiveMonthlyRate =
    monthlyRateDraft ||
    beds.find((b) => b.bedId === effectiveBedId)?.monthlyRate ||
    "";

  const todayManila = toManilaDate(new Date());
  const defaultEndManila = addManilaDays(todayManila, 180);

  const [state, submitAction, pending] = useActionState(
    async (
      prev: TenantActionResult,
      formData: FormData,
    ): Promise<TenantActionResult> => {
      const result = await assignTenantToBedAction(prev, formData);
      if (result.status === "saved") {
        onClose();
        await onSaved(result.message);
      }
      return result;
    },
    { status: "idle" },
  );

  if (beds.length === 0) {
    return (
      <div className="grid gap-4">
        <Alert tone="warning" role="status">
          No active beds are configured yet. Add an active room and bed before
          assigning a tenant.
        </Alert>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={submitAction} className="grid gap-4" noValidate>
      <input type="hidden" name="tenantId" value={tenant.id} />
      {state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}

      <Field
        id="assign-bed-id"
        label="Room & bed"
        required
        error={state.status === "error" ? state.fieldErrors.bedId : undefined}
      >
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="bedId"
            value={effectiveBedId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedBedId(nextId);
              const found = beds.find((b) => b.bedId === nextId);
              if (found) {
                setMonthlyRateDraft(found.monthlyRate);
              }
            }}
          >
            {beds.map((bed) => (
              <option key={bed.bedId} value={bed.bedId}>
                Room {bed.roomNumber} · Bed {bed.bedNumber}
                {bed.bedLabel ? ` (${bed.bedLabel})` : ""} —{" "}
                {formatPhpCurrency(bed.monthlyRate)}/mo
                {bed.status === "OCCUPIED"
                  ? " [Currently occupied · future only]"
                  : ""}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="assign-start-date"
          label="Move-in date (Manila)"
          required
          error={
            state.status === "error"
              ? state.fieldErrors.startDateManila
              : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="startDateManila"
              type="date"
              defaultValue={todayManila}
            />
          )}
        </Field>
        <Field
          id="assign-end-date"
          label="Planned end date (Manila)"
          required
          error={
            state.status === "error"
              ? state.fieldErrors.endDateManila
              : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="endDateManila"
              type="date"
              defaultValue={defaultEndManila}
            />
          )}
        </Field>
        <Field
          id="assign-monthly-rate"
          label="Monthly rate (₱)"
          required
          error={
            state.status === "error" ? state.fieldErrors.monthlyRate : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="monthlyRate"
              inputMode="decimal"
              value={effectiveMonthlyRate}
              onChange={(e) => setMonthlyRateDraft(e.target.value)}
            />
          )}
        </Field>
        <Field
          id="assign-deposit"
          label="Security deposit (₱)"
          required
          error={
            state.status === "error"
              ? state.fieldErrors.securityDeposit
              : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="securityDeposit"
              inputMode="decimal"
              defaultValue="0.00"
            />
          )}
        </Field>
      </div>

      <Field id="assign-notes" label="Notes">
        {(fieldProps) => (
          <Textarea
            {...fieldProps}
            name="notes"
            placeholder="Optional move-in terms or meter readings"
          />
        )}
      </Field>

      <div className="flex flex-wrap justify-end gap-2.5 pt-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Assigning…" : "Assign bed"}
        </Button>
      </div>
    </form>
  );
}

export function AssignBedDialog({
  tenant,
  beds,
  onClose,
  onSaved,
}: {
  tenant: TenantDto | null;
  beds: AssignableBedOptionDto[];
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  return (
    <Dialog
      open={Boolean(tenant)}
      onClose={onClose}
      title={tenant ? `Assign bed for ${tenant.fullName}` : "Assign bed"}
      description="Creates an overlap-protected allocation and transitions bed status on move-in."
    >
      {tenant && (
        <AssignBedForm
          key={tenant.id}
          tenant={tenant}
          beds={beds}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function MoveOutForm({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: TenantAssignmentDto;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"complete" | "cancel">("complete");
  const todayManila = toManilaDate(new Date());

  const [state, submitAction, pending] = useActionState(
    async (
      prev: TenantActionResult,
      formData: FormData,
    ): Promise<TenantActionResult> => {
      const result = await moveOutTenantAssignmentAction(prev, formData);
      if (result.status === "saved") {
        onClose();
        await onSaved(result.message);
      }
      return result;
    },
    { status: "idle" },
  );

  return (
    <form action={submitAction} className="grid gap-4" noValidate>
      <input type="hidden" name="assignmentId" value={assignment.id} />
      <input type="hidden" name="expectedVersion" value={assignment.version} />
      {state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}

      <Field id="moveout-mode" label="Outcome" required>
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "complete" | "cancel")}
          >
            <option value="complete">
              Complete stay (record move-out date)
            </option>
            <option value="cancel">
              Cancel assignment (tenancy never began)
            </option>
          </Select>
        )}
      </Field>

      {mode === "complete" && (
        <Field
          id="moveout-date"
          label="Actual move-out date (Manila)"
          description={`Stay started ${assignment.startDateManila}.`}
          required
          error={
            state.status === "error"
              ? state.fieldErrors.actualMoveOutDateManila
              : undefined
          }
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="actualMoveOutDateManila"
              type="date"
              defaultValue={todayManila}
            />
          )}
        </Field>
      )}

      <Field id="moveout-notes" label="Notes">
        {(fieldProps) => (
          <Textarea
            {...fieldProps}
            name="notes"
            placeholder="Optional handover or deposit settlement notes"
          />
        )}
      </Field>

      <div className="flex flex-wrap justify-end gap-2.5 pt-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Back
        </Button>
        <Button
          type="submit"
          variant={mode === "cancel" ? "danger" : "primary"}
          loading={pending}
        >
          {pending
            ? "Updating…"
            : mode === "cancel"
              ? "Cancel assignment"
              : "Record move-out"}
        </Button>
      </div>
    </form>
  );
}

export function MoveOutAssignmentDialog({
  assignment,
  tenantName,
  onClose,
  onSaved,
}: {
  assignment: TenantAssignmentDto | null;
  tenantName: string;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  return (
    <Dialog
      open={Boolean(assignment)}
      onClose={onClose}
      title={
        assignment
          ? `Move out — Room ${assignment.roomNumber} · Bed ${assignment.bedNumber}`
          : "Record move-out"
      }
      description={`Closes ${tenantName}'s assignment, truncates or cancels the allocation, and frees the bed.`}
    >
      {assignment && (
        <MoveOutForm
          key={`${assignment.id}-${assignment.version}`}
          assignment={assignment}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}
