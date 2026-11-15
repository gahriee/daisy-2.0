"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoomPhotosEditor } from "@/components/features/rooms/room-photos-editor";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { CompactFormScope } from "@/components/ui/form-density";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  updateRoomTransientPublishAction,
  type TransientActionResult,
} from "@/features/transients/actions";
import type { TransientRoomOptionDto } from "@/features/transients/schemas";
import { formatPhpCurrency } from "@/lib/money";

export function TransientListingForm({
  room,
}: {
  room: TransientRoomOptionDto;
}) {
  const router = useRouter();
  const [published, setPublished] = useState(room.isTransientPublished);
  const [title, setTitle] = useState(
    room.transientTitle ?? `Room ${room.number}`,
  );
  const [dailyRate, setDailyRate] = useState(
    room.transientDailyRate ?? room.resolvedDailyRate ?? "",
  );
  const [description, setDescription] = useState(
    room.transientDescription ?? "",
  );
  const [photosUploading, setPhotosUploading] = useState(false);

  const [state, submitAction, pending] = useActionState(
    async (
      prev: TransientActionResult,
      formData: FormData,
    ): Promise<TransientActionResult> => {
      const res = await updateRoomTransientPublishAction(prev, formData);
      if (res.status === "saved") {
        router.refresh();
      }
      return res;
    },
    { status: "idle" },
  );

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Public listing: Room {room.number}
            </h1>
            <Badge tone={published ? "success" : "neutral"}>
              {published ? "Published" : "Hidden"}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Only published rooms appear on the unauthenticated /book page.
            Tenant identities and internal notes are never exposed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/transients"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Back to transients
          </Link>
          <Link
            href={`/transients/rooms/${room.id}`}
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Edit room details
          </Link>
        </div>
      </header>

      {state.status === "saved" && (
        <Alert tone="success" role="status">
          {state.message}
        </Alert>
      )}

      {state.status === "error" && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}

      <CompactFormScope>
        <form
          key={`${room.id}:${room.version}`}
          action={submitAction}
          className="grid items-start gap-5 lg:grid-cols-12"
        >
          <input type="hidden" name="roomId" value={room.id} />
          <input type="hidden" name="expectedVersion" value={room.version} />
          <input type="hidden" name="transientScope" value="WHOLE_ROOM" />

          <div className="grid gap-5 lg:col-span-8">
            <Card className="grid gap-4">
              <div className="grid gap-1">
                <h2 className="text-base font-semibold text-foreground">
                  Listing details
                </h2>
                <p className="text-xs text-muted-foreground">
                  Configure public visibility, nightly rate, and guest-facing
                  summary for Room {room.number}.
                </p>
              </div>

              <Checkbox
                name="isTransientPublished"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                label="Publish this room on /book for public transient requests"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="pub-title" label="Public title">
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      name="transientTitle"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={120}
                      placeholder={`Room ${room.number}`}
                    />
                  )}
                </Field>

                <Field
                  id="pub-rate"
                  label="Nightly rate (PHP)"
                  description="Requires a positive nightly rate before publishing."
                >
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      name="transientDailyRate"
                      value={dailyRate}
                      onChange={(e) => setDailyRate(e.target.value)}
                      placeholder="e.g. 1250.00"
                    />
                  )}
                </Field>
              </div>

              <Field id="pub-desc" label="Public summary (optional)">
                {(fieldProps) => (
                  <Textarea
                    {...fieldProps}
                    name="transientDescription"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={600}
                    placeholder="Air-conditioned room with private bath and Wi-Fi access."
                  />
                )}
              </Field>
            </Card>

            <Card className="grid gap-4">
              <div className="grid gap-1">
                <h2 className="text-base font-semibold text-foreground">
                  Public gallery &amp; preview image
                </h2>
                <p className="text-xs text-muted-foreground">
                  Choose one preview card image and up to 8 captioned photos for
                  /book visitors.
                </p>
              </div>

              <RoomPhotosEditor
                roomId={room.id}
                initialPreviewPhoto={room.previewPhoto}
                initialGalleryPhotos={room.galleryPhotos}
                disabled={pending}
                onUploadingChange={setPhotosUploading}
              />
            </Card>
          </div>

          <Card className="grid gap-4 lg:sticky lg:top-6 lg:col-span-4">
            <h2 className="text-base font-semibold text-foreground">Summary</h2>

            <dl className="grid gap-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Room</dt>
                <dd className="font-medium text-foreground">
                  Room {room.number}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Room type</dt>
                <dd className="text-right text-foreground">
                  {room.roomTypeName}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Nightly rate</dt>
                <dd className="font-semibold text-foreground tabular-nums">
                  {dailyRate.trim()
                    ? `₱${dailyRate.trim()}`
                    : room.resolvedDailyRate
                      ? formatPhpCurrency(room.resolvedDailyRate)
                      : "Unset"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Visibility</dt>
                <dd className="font-medium text-foreground">
                  {published ? "Visible on /book" : "Hidden from /book"}
                </dd>
              </div>
            </dl>

            <div className="grid gap-2.5 border-t border-border pt-3">
              <Button
                type="submit"
                size="md"
                loading={pending}
                disabled={photosUploading}
              >
                {pending
                  ? "Saving…"
                  : photosUploading
                    ? "Uploading photos…"
                    : "Save listing"}
              </Button>
              <Link
                href="/transients"
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
