import { ListWorkspaceSkeleton } from "@/components/common/page-skeletons";

export default function TransientRoomsLoading() {
  return (
    <ListWorkspaceSkeleton
      metrics={4}
      filters={3}
      label="Loading transient rooms"
    />
  );
}
