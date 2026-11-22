import { ListWorkspaceSkeleton } from "@/components/common/page-skeletons";

export default function NotificationsLoading() {
  return (
    <ListWorkspaceSkeleton
      metrics={3}
      filters={3}
      label="Loading notifications"
    />
  );
}
