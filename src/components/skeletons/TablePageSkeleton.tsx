import { Skeleton } from "./Skeleton";

interface TablePageSkeletonProps {
  /** Number of fake table rows to render */
  rows?: number;
  /** Show a filter/search bar above the table */
  hasFilters?: boolean;
  /** Number of stat cards to show before the table (e.g. tax, reports) */
  statCards?: number;
  /** Number of columns in the table */
  cols?: number;
}

export function TablePageSkeleton({
  rows = 8,
  hasFilters = false,
  statCards = 0,
  cols = 5,
}: TablePageSkeletonProps) {
  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="w-40 h-5" />
            <Skeleton className="w-24 h-3" />
          </div>
        </div>
        <Skeleton className="w-28 h-9 rounded-lg" />
      </div>

      {/* Stat cards */}
      {statCards > 0 && (
        <div className={`grid grid-cols-2 md:grid-cols-${Math.min(statCards, 4)} gap-4 mb-6`}>
          {Array.from({ length: statCards }).map((_, i) => (
            <div key={i} className="bg-dark-card border border-dark-border rounded-xl p-4">
              <Skeleton className="w-24 h-3 mb-3" />
              <Skeleton className="w-32 h-7" />
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      {hasFilters && (
        <div className="bg-dark-card border border-dark-border rounded-xl p-4 mb-6">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="w-36 h-9 rounded-lg" />
            <Skeleton className="w-36 h-9 rounded-lg" />
            <Skeleton className="flex-1 min-w-[200px] h-9 rounded-lg" />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        {/* Header row */}
        <div className="bg-dark-bg/50 px-4 py-3 flex gap-4 border-b border-dark-border">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 rounded" style={{ width: `${70 + (i % 3) * 30}px` }} />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex gap-4 items-center border-b border-dark-border/50 last:border-0">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton
                key={j}
                className="h-4 rounded"
                style={{ width: `${60 + ((i + j) % 4) * 25}px` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
