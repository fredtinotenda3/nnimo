import { Skeleton } from "@/components/ui/loading-state";

/**
 * Added Phase 9. Every admin listing route (Products, Orders, Customers,
 * Collections, Enquiries, Media) shares the same shape — `PageHeader`, a
 * `FilterBar`, a `Table` — so they share one skeleton rather than each
 * hand-rolling its own. Each admin listing page is `force-dynamic` and reruns
 * its filtered query on every navigation; without this, the previous list
 * stayed on screen through that gap, which reads as an unresponsive filter.
 */
export function AdminListLoading({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-8 w-48" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-32" />
        ))}
      </div>

      <div role="status" aria-label="Loading list" className="overflow-hidden border border-border">
        <div className="flex gap-4 border-b border-border bg-surface-sunken px-4 py-3">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 border-b border-border px-4 py-4 last:border-b-0">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton key={colIndex} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
