import { LoadingState, Skeleton } from "@/components/ui/loading-state";

/**
 * The loading state for every analytics route.
 *
 * Placed at the segment root so it covers the overview and all five sections —
 * they share a layout, so they should share the skeleton that stands in for it.
 *
 * These pages are `force-dynamic` and run several aggregates per request, so on
 * a cold connection there is a real gap before anything renders. Without this,
 * Next holds the previous page on screen and a range change looks like a click
 * that did nothing.
 *
 * The skeleton mirrors the real layout — header, tabs, filter bar, a row of
 * tiles, a chart — so the page does not visibly jump when the data lands.
 * `LoadingState` carries the `role="status"` announcement for screen readers.
 */
export default function AnalyticsLoading() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3 border-b border-border pb-7">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex gap-6 border-b border-border pb-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-20" />
        ))}
      </div>

      <div className="grid gap-4 border-b border-border pb-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>

      <LoadingState label="Loading analytics" rows={1} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>

      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}
