"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RowActionMenu,
  type RowActionItem,
} from "@/components/ui/row-action-menu";
import {
  getNotificationCategory,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_TONE_LABELS,
  type NotificationCategory,
  type NotificationTone,
  type OwnerNotification,
} from "@/features/notifications/schemas";
import { cn } from "@/lib/cn";
import { formatManilaDateTime } from "@/lib/dates";

export type NotificationRowAction = "read" | "unread" | "delete";

const TONE_ICON_STYLES: Record<NotificationTone, string> = {
  warning: "border-warning-border bg-warning-surface text-warning",
  info: "border-info-border bg-info-surface text-info",
  success: "border-success-border bg-success-surface text-success",
};

const TONE_BADGE_MAP: Record<NotificationTone, "warning" | "info" | "success"> =
  {
    warning: "warning",
    info: "info",
    success: "success",
  };

function NotificationCategoryIcon({
  category,
  className,
}: {
  category: NotificationCategory;
  className?: string;
}) {
  switch (category) {
    case "invoice":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M5.25 3.25h9.5v13.5l-2.35-1.45-2.4 1.45-2.4-1.45-2.35 1.45V3.25Z" />
          <path d="M7.75 7.25h4.5M7.75 10.25h3" />
        </svg>
      );
    case "booking_request":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <rect x="3.5" y="4.5" width="13" height="12" rx="1.75" />
          <path d="M6.75 3v3M13.25 3v3M3.5 8.25h13" />
          <path d="m7.75 12.25 1.5 1.5 3-3" />
        </svg>
      );
    case "maintenance":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12.5 3.75a3.75 3.75 0 0 0-4.95 4.95L4.1 12.15a1.5 1.5 0 1 0 2.12 2.12l3.45-3.45a3.75 3.75 0 0 0 4.95-4.95l-2.05 2.05-1.95-.42-.42-1.95 2.3-1.8Z" />
          <path d="m11.5 12 4.25 4.25" />
        </svg>
      );
    case "assignment":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="8" cy="7" r="2.75" />
          <path d="M3.75 15.75a4.5 4.5 0 0 1 8.5 0" />
          <path d="M13.75 9.25h3M15.25 7.75v3" />
        </svg>
      );
    case "settings":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M4.25 6h11.5M4.25 10h11.5M4.25 14h11.5" />
          <circle cx="7.25" cy="6" r="1.5" fill="currentColor" />
          <circle cx="12.75" cy="10" r="1.5" fill="currentColor" />
          <circle cx="8.75" cy="14" r="1.5" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M10 3.25 15.5 5.5v4.25c0 3.5-2.3 5.95-5.5 7-3.2-1.05-5.5-3.5-5.5-7V5.5L10 3.25Z" />
          <path d="m7.75 10.25 1.5 1.5 3-3" />
        </svg>
      );
  }
}

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
        className={cn(
          "flex items-start gap-3 rounded-panel border p-3 text-left",
          notification.read
            ? "border-border bg-background/65"
            : "border-control-border/80 bg-surface",
        )}
      >
        <span
          className={cn(
            "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-control border",
            notification.read
              ? "border-border bg-surface-muted text-muted-foreground"
              : TONE_ICON_STYLES[notification.tone],
          )}
        >
          <NotificationCategoryIcon category={category} className="size-4" />
        </span>

        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-muted-foreground">
              {categoryLabel}
            </span>
            {!notification.read ? (
              <span className="inline-flex shrink-0 items-center rounded-control bg-foreground px-1.5 py-0.5 text-[11px] font-medium leading-none text-surface">
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

      <Link
        href={notification.destination}
        {...(onNavigate ? { onClick: onNavigate } : {})}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-control pt-1 text-left sm:gap-3.5"
      >
        <span
          className={cn(
            "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-control border",
            notification.read
              ? "border-border bg-surface-muted text-muted-foreground"
              : TONE_ICON_STYLES[notification.tone],
          )}
        >
          <NotificationCategoryIcon category={category} className="size-4.5" />
        </span>

        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {categoryLabel}
            </span>
            <Badge tone={TONE_BADGE_MAP[notification.tone]}>
              {NOTIFICATION_TONE_LABELS[notification.tone]}
            </Badge>
            {!notification.read ? (
              <span className="inline-flex items-center rounded-control bg-foreground px-2 py-0.5 text-xs font-medium leading-4 text-surface">
                Unread
              </span>
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground tabular-nums">
            <time dateTime={notification.createdAt}>
              Created {formatManilaDateTime(new Date(notification.createdAt))}
            </time>
            {notification.readAt && (
              <span>
                Read {formatManilaDateTime(new Date(notification.readAt))}
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              Open record
              <ChevronRightIcon className="size-3.5" />
            </span>
          </div>
        </div>
      </Link>

      {rowActions.length > 0 && (
        <div className="shrink-0 pt-0.5">
          <RowActionMenu
            label={`Actions for ${notification.title}`}
            items={rowActions}
          />
        </div>
      )}
    </article>
  );
}
