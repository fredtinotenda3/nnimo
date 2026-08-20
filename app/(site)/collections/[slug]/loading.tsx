import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/loading-state";

/**
 * Added Phase 9. The real page renders either a full-bleed hero (collection
 * has a hero image) or a plain breadcrumb header — this can't know which
 * until the data resolves, so it uses the same generous top spacing as the
 * breadcrumb variant, which reads fine either way rather than guessing.
 */
export default function CollectionLoading() {
  return (
    <>
      <Section className="pb-0 pt-32 lg:pt-40">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-8 h-3 w-16" />
        <Skeleton className="mt-4 h-10 w-72" />
      </Section>

      <Section>
        <Skeleton className="h-5 w-full max-w-2xl" />
        <Skeleton className="mt-3 h-5 w-3/4 max-w-2xl" />
      </Section>

      <Section tone="sunken">
        <ul
          className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Loading this range"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <li key={index}>
              <Skeleton className="aspect-[4/5] w-full" />
              <Skeleton className="mt-4 h-4 w-3/4" />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
