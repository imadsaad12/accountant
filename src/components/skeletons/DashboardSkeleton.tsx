import { Skeleton } from "./Skeleton";

export function DashboardSkeleton() {
  return (
    <div>
      {/* Stat cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-dark-card border border-dark-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="w-20 h-3" />
              <Skeleton className="w-9 h-9 rounded-xl" />
            </div>
            <Skeleton className="w-28 h-7 mb-2" />
            <Skeleton className="w-16 h-3" />
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-dark-card border border-dark-border rounded-xl p-5">
          <Skeleton className="w-32 h-4 mb-5" />
          <Skeleton className="w-full h-52 rounded-lg" />
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-5">
          <Skeleton className="w-28 h-4 mb-5" />
          <Skeleton className="w-40 h-40 rounded-full mx-auto mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="w-3 h-3 rounded-full" />
                <Skeleton className="w-20 h-3" />
                <Skeleton className="w-12 h-3 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent invoices + low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-border">
            <Skeleton className="w-36 h-4" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between border-b border-dark-border/50 last:border-0">
              <div className="space-y-1.5">
                <Skeleton className="w-24 h-4" />
                <Skeleton className="w-16 h-3" />
              </div>
              <Skeleton className="w-16 h-6 rounded-full" />
            </div>
          ))}
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-border">
            <Skeleton className="w-28 h-4" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between border-b border-dark-border/50 last:border-0">
              <Skeleton className="w-32 h-4" />
              <Skeleton className="w-20 h-6 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
