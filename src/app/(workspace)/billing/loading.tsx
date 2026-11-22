import { ListWorkspaceSkeleton } from "@/components/common/page-skeletons";

export default function BillingLoading() {
  return (
    <ListWorkspaceSkeleton metrics={4} filters={2} label="Loading billing" />
  );
}
