"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createMaintenanceRequestAction } from "@/features/maintenance/actions";
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_PRIORITY_LABELS,
  type MaintenanceRequestDto,
  type MaintenanceRoomOptionDto,
} from "@/features/maintenance/schemas";
import { ROOM_BUILDING_LABELS } from "@/features/rooms/schemas";
import {
  ATTACHMENT_ACCEPT_ATTR,
  MAINTENANCE_PRIORITY_TONE,
  formatByteSize,
  useAttachmentUploader,
} from "./maintenance-shared";

export function MaintenanceCreateForm({
  rooms,
  proofMaxMb,
  proofMaxFilesPerRecord,
  initialRoomId = null,
}: {
  rooms: MaintenanceRoomOptionDto[];
  proofMaxMb: number;
  proofMaxFilesPerRecord: number;
  initialRoomId?: string | null;
}) {
  const router = useRouter();
  const defaultRoomId =
    (initialRoomId && rooms.some((room) => room.id === initialRoomId)
      ? initialRoomId
      : rooms[0]?.id) ?? "";

  const [roomId, setRoomId] = useState(defaultRoomId);
  const [category, setCategory] =
    useState<MaintenanceRequestDto["category"]>("PLUMBING");
  const [priority, setPriority] =
    useState<MaintenanceRequestDto["priority"]>("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const uploader = useAttachmentUploader({
    maxMb: proofMaxMb,
    remainingSlots: proofMaxFilesPerRecord,
  });

  const selectedRoom = rooms.find((room) => room.id === roomId) ?? null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setErrorMessage(null);

    if (uploader.uploading) {
      setErrorMessage("Wait for selected attachment uploads to finish.");
      return;
    }

    startTransition(async () => {
      const result = await createMaintenanceRequestAction({
        roomId,
        bedId: null,
        title,
        description,
        category,
        priority,
        attachmentIntentIds: uploader.readyIntentIds,
      });

      if (result.status === "error") {
        setErrorMessage(result.message);
        return;
      }

      if (result.status === "saved") {
        router.push(
          result.requestId
            ? `/maintenance/${result.requestId}?created=1`
            : "/maintenance",
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Log maintenance request
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Record a room repair issue and attach optional inspection photos or
            contractor quotes.
          </p>
        </div>

        <Link
          href="/maintenance"
          className={buttonClasses({ variant: "secondary", size: "md" })}
        >
          Back to maintenance
        </Link>
      </header>

      {rooms.length === 0 && (
        <Alert tone="warning" role="alert">
          Add or restore an active room before logging a maintenance request.{" "}
          <Link href="/rooms/new" className="underline underline-offset-2">
            Add a room
          </Link>
          .
        </Alert>
      )}

      {errorMessage && (
        <Alert tone="danger" role="alert">
          {errorMessage}
        </Alert>
      )}

      <CompactFormScope>
        <form
          onSubmit={handleSubmit}
          className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)] xl:items-start"
        >
          <div className="grid gap-5">
            <Card className="grid gap-4">
              <div className="grid gap-0.5">
                <h2 className="text-base font-semibold text-foreground">
                  Issue details
                </h2>
                <p className="text-xs text-muted-foreground">
                  Choose the affected room, repair category, and urgency.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="maint-create-room" label="Room" required>
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      disabled={pending || rooms.length === 0}
                    >
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          Room {room.number} (
                          {ROOM_BUILDING_LABELS[room.building]}
                          {room.floor ? `, ${room.floor}` : ""})
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field id="maint-create-category" label="Category" required>
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      value={category}
                      onChange={(e) =>
                        setCategory(
                          e.target.value as MaintenanceRequestDto["category"],
                        )
                      }
                      disabled={pending}
                    >
                      {MAINTENANCE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {MAINTENANCE_CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field id="maint-create-priority" label="Priority" required>
                  {(fieldProps) => (
                    <Select
                      {...fieldProps}
                      value={priority}
                      onChange={(e) =>
                        setPriority(
                          e.target.value as MaintenanceRequestDto["priority"],
                        )
                      }
                      disabled={pending}
                    >
                      {MAINTENANCE_PRIORITIES.map((prio) => (
                        <option key={prio} value={prio}>
                          {MAINTENANCE_PRIORITY_LABELS[prio]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>

              <Field id="maint-create-title" label="Issue summary" required>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Bathroom pipe leak or aircon fan rattle"
                    disabled={pending}
                  />
                )}
              </Field>

              <Field id="maint-create-desc" label="Details & location" required>
                {(fieldProps) => (
                  <Textarea
                    {...fieldProps}
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={2000}
                    placeholder="Describe what needs inspection or repair."
                    disabled={pending}
                  />
                )}
              </Field>
            </Card>

            <Card className="grid gap-4">
              <div className="grid gap-0.5">
                <h2 className="text-base font-semibold text-foreground">
                  Photos or quotes (optional)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Up to {proofMaxFilesPerRecord} file(s), max {proofMaxMb} MB
                  each (JPG, PNG, WebP, HEIC, PDF).
                </p>
              </div>

              <Field
                id="maint-create-files"
                label="Select files"
                description="Files upload directly before saving the request."
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="file"
                    multiple
                    accept={ATTACHMENT_ACCEPT_ATTR}
                    onChange={uploader.handleFileSelect}
                    disabled={pending}
                  />
                )}
              </Field>

              {uploader.notice && (
                <Alert tone="warning" role="status">
                  {uploader.notice}
                </Alert>
              )}

              {uploader.items.length > 0 && (
                <ul className="grid gap-2">
                  {uploader.items.map((item) => (
                    <li
                      key={item.localId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface-muted px-3 py-2 text-xs"
                    >
                      <div className="grid min-w-0 gap-0.5">
                        <p className="truncate font-medium text-foreground">
                          {item.fileName}
                        </p>
                        <p className="text-muted-foreground tabular-nums">
                          {formatByteSize(item.byteSize)}
                        </p>
                        <p className="text-muted-foreground">
                          {item.status === "uploading"
                            ? "Uploading…"
                            : item.status === "ready"
                              ? "Uploaded"
                              : (item.errorMessage ?? "Error")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-danger"
                        size="sm"
                        onClick={() => uploader.removeItem(item.localId)}
                        disabled={pending}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="grid gap-4 xl:sticky xl:top-6">
            <h2 className="text-base font-semibold text-foreground">
              Request summary
            </h2>

            <dl className="grid gap-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Room</dt>
                <dd className="text-right font-medium text-foreground">
                  {selectedRoom ? `Room ${selectedRoom.number}` : "None"}
                  {selectedRoom ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {ROOM_BUILDING_LABELS[selectedRoom.building]}
                    </span>
                  ) : null}
                  {selectedRoom?.floor ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {selectedRoom.floor}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="font-medium text-foreground">
                  {MAINTENANCE_CATEGORY_LABELS[category]}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Priority</dt>
                <dd>
                  <Badge tone={MAINTENANCE_PRIORITY_TONE[priority]}>
                    {MAINTENANCE_PRIORITY_LABELS[priority]}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Uploaded files</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {uploader.readyIntentIds.length} / {proofMaxFilesPerRecord}
                </dd>
              </div>
            </dl>

            <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
              After saving, you can place a maintenance hold to block new tenant
              assignments and transient stays while repairs are underway.
            </p>

            <div className="grid gap-2">
              <Button
                type="submit"
                loading={pending}
                disabled={uploader.uploading || rooms.length === 0}
              >
                {uploader.uploading
                  ? "Uploading attachments…"
                  : "Save maintenance request"}
              </Button>
              <Link
                href="/maintenance"
                className={buttonClasses({ variant: "secondary", size: "md" })}
              >
                Cancel
              </Link>
            </div>
          </Card>
        </form>
      </CompactFormScope>
    </div>
  );
}
