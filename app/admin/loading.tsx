import { Skeleton } from "@/components/ui/loading-state";

/**
 * Added Phase 9. The dashboard runs several aggregate queries across
 * commerce, inventory and enquiries on every load — previously the last
 * admin page stayed on screen through that gap.
 */
export default function AdminDashboardLoading() {
  return (
    <div className="flex flex-col gap-12">
      <div className="border-b border-border pb-7">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-8 w-72" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </div>

      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <div key={sectionIndex} className="flex flex-col gap-5" role="status" aria-label="Loading dashboard">
          <Skeleton className="h-6 w-32" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, tileIndex) => (
              <Skeleton key={tileIndex} className="h-24 w-full" />
            ))}
          </div>
        </div>
      ))}

      <Skeleton className="h-64 w-full" />
    </div>
  );
}
