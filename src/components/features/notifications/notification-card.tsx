"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ActionLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RowActionMenu,
  type RowActionItem,
} from "@/components/ui/row-action-menu";
import {
  getNotificationCategory,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_TONE_LABELS,
  type NotificationTone,
  type OwnerNotification,
} from "@/features/notifications/schemas";
import { cn } from "@/lib/cn";
import { formatManilaDateTime } from "@/lib/dates";

export type NotificationRowAction = "read" | "unread" | "delete";

const TONE_BADGE_MAP: Record<NotificationTone, "warning" | "info" | "success"> =
  {
    warning: "warning",
    info: "info",
    success: "success",
  };

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6.25 3.75 10.5 8l-4.25 4.25" />
    </svg>
  );
}

type NotificationCardProps = {
  notification: OwnerNotification;
  density?: "compact" | "page";
  selected?: boolean;
  onToggleSelect?: (key: string) => void;
  onNavigate?: () => void;
  onRequestAction?: (
    action: NotificationRowAction,
    notification: OwnerNotification,
  ) => void;
  busy?: boolean;
};

/**
 * Static flat notification card keeping 90-95% neutral surface hierarchy
 * without card hover lift or background transitions.
 */
export function NotificationCard({
  notification,
  density = "compact",
  selected = false,
  onToggleSelect,
  onNavigate,
  onRequestAction,
  busy = false,
}: NotificationCardProps) {
  const category = getNotificationCategory(notification.key);
  const categoryLabel = NOTIFICATION_CATEGORY_LABELS[category];
  const messageLines = notification.message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (density === "compact") {
    return (
      <Link
        href={notification.destination}
        {...(onNavigate ? { onClick: onNavigate } : {})}
        className="flex items-start px-2 py-2.5 text-left transition-colors duration-(--duration-control) ease-(--ease-control) hover:bg-surface-muted/70"
      >
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-muted-foreground">
              {categoryLabel}
            </span>
            {!notification.read ? (
              <span className="inline-flex shrink-0 items-center rounded-control border border-primary/25 bg-accent px-1.5 py-0.5 text-[11px] font-medium leading-none text-accent-foreground">
                Unread
              </span>
            ) : (
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                Read
              </span>
            )}
          </div>

          <p
            className={cn(
              "text-xs leading-4.5 text-foreground",
              notification.read ? "font-medium" : "font-semibold",
            )}
          >
            {notification.title}
          </p>

          {messageLines.length > 0 && (
            <div className="grid gap-0.5 text-xs leading-4.5 text-muted-foreground tabular-nums">
              {messageLines.map((line, index) => (
                <p key={index} className="break-words">
                  {line}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <time
              dateTime={notification.createdAt}
              className="text-[11px] text-muted-foreground tabular-nums"
            >
              {formatManilaDateTime(new Date(notification.createdAt))}
            </time>
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </div>
        </div>
      </Link>
    );
  }

  const rowActions: RowActionItem[] = onRequestAction
    ? [
        notification.read
          ? {
              id: "mark-unread",
              label: "Mark as unread",
              disabled: busy,
              onSelect: () => onRequestAction("unread", notification),
            }
          : {
              id: "mark-read",
              label: "Mark as read",
              disabled: busy,
              onSelect: () => onRequestAction("read", notification),
            },
        {
          id: "delete",
          label: "Delete",
          tone: "danger",
          disabled: busy,
          onSelect: () => onRequestAction("delete", notification),
        },
      ]
    : [];

  return (
    <article
      className={cn(
        "flex items-start gap-2 rounded-panel border p-3.5 sm:gap-3 sm:p-5",
        selected
          ? "border-primary bg-surface"
          : notification.read
            ? "border-border bg-background/65"
            : "border-control-border/80 bg-surface",
      )}
    >
      {onToggleSelect && (
        <div className="shrink-0 pt-0.5">
          <Checkbox
            checked={selected}
            disabled={busy}
            onChange={() => onToggleSelect(notification.key)}
            className="min-h-11 min-w-11 justify-center gap-0"
            label={<span className="sr-only">Select {notification.title}</span>}
          />
        </div>
      )}

      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={notification.destination}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            className="grid min-w-0 flex-1 gap-1.5 rounded-control pt-1 text-left"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {categoryLabel}
              </span>
              <Badge tone={TONE_BADGE_MAP[notification.tone]}>
                {NOTIFICATION_TONE_LABELS[notification.tone]}
              </Badge>
              {!notification.read ? (
                <Badge className="border-primary/25 bg-accent text-accent-foreground">
                  Unread
                </Badge>
              ) : (
                <Badge tone="neutral">Read</Badge>
              )}
            </div>

            <h3
              className={cn(
                "text-sm leading-5 text-foreground sm:text-base sm:leading-6",
                notification.read ? "font-medium" : "font-semibold",
              )}
            >
              {notification.title}
            </h3>

            {messageLines.length > 0 && (
              <div className="grid gap-0.5 text-sm leading-5 text-muted-foreground tabular-nums">
                {messageLines.map((line, index) => (
                  <p key={index} className="break-words">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </Link>

          {rowActions.length > 0 && (
            <div className="shrink-0 pt-0.5">
              <RowActionMenu
                label={`Actions for ${notification.title}`}
                items={rowActions}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground tabular-nums">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <time dateTime={notification.createdAt}>
              Created {formatManilaDateTime(new Date(notification.createdAt))}
            </time>
            {notification.readAt && (
              <span>
                Read {formatManilaDateTime(new Date(notification.readAt))}
              </span>
            )}
          </div>
          <ActionLink
            href={notification.destination}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            size="sm"
            className="ml-auto"
          >
            Open record
          </ActionLink>
        </div>
      </div>
    </article>
  );
}
