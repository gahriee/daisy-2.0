import { ListWorkspaceSkeleton } from "@/components/common/page-skeletons";

export default function NoticesLoading() {
  return (
    <ListWorkspaceSkeleton metrics={4} filters={2} label="Loading notices" />
  );
}
