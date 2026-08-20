import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/loading-state";

/** Added Phase 9. `getCartView` re-checks stock/pricing on every load. */
export default function CartLoading() {
  return (
    <Section className="pt-32 lg:pt-40">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-10 w-40" />

      <div className="mt-14 grid gap-12 lg:grid-cols-12 lg:gap-16" role="status" aria-label="Loading your cart">
        <div className="lg:col-span-7">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex gap-4 border-b border-border py-6">
              <Skeleton className="h-24 w-20 shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/4" />
              </div>
            </div>
          ))}
        </div>
        <div className="lg:col-span-5">
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </Section>
  );
}
