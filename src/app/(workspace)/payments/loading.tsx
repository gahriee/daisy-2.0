import { ListWorkspaceSkeleton } from "@/components/common/page-skeletons";

export default function PaymentsLoading() {
  return (
    <ListWorkspaceSkeleton metrics={3} filters={2} label="Loading payments" />
  );
}
