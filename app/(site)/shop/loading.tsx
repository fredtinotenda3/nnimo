import { Section } from "@/components/ui/section";
import { LoadingState, Skeleton } from "@/components/ui/loading-state";

/**
 * Added Phase 9. `/shop` runs a filtered, sorted, paginated query on every
 * navigation (`force-dynamic`), so changing a filter or page has a real gap
 * before the grid updates. Without a loading.tsx, Next holds the previous
 * grid on screen during that gap, which reads as a click that did nothing.
 */
export default function ShopLoading() {
  return (
    <Section className="pt-32 lg:pt-40">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-10 w-40" />
      <Skeleton className="mt-8 h-5 w-full max-w-2xl" />

      <div className="mt-14 flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-28" />
        ))}
      </div>

      <div className="mt-10">
        <Skeleton className="h-4 w-24" />
      </div>

      <LoadingState label="Loading the catalogue" className="sr-only" rows={0} />
      <ul className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index}>
            <Skeleton className="aspect-[4/5] w-full" />
            <Skeleton className="mt-4 h-4 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/3" />
          </li>
        ))}
      </ul>
    </Section>
  );
}
