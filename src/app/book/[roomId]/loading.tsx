import { DetailPageSkeleton } from "@/components/common/page-skeletons";

export default function PublicRoomDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <DetailPageSkeleton />
    </div>
  );
}
