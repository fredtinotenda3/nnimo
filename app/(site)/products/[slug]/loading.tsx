import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/loading-state";

/**
 * Added Phase 9. Product pages are `force-dynamic` (stock/availability must
 * be current), so a slow connection previously showed the last page's
 * content while the next product loaded. The skeleton mirrors the real
 * gallery/details split so the layout doesn't jump when it resolves.
 */
export default function ProductLoading() {
  return (
    <Section className="pt-28 lg:pt-36">
      <Skeleton className="h-4 w-64" />

      <div className="mt-10 grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7">
          <Skeleton className="aspect-[4/5] w-full" />
          <div className="mt-4 grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square w-full" />
            ))}
          </div>
        </div>

        <div className="lg:col-span-5" role="status" aria-live="polite">
          <span className="sr-only">Loading this piece</span>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-9 w-3/4" />
          <Skeleton className="mt-3 h-6 w-1/3" />
          <Skeleton className="mt-8 h-24 w-full" />
          <Skeleton className="mt-8 h-12 w-full" />
        </div>
      </div>
    </Section>
  );
}
