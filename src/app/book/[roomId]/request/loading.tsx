import { FormPageSkeleton } from "@/components/common/page-skeletons";

export default function PublicRoomRequestLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <FormPageSkeleton withSummary />
    </div>
  );
}
