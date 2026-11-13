type RecoveryEvent = { id: string; ownerUserId: string; action: string };
type RecoveryNotification = { id: string; title: string; href: string };

export function projectRecoveryNotification(
  event: RecoveryEvent,
  authorizedOwnerId: string,
): RecoveryNotification | null {
  if (
    event.ownerUserId !== authorizedOwnerId ||
    event.action !== "RESET_COMPLETED"
  )
    return null;
  return {
    id: event.id,
    title: "Your password was updated",
    href: "/auth/reset-password",
  };
}
