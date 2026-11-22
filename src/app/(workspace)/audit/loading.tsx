import { ListWorkspaceSkeleton } from "@/components/common/page-skeletons";

export default function AuditLoading() {
  return (
    <ListWorkspaceSkeleton
      metrics={0}
      filters={3}
      actions={1}
      label="Loading activity history"
    />
  );
}
