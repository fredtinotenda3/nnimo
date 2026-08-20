import { Skeleton } from "@/components/ui/loading-state";

/**
 * Added Phase 9. Content and Settings are long stacked-form pages rather than
 * tables — see list-loading.tsx for the table variant used by the other
 * admin sections.
 */
export function AdminFormLoading({ fields = 6 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-12">
      <div className="border-b border-border pb-7">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-8 w-48" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </div>

      <div className="flex flex-col gap-5" role="status" aria-label="Loading">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: fields }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
