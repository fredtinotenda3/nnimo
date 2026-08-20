import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/loading-state";

/** Added Phase 9. Mirrors the form + sticky order summary split. */
export default function CheckoutLoading() {
  return (
    <Section className="pt-32 lg:pt-40">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-56" />

      <div
        className="mt-14 grid gap-12 lg:grid-cols-12 lg:gap-16"
        role="status"
        aria-label="Loading checkout"
      >
        <div className="lg:col-span-7">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="mb-5 h-12 w-full" />
          ))}
        </div>
        <aside className="lg:col-span-5">
          <Skeleton className="h-64 w-full" />
        </aside>
      </div>
    </Section>
  );
}
