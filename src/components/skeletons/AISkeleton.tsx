import { Skeleton } from "./Skeleton";

export function AISkeleton() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="w-32 h-5" />
          <Skeleton className="w-48 h-3" />
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-dark-card border border-dark-border rounded-xl p-4 mb-4 space-y-4 overflow-hidden">
        {/* AI message */}
        <div className="flex items-start gap-3">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="space-y-2 max-w-[70%]">
            <Skeleton className="w-64 h-4" />
            <Skeleton className="w-48 h-4" />
          </div>
        </div>
        {/* User message */}
        <div className="flex items-start gap-3 justify-end">
          <div className="space-y-2 max-w-[60%]">
            <Skeleton className="w-44 h-4 ml-auto" />
          </div>
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
        </div>
        {/* AI message */}
        <div className="flex items-start gap-3">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="space-y-2 max-w-[70%]">
            <Skeleton className="w-72 h-4" />
            <Skeleton className="w-56 h-4" />
            <Skeleton className="w-40 h-4" />
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-3 flex gap-3 items-center">
        <Skeleton className="flex-1 h-10 rounded-lg" />
        <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
      </div>
    </div>
  );
}
