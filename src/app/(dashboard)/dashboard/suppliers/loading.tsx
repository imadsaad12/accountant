import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";

export default function SuppliersLoading() {
  return <TablePageSkeleton rows={8} hasFilters cols={6} />;
}
