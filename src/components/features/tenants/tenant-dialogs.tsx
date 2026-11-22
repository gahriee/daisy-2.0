"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { CountPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TableEmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast, type SavedFeedbackTone } from "@/components/ui/toaster";
import {
  assignTenantToBedAction,
  createTenantAction,
  createTenantNoteAction,
  deleteTenantNoteAction,
  moveOutTenantAssignmentAction,
  updateTenantAction,
  type TenantActionResult,
  type TenantNoteActionResult,
} from "@/features/tenants/actions";
import {
  CreateTenantSchema,
  UpdateTenantSchema,
  type AssignableBedOptionDto,
  type TenantAssignmentDto,
  type TenantDto,
  type TenantNoteDto,
} from "@/features/tenants/schemas";
import { addManilaDays, formatManilaDateTime, toManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import {
  getOfflineVaultClientState,
  OfflineDeviceMissingError,
  OfflineVaultLockedError,
  submitOfflineCapableMutation,
} from "@/offline/workspace-bridge";

function mapTenantFieldIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

function readFormText(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val : "";
}

export function CreateTenantDialog({
  open,
  offlineMode = false,
  onClose,
  onRequireVaultUnlock,
  onSaved,
}: {
  open: boolean;
  offlineMode?: boolean;
  onClose: () => void;
  onRequireVaultUnlock?: () => void;
  onSaved: (message: string, tone?: SavedFeedbackTone) => void | Promise<void>;
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
      const vaultState = await getOfflineVaultClientState();
      const useOfflineBridge =
        offlineMode ||
        !vaultState.online ||
        (vaultState.vaultUnlocked && Boolean(vaultState.deviceId));

      if (useOfflineBridge) {
        const entityId =
          readFormText(formData, "id").trim() || crypto.randomUUID();
        const parsed = CreateTenantSchema.safeParse({
          id: entityId,
          fullName: readFormText(formData, "fullName"),
          phone: readFormText(formData, "phone"),
          email: readFormText(formData, "email"),
          address: readFormText(formData, "address"),
          emergencyContact: readFormText(formData, "emergencyContact"),
        });
        if (!parsed.success) {
          return {
            status: "error",
            message: "Review the highlighted fields before saving.",
            fieldErrors: mapTenantFieldIssues(parsed.error.issues),
          };
        }
        try {
          const { id: _omitted, ...createPayload } = parsed.data;
          void _omitted;
          const nowIso = new Date().toISOString();
          const res = await submitOfflineCapableMutation({
            type: "tenant.create",
            entityId,
            baseVersion: 0,
            payload: createPayload,
            projectionPayload: {
              ...createPayload,
              archivedAt: null,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            syncedMessage: "Tenant added.",
            queuedMessage:
              "Tenant saved on this device (waiting to go online).",
          });
          if (res.delivery === "needs_attention") {
            onClose();
            await onSaved(
              `Tenant saved in Needs attention: ${res.reason}`,
              "warning",
            );
            return { status: "idle" };
          }
          if (
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
          ) {
            setClientId(crypto.randomUUID());
          }
          onClose();
          await onSaved(
            res.message,
            res.delivery === "queued" ? "info" : "success",
          );
          return { status: "saved", message: res.message, tenantId: entityId };
        } catch (error) {
          if (error instanceof OfflineVaultLockedError) {
            onRequireVaultUnlock?.();
          }
          return {
            status: "error",
            message:
              error instanceof OfflineDeviceMissingError ||
              error instanceof Error
                ? error.message
                : "Could not save tenant offline.",
            fieldErrors: {},
          };
        }
      }

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
  offlineMode = false,
  onClose,
  onRequireVaultUnlock,
  onSaved,
}: {
  tenant: TenantDto | null;
  offlineMode?: boolean;
  onClose: () => void;
  onRequireVaultUnlock?: () => void;
  onSaved: (message: string, tone?: SavedFeedbackTone) => void | Promise<void>;
}) {
  const [state, submitAction, pending] = useActionState(
    async (
      prev: TenantActionResult,
      formData: FormData,
    ): Promise<TenantActionResult> => {
      const vaultState = await getOfflineVaultClientState();
      const useOfflineBridge =
        offlineMode ||
        !vaultState.online ||
        (vaultState.vaultUnlocked && Boolean(vaultState.deviceId));

      if (useOfflineBridge && tenant) {
        const parsed = UpdateTenantSchema.safeParse({
          tenantId: tenant.id,
          expectedVersion: tenant.version,
          fullName: readFormText(formData, "fullName"),
          phone: readFormText(formData, "phone"),
          email: readFormText(formData, "email"),
          address: readFormText(formData, "address"),
          emergencyContact: readFormText(formData, "emergencyContact"),
        });
        if (!parsed.success) {
          return {
            status: "error",
            message: "Review the highlighted fields before saving.",
            fieldErrors: mapTenantFieldIssues(parsed.error.issues),
          };
        }
        try {
          const {
            tenantId: _tid,
            expectedVersion,
            ...updatePayload
          } = parsed.data;
          void _tid;
          const nowIso = new Date().toISOString();
          const res = await submitOfflineCapableMutation({
            type: "tenant.update",
            entityId: tenant.id,
            baseVersion: expectedVersion,
            payload: updatePayload,
            projectionPayload: {
              ...tenant,
              ...updatePayload,
              updatedAt: nowIso,
            },
            syncedMessage: "Tenant details updated.",
            queuedMessage:
              "Changes saved on this device (waiting to go online).",
          });
          onClose();
          if (res.delivery === "needs_attention") {
            await onSaved(
              `Changes saved in Needs attention: ${res.reason}`,
              "warning",
            );
            return { status: "idle" };
          }
          await onSaved(
            res.message,
            res.delivery === "queued" ? "info" : "success",
          );
          return { status: "saved", message: res.message, tenantId: tenant.id };
        } catch (error) {
          if (error instanceof OfflineVaultLockedError) {
            onRequireVaultUnlock?.();
          }
          return {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not save changes offline.",
            fieldErrors: {},
          };
        }
      }

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
  onSaved: (message: string, tone?: SavedFeedbackTone) => void | Promise<void>;
}) {
  const roomUnits = beds.filter(
    (bed, idx, arr) => arr.findIndex((b) => b.roomId === bed.roomId) === idx,
  );
  const firstBed = roomUnits[0];
  const [selectedBedId, setSelectedBedId] = useState<string>(
    firstBed?.bedId ?? "",
  );
  const [monthlyRateDraft, setMonthlyRateDraft] = useState<string>(
    firstBed?.monthlyRate ?? "",
  );

  const effectiveBedId =
    roomUnits.find((b) => b.bedId === selectedBedId)?.bedId ??
    firstBed?.bedId ??
    "";
  const effectiveMonthlyRate =
    monthlyRateDraft ||
    roomUnits.find((b) => b.bedId === effectiveBedId)?.monthlyRate ||
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

  if (roomUnits.length === 0) {
    return (
      <div className="grid gap-4">
        <Alert tone="warning" role="status">
          No active rooms are configured yet. Add an active room before
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
        label="Room"
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
              const found = roomUnits.find((b) => b.bedId === nextId);
              if (found) {
                setMonthlyRateDraft(found.monthlyRate);
              }
            }}
          >
            {roomUnits.map((bed) => (
              <option key={bed.bedId} value={bed.bedId}>
                Room {bed.roomNumber}
                {bed.roomFloor ? ` (${bed.roomFloor})` : ""} —{" "}
                {formatPhpCurrency(bed.monthlyRate)}/mo
                {bed.status === "OCCUPIED"
                  ? " (Currently occupied, future only)"
                  : ""}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="assign-start-date"
          label="Move-in date"
          required
          error={
            state.status === "error"
              ? state.fieldErrors.startDateManila
              : undefined
          }
        >
          {(fieldProps) => (
            <DatePicker
              {...fieldProps}
              required
              name="startDateManila"
              defaultValue={todayManila}
            />
          )}
        </Field>
        <Field
          id="assign-end-date"
          label="Planned end date"
          required
          error={
            state.status === "error"
              ? state.fieldErrors.endDateManila
              : undefined
          }
        >
          {(fieldProps) => (
            <DatePicker
              {...fieldProps}
              required
              name="endDateManila"
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

      <div className="flex flex-wrap justify-end gap-2.5 pt-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Assigning…" : "Assign room"}
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
  onSaved: (message: string, tone?: SavedFeedbackTone) => void | Promise<void>;
}) {
  return (
    <Dialog
      open={Boolean(tenant)}
      onClose={onClose}
      title={tenant ? `Assign room for ${tenant.fullName}` : "Assign room"}
      description="Reserves the room for the move-in date so it cannot be double-booked, then marks the room occupied."
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
  onSaved: (message: string, tone?: SavedFeedbackTone) => void | Promise<void>;
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
          label="Actual move-out date"
          description={`Stay started ${assignment.startDateManila}.`}
          required
          error={
            state.status === "error"
              ? state.fieldErrors.actualMoveOutDateManila
              : undefined
          }
        >
          {(fieldProps) => (
            <DatePicker
              {...fieldProps}
              required
              name="actualMoveOutDateManila"
              defaultValue={todayManila}
            />
          )}
        </Field>
      )}

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
  onSaved: (message: string, tone?: SavedFeedbackTone) => void | Promise<void>;
}) {
  return (
    <Dialog
      open={Boolean(assignment)}
      onClose={onClose}
      title={
        assignment
          ? `Move out: Room ${assignment.roomNumber}`
          : "Record move-out"
      }
      description={`Ends ${tenantName}'s stay and frees up the room.`}
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

function TenantNotesForm({
  tenant,
  notes,
  onClose,
  onNotesChanged,
  onConfirmOpenChange,
}: {
  tenant: TenantDto;
  notes: TenantNoteDto[];
  onClose: () => void;
  onNotesChanged: () => void | Promise<void>;
  onConfirmOpenChange?: (open: boolean) => void;
}) {
  const isArchived = tenant.archivedAt !== null;
  const [content, setContent] = useState("");
  const [syncedPropNotes, setSyncedPropNotes] = useState(notes);
  const [items, setItems] = useState(notes);
  if (syncedPropNotes !== notes) {
    setSyncedPropNotes(notes);
    setItems(notes);
  }

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingNote, setConfirmingNote] = useState<TenantNoteDto | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function setDeleteTarget(note: TenantNoteDto | null) {
    setConfirmingNote(note);
    onConfirmOpenChange?.(note !== null);
  }
  const [state, submitAction, pending] = useActionState(
    async (
      prev: TenantNoteActionResult,
      formData: FormData,
    ): Promise<TenantNoteActionResult> => {
      const res = await createTenantNoteAction(prev, formData);
      if (res.status === "saved" && res.note) {
        const addedNote = res.note;
        setContent("");
        setItems((current) => [
          addedNote,
          ...current.filter((entry) => entry.id !== addedNote.id),
        ]);
        toast.success(res.message);
        await onNotesChanged();
      }
      return res;
    },
    { status: "idle" },
  );

  async function handleDelete(noteId: string) {
    if (deletingId || pending || isArchived) return;
    setDeleteError(null);
    setDeletingId(noteId);
    try {
      const res = await deleteTenantNoteAction({
        tenantId: tenant.id,
        noteId,
      });
      if (res.status === "saved") {
        setDeleteTarget(null);
        setItems((current) => current.filter((entry) => entry.id !== noteId));
        toast.success(res.message);
        await onNotesChanged();
      } else if (res.status === "error") {
        setDeleteError(res.message);
      }
    } finally {
      setDeletingId(null);
    }
  }

  const busy = pending || deletingId !== null;

  return (
    <div className="grid gap-4">
      {state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}

      {isArchived ? (
        <Alert tone="info" role="status">
          Restore this archived tenant profile before adding or deleting notes.
        </Alert>
      ) : (
        <form action={submitAction} className="grid gap-2.5">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <Field
            id="tenant-note-content"
            label="Add note"
            error={
              state.status === "error" ? state.fieldErrors.content : undefined
            }
          >
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                name="content"
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write a separate note for this tenant"
              />
            )}
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending} disabled={busy}>
              {pending ? "Saving…" : "Add note"}
            </Button>
          </div>
        </form>
      )}

      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Recorded notes
          </span>
          <CountPill>{items.length}</CountPill>
        </div>
        {items.length === 0 ? (
          <div className="border-t border-border">
            <TableEmptyState
              illustrationSize="xs"
              className="py-6 sm:py-6"
              title="No notes recorded"
              description="No notes recorded for this tenant yet."
            />
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto border-t border-border pr-1">
            {items.map((note) => (
              <li key={note.id} className="grid gap-1.5 py-3 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <time
                    dateTime={note.createdAt}
                    className="text-xs font-medium text-muted-foreground tabular-nums"
                  >
                    {formatManilaDateTime(new Date(note.createdAt))}
                  </time>
                  {!isArchived && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-danger"
                      loading={deletingId === note.id}
                      disabled={busy}
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(note);
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {note.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingNote !== null}
        onClose={() => {
          if (deletingId !== null) return;
          setDeleteError(null);
          setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (confirmingNote) void handleDelete(confirmingNote.id);
        }}
        title="Delete tenant note?"
        description="This timestamped note will be removed from this tenant's record."
        details={
          confirmingNote ? (
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">
                {formatManilaDateTime(new Date(confirmingNote.createdAt))}
              </span>
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-foreground">
                {confirmingNote.content}
              </p>
            </div>
          ) : null
        }
        errorMessage={deleteError}
        confirmLabel="Delete note"
        confirmVariant="danger"
        loading={confirmingNote !== null && deletingId === confirmingNote.id}
      />
    </div>
  );
}

export function TenantNotesDialog({
  tenant,
  notes,
  onClose,
  onNotesChanged,
}: {
  tenant: TenantDto | null;
  notes: TenantNoteDto[];
  onClose: () => void;
  onNotesChanged: () => void | Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Dialog
      open={Boolean(tenant)}
      onClose={() => {
        setConfirmOpen(false);
        onClose();
      }}
      dismissDisabled={confirmOpen}
      title={tenant ? `Notes: ${tenant.fullName}` : "Tenant notes"}
      description="Add and review separate timestamped notes for this tenant."
    >
      {tenant && (
        <TenantNotesForm
          key={tenant.id}
          tenant={tenant}
          notes={notes}
          onClose={() => {
            setConfirmOpen(false);
            onClose();
          }}
          onNotesChanged={onNotesChanged}
          onConfirmOpenChange={setConfirmOpen}
        />
      )}
    </Dialog>
  );
}
