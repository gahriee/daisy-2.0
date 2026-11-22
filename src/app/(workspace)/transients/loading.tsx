import { ListWorkspaceSkeleton } from "@/components/common/page-skeletons";

export default function TransientsLoading() {
  return (
    <ListWorkspaceSkeleton metrics={4} filters={1} label="Loading stays" />
  );
}
