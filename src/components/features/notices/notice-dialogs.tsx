"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createNoticeAction,
  updateNoticeAction,
} from "@/features/notices/actions";
import {
  formatNoticeSmsText,
  NOTICE_AUDIENCE_LABELS,
  NOTICE_AUDIENCES,
  type NoticeAudienceValue,
  type NoticeDto,
  type NoticeLifecycleStatus,
  type NoticeRoomOptionDto,
  type NoticeTenantOptionDto,
} from "@/features/notices/schemas";
import { estimateSmsSegments } from "@/features/sms/schemas";
import { addManilaDays, formatManilaDate } from "@/lib/dates";

export const NOTICE_LIFECYCLE_TONE: Record<
  NoticeLifecycleStatus,
  "success" | "info" | "neutral" | "warning"
> = {
  SENT: "success",
  SCHEDULED: "info",
  ARCHIVED: "neutral",
};

export function NoticeFormDialog({
  open,
  notice,
  todayManila,
  rooms,
  tenants,
  smsConfigured,
  businessName,
  onClose,
  onSaved,
}: {
  open: boolean;
  notice: NoticeDto | null;
  todayManila: string;
  rooms: NoticeRoomOptionDto[];
  tenants: NoticeTenantOptionDto[];
  smsConfigured: boolean;
  businessName: string;
  onClose: () => void;
  onSaved: (message: string, noticeId?: string) => void | Promise<void>;
}) {
  const isEditing = Boolean(notice);
  const boardingRooms = rooms.filter((r) => r.building === "BOARDING");
  const [audience, setAudience] = useState<NoticeAudienceValue>(
    notice?.audience ?? "EVERYONE",
  );
  const [roomId, setRoomId] = useState(
    notice?.roomId ?? boardingRooms[0]?.id ?? "",
  );
  const [tenantId, setTenantId] = useState(
    notice?.tenantId ?? tenants[0]?.id ?? "",
  );
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const initialScheduled = Boolean(
    notice && notice.startDateManila > todayManila,
  );
  const [scheduleForLater, setScheduleForLater] = useState(initialScheduled);
  const [scheduledDateManila, setScheduledDateManila] = useState(
    initialScheduled && notice
      ? notice.startDateManila
      : addManilaDays(todayManila, 1),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectiveStartDate = scheduleForLater
    ? scheduledDateManila
    : (notice?.startDateManila ?? todayManila);
  const effectiveEndDate = addManilaDays(effectiveStartDate, 7);
  const isScheduledForFuture =
    scheduleForLater && scheduledDateManila > todayManila;

  const isDirty =
    isEditing &&
    notice !== null &&
    (audience !== notice.audience ||
      (audience === "ROOM" && roomId !== (notice.roomId ?? "")) ||
      (audience === "TENANT" && tenantId !== (notice.tenantId ?? "")) ||
      title !== notice.title ||
      body !== notice.body ||
      effectiveStartDate !== notice.startDateManila);

  function handleDiscardChanges() {
    if (!notice) return;
    const wasScheduled = notice.startDateManila > todayManila;
    setAudience(notice.audience);
    setRoomId(notice.roomId ?? boardingRooms[0]?.id ?? "");
    setTenantId(notice.tenantId ?? tenants[0]?.id ?? "");
    setTitle(notice.title);
    setBody(notice.body);
    setScheduleForLater(wasScheduled);
    setScheduledDateManila(
      wasScheduled ? notice.startDateManila : addManilaDays(todayManila, 1),
    );
    setErrorMessage(null);
  }
  const smsPreviewText = formatNoticeSmsText({
    title: title || "Notice title",
    body: body || "Your message will appear here.",
    businessName,
  });
  const smsEstimate = estimateSmsSegments(smsPreviewText);

  function handleAudienceChange(next: NoticeAudienceValue) {
    setAudience(next);
    if (next === "ROOM" && !roomId) {
      setRoomId(boardingRooms[0]?.id ?? "");
    }
    if (next === "TENANT" && !tenantId) {
      setTenantId(tenants[0]?.id ?? "");
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData();
    formData.set("audience", audience);
    if (audience === "ROOM") {
      formData.set("roomId", roomId);
    } else if (audience === "TENANT") {
      formData.set("tenantId", tenantId);
    }
    formData.set("title", title);
    formData.set("body", body);
    formData.set("startDateManila", effectiveStartDate);
    formData.set("endDateManila", effectiveEndDate);

    if (notice) {
      formData.set("noticeId", notice.id);
      formData.set("expectedVersion", String(notice.version));
    }

    startTransition(async () => {
      const result = notice
        ? await updateNoticeAction({ status: "idle" }, formData)
        : await createNoticeAction({ status: "idle" }, formData);

      if (result.status === "error") {
        setErrorMessage(result.message);
        return;
      }

      if (result.status === "saved") {
        await onSaved(result.message, result.noticeId);
        onClose();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissDisabled={pending}
      maxWidthClassName="max-w-xl"
      title={isEditing ? "Edit notice" : "Send SMS notice"}
      description="SMS notices are for boarding house tenants only. Send right away or schedule for a later date."
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        {errorMessage && (
          <Alert tone="danger" role="alert">
            {errorMessage}
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="notice-audience"
            label="Audience"
            required
            className={audience === "EVERYONE" ? "sm:col-span-2" : undefined}
          >
            {(fieldProps) => (
              <Select
                {...fieldProps}
                value={audience}
                onChange={(e) =>
                  handleAudienceChange(e.target.value as NoticeAudienceValue)
                }
                disabled={pending}
              >
                {NOTICE_AUDIENCES.map((value) => (
                  <option key={value} value={value}>
                    {NOTICE_AUDIENCE_LABELS[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {audience === "ROOM" && (
            <Field id="notice-room" label="Boarding room" required>
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  disabled={pending || boardingRooms.length === 0}
                >
                  {boardingRooms.length === 0 ? (
                    <option value="">No active boarding rooms</option>
                  ) : (
                    boardingRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        Room {room.number}
                        {room.floor ? ` (${room.floor})` : ""}
                      </option>
                    ))
                  )}
                </Select>
              )}
            </Field>
          )}

          {audience === "TENANT" && (
            <Field id="notice-tenant" label="Boarder" required>
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  disabled={pending || tenants.length === 0}
                >
                  {tenants.length === 0 ? (
                    <option value="">No active boarders</option>
                  ) : (
                    tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.fullName}
                      </option>
                    ))
                  )}
                </Select>
              )}
            </Field>
          )}
        </div>

        <Field id="notice-title" label="Title" required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              placeholder="e.g., Scheduled water tank cleaning"
              disabled={pending}
            />
          )}
        </Field>

        <Field id="notice-body" label="Message" required>
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={3000}
              placeholder="Enter the announcement details, timing, and instructions."
              disabled={pending}
            />
          )}
        </Field>

        <div className="grid gap-3">
          <Checkbox
            id="notice-schedule-toggle"
            checked={scheduleForLater}
            disabled={pending}
            onChange={(event) => {
              const checked = event.target.checked;
              setScheduleForLater(checked);
              if (checked && scheduledDateManila <= todayManila) {
                setScheduledDateManila(addManilaDays(todayManila, 1));
              }
            }}
            label="Schedule send for a later date (optional)"
          />

          {scheduleForLater && (
            <Field id="notice-start" label="Send date" required>
              {(fieldProps) => (
                <DatePicker
                  {...fieldProps}
                  required
                  value={scheduledDateManila}
                  onValueChange={setScheduledDateManila}
                  disabled={pending}
                />
              )}
            </Field>
          )}
        </div>

        {!isEditing &&
          (!smsConfigured ? (
            <Alert tone="info">
              Texting is not connected yet. You can still save this notice and
              copy it for Messenger or Viber.
            </Alert>
          ) : (
            <div className="grid gap-1.5 rounded-control border border-border bg-surface-muted/50 p-3 text-xs">
              <p className="font-medium text-foreground">
                {isScheduledForFuture
                  ? `Scheduled SMS — will text automatically on ${formatManilaDate(scheduledDateManila)}`
                  : "Sends right away via Semaphore"}
              </p>
              <p className="break-words text-muted-foreground">
                {smsPreviewText}
              </p>
              <p className="text-muted-foreground tabular-nums">
                {smsEstimate.length} characters, {smsEstimate.segments}{" "}
                {smsEstimate.segments === 1 ? "text credit" : "text credits"}{" "}
                per recipient
              </p>
            </div>
          ))}

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border pt-4">
          {isDirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDiscardChanges}
              disabled={pending}
            >
              Discard changes
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={pending}
            disabled={!isEditing && !smsConfigured}
          >
            {isEditing
              ? "Save changes"
              : isScheduledForFuture
                ? "Schedule SMS notice"
                : "Send SMS notice"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
