import { Skeleton } from "@/components/ui/loading-state";

/**
 * Added Phase 9. This is the segment-level fallback for every `(site)` route
 * that doesn't have its own dedicated loading.tsx (Home, About, Custom,
 * Family, and the order-lookup pages) — Next.js only uses this when a more
 * specific loading.tsx isn't present, so Shop, Cart, Checkout, Collections
 * and Product pages keep the tailored skeletons defined alongside them.
 * Home, About, Custom and Family all open with the same dark full-bleed
 * hero band, so this shape is a reasonable stand-in for any of them even
 * though it's named after the homepage. Sections further down the page are
 * long enough that a full per-page mirror would be more skeleton than most
 * visitors ever wait to see past, so this covers the fold and lets the rest
 * stream in naturally once the request resolves.
 */
export default function HomeLoading() {
  return (
    <div>
      <div className="relative bg-charcoal">
        <div className="grid lg:grid-cols-2">
          <div className="flex flex-col justify-center gap-4 px-5 pb-20 pt-32 sm:px-8 lg:px-14 lg:py-32">
            <Skeleton className="h-3 w-24 bg-dark-border/40" />
            <Skeleton className="h-12 w-3/4 bg-dark-border/40" />
            <Skeleton className="mt-4 h-4 w-full max-w-md bg-dark-border/40" />
            <Skeleton className="mt-6 h-11 w-40 bg-dark-border/40" />
          </div>
          <Skeleton className="aspect-[4/5] w-full rounded-none bg-dark-border/40 lg:aspect-auto" />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-14" role="status" aria-label="Loading the homepage">
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="aspect-[4/5] w-full" />
              <Skeleton className="mt-4 h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
