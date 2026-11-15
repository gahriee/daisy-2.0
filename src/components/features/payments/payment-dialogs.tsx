"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  reversePaymentAction,
  type PaymentActionResult,
} from "@/features/payments/actions";
import type {
  PaymentDto,
  PaymentStatusValue,
} from "@/features/payments/schemas";

export const PAYMENT_BADGE_TONE: Record<
  PaymentStatusValue,
  "success" | "neutral" | "warning"
> = {
  POSTED: "success",
  REVERSED: "neutral",
  REVERSAL: "warning",
};

export function ReversePaymentDialog({
  payment,
  onClose,
  onSaved,
}: {
  payment: PaymentDto | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [state, submitAction, pending] = useActionState(
    async (
      prev: PaymentActionResult,
      formData: FormData,
    ): Promise<PaymentActionResult> => {
      const result = await reversePaymentAction(prev, formData);
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
      open={payment !== null}
      onClose={pending ? () => {} : onClose}
      title="Reverse payment"
      {...(payment
        ? {
            description: `Create a linked negative reversal for ${payment.receiptNumber ?? "this payment"} (PHP ${payment.amount}) and restore allocated invoice balances.`,
          }
        : {})}
    >
      {payment && (
        <form action={submitAction} className="grid gap-4">
          <input type="hidden" name="paymentId" value={payment.id} />
          <input type="hidden" name="expectedVersion" value={payment.version} />

          {state.status === "error" && (
            <Alert tone="danger" role="alert">
              {state.message}
            </Alert>
          )}

          <Alert tone="warning" role="status">
            Posted payments stay immutable in the ledger. Reversing restores any
            allocated invoices to Issued or Partially paid and cancels
            unallocated credit from this receipt.
          </Alert>

          <Field
            id="reverse-payment-reason"
            label="Reason for reversal"
            required
            error={
              state.status === "error" ? state.fieldErrors.reason : undefined
            }
          >
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                name="reason"
                rows={3}
                maxLength={300}
                placeholder="e.g. Bounced check, wrong boarder, or duplicate entry"
              />
            )}
          </Field>

          <div className="flex flex-wrap justify-end gap-2.5 pt-2">
            <Button
              variant="secondary"
              size="md"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" size="md" variant="danger" loading={pending}>
              Confirm reversal
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
