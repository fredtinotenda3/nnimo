import { cn } from "@/lib/utils";
import { AVAILABILITY_LABEL } from "@/lib/catalogue";
import { Button } from "@/components/ui/button";

export type ShopFilterState = {
  q: string;
  collection: string;
  availability: string;
  sort: string;
};

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured first" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
  { value: "newest", label: "Recently added" },
] as const;

const fieldClass =
  "text-body-sm h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-foreground";

/**
 * A plain GET form, rendered on the server.
 *
 * Deliberately not a client component: filtering the catalogue is a navigation,
 * and expressing it as a real form means the shop works with JavaScript
 * disabled, every filter state is a shareable URL, results are server-rendered
 * and indexable, and the page ships no filtering JavaScript at all. A Radix
 * Select would have been prettier and strictly worse on all four counts.
 */
export function ShopFilters({
  state,
  collections,
  className,
}: {
  state: ShopFilterState;
  collections: { name: string; slug: string }[];
  className?: string;
}) {
  const hasFilters =
    Boolean(state.q) ||
    Boolean(state.collection) ||
    Boolean(state.availability) ||
    (Boolean(state.sort) && state.sort !== "featured");

  return (
    <form
      method="get"
      action="/shop"
      className={cn(
        "grid gap-4 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-5 lg:items-end",
        className,
      )}
    >
      <div className="lg:col-span-2">
        <label htmlFor="shop-q" className="text-label text-muted-foreground">
          Search
        </label>
        <input
          id="shop-q"
          name="q"
          type="search"
          defaultValue={state.q}
          placeholder="Piece or range"
          className={cn(fieldClass, "mt-2 placeholder:text-muted-foreground")}
        />
      </div>

      <div>
        <label htmlFor="shop-collection" className="text-label text-muted-foreground">
          Range
        </label>
        <select
          id="shop-collection"
          name="collection"
          defaultValue={state.collection}
          className={cn(fieldClass, "mt-2")}
        >
          <option value="">All ranges</option>
          {collections.map((collection) => (
            <option key={collection.slug} value={collection.slug}>
              {collection.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="shop-availability" className="text-label text-muted-foreground">
          Availability
        </label>
        <select
          id="shop-availability"
          name="availability"
          defaultValue={state.availability}
          className={cn(fieldClass, "mt-2")}
        >
          <option value="">Any</option>
          {Object.entries(AVAILABILITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="shop-sort" className="text-label text-muted-foreground">
          Sort
        </label>
        <select
          id="shop-sort"
          name="sort"
          defaultValue={state.sort || "featured"}
          className={cn(fieldClass, "mt-2")}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3 sm:col-span-2 lg:col-span-5">
        <Button type="submit" size="sm">
          Apply
        </Button>
        {hasFilters ? (
          <Button asChild size="sm" variant="ghost">
            <a href="/shop">Clear</a>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
