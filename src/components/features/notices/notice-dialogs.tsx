"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createNoticeAction,
  updateNoticeAction,
} from "@/features/notices/actions";
import {
  NOTICE_AUDIENCE_LABELS,
  NOTICE_AUDIENCES,
  type NoticeAudienceValue,
  type NoticeDto,
  type NoticeLifecycleStatus,
  type NoticeRoomOptionDto,
  type NoticeTenantOptionDto,
} from "@/features/notices/schemas";
import { ROOM_BUILDING_LABELS } from "@/features/rooms/schemas";
import { addManilaDays } from "@/lib/dates";

export const NOTICE_LIFECYCLE_TONE: Record<
  NoticeLifecycleStatus,
  "success" | "info" | "neutral" | "warning"
> = {
  ACTIVE: "success",
  SCHEDULED: "info",
  EXPIRED: "neutral",
  ARCHIVED: "warning",
};

export function NoticeFormDialog({
  open,
  notice,
  todayManila,
  rooms,
  tenants,
  onClose,
  onSaved,
}: {
  open: boolean;
  notice: NoticeDto | null;
  todayManila: string;
  rooms: NoticeRoomOptionDto[];
  tenants: NoticeTenantOptionDto[];
  onClose: () => void;
  onSaved: (message: string, noticeId?: string) => void | Promise<void>;
}) {
  const isEditing = Boolean(notice);
  const [audience, setAudience] = useState<NoticeAudienceValue>(
    notice?.audience ?? "EVERYONE",
  );
  const [roomId, setRoomId] = useState(notice?.roomId ?? rooms[0]?.id ?? "");
  const [tenantId, setTenantId] = useState(
    notice?.tenantId ?? tenants[0]?.id ?? "",
  );
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [startDateManila, setStartDateManila] = useState(
    notice?.startDateManila ?? todayManila,
  );
  const [endDateManila, setEndDateManila] = useState(
    notice?.endDateManila ?? addManilaDays(todayManila, 7),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAudienceChange(next: NoticeAudienceValue) {
    setAudience(next);
    if (next === "ROOM" && !roomId) {
      setRoomId(rooms[0]?.id ?? "");
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
    formData.set("startDateManila", startDateManila);
    formData.set("endDateManila", endDateManila);

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
      title={isEditing ? "Edit notice" : "Publish notice"}
      description="Share property announcements or targeted reminders with an explicit display window."
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
            <Field id="notice-room" label="Target room" required>
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  disabled={pending || rooms.length === 0}
                >
                  {rooms.length === 0 ? (
                    <option value="">No active rooms</option>
                  ) : (
                    rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        Room {room.number} (
                        {ROOM_BUILDING_LABELS[room.building]}
                        {room.floor ? `, ${room.floor}` : ""})
                      </option>
                    ))
                  )}
                </Select>
              )}
            </Field>
          )}

          {audience === "TENANT" && (
            <Field id="notice-tenant" label="Target tenant" required>
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  disabled={pending || tenants.length === 0}
                >
                  {tenants.length === 0 ? (
                    <option value="">No active tenants</option>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="notice-start" label="Visible from" required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="date"
                value={startDateManila}
                onChange={(e) => setStartDateManila(e.target.value)}
                disabled={pending}
              />
            )}
          </Field>

          <Field id="notice-end" label="Visible until (inclusive)" required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="date"
                value={endDateManila}
                onChange={(e) => setEndDateManila(e.target.value)}
                disabled={pending}
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap justify-end gap-2.5 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {isEditing ? "Save changes" : "Publish notice"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
