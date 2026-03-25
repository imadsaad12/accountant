import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
export default function Loading() {
  return <TablePageSkeleton rows={10} hasFilters cols={6} />;
}
