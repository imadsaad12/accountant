import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
export default function Loading() {
  return <TablePageSkeleton rows={6} hasFilters statCards={3} cols={4} />;
}
