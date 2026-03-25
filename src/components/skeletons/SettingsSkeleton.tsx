import { Skeleton } from "./Skeleton";

export function SettingsSkeleton() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Skeleton className="w-32 h-6 mb-2" />
        <Skeleton className="w-56 h-4" />
      </div>

      {/* Org settings card */}
      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="w-40 h-4" />
            <Skeleton className="w-52 h-3" />
          </div>
          <Skeleton className="w-16 h-8 rounded-lg" />
        </div>
        <div className="p-5 space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="w-32 h-3 mb-2" />
              <Skeleton className="w-full h-9 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* Personal preferences card */}
      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-border">
          <Skeleton className="w-36 h-4 mb-1" />
          <Skeleton className="w-48 h-3" />
        </div>
        <div className="p-5 space-y-5">
          <div>
            <Skeleton className="w-16 h-3 mb-3" />
            <div className="flex gap-3">
              <Skeleton className="flex-1 h-12 rounded-lg" />
              <Skeleton className="flex-1 h-12 rounded-lg" />
            </div>
          </div>
          <div>
            <Skeleton className="w-20 h-3 mb-3" />
            <div className="flex gap-3">
              <Skeleton className="flex-1 h-12 rounded-lg" />
              <Skeleton className="flex-1 h-12 rounded-lg" />
              <Skeleton className="flex-1 h-12 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
