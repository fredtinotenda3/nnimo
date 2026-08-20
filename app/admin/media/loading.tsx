import { Skeleton } from "@/components/ui/loading-state";

/** Added Phase 9. Media is a two-up card grid, not a table — see list-loading.tsx for the table variant used by the other admin listings. */
export default function MediaLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-8 w-40" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-32" />
        ))}
      </div>

      <ul className="grid gap-5 lg:grid-cols-2" role="status" aria-label="Loading media">
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index} className="flex gap-4 border border-border p-4">
            <Skeleton className="h-20 w-20 shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-4 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
