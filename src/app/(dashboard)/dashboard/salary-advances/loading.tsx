import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
export default function Loading() {
  return <TablePageSkeleton rows={8} hasFilters cols={5} />;
}
