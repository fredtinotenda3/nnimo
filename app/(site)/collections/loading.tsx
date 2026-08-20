import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/loading-state";

/** Added Phase 9. Mirrors the intro + card grid on /collections. */
export default function CollectionsLoading() {
  return (
    <Section className="pt-32 lg:pt-40">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-4 h-10 w-64" />
      <Skeleton className="mt-8 h-5 w-full max-w-2xl" />

      <ul
        className="mt-16 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3"
        role="status"
        aria-label="Loading collections"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index}>
            <Skeleton className="aspect-[4/5] w-full" />
            <Skeleton className="mt-4 h-4 w-2/3" />
          </li>
        ))}
      </ul>
    </Section>
  );
}
