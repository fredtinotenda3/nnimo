import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buildQuery, type PageInfo, type SearchParams } from "@/lib/admin/query";
import { cn } from "@/lib/utils";

/**
 * List-view furniture: filters, pagination, KPI tiles.
 *
 * All server components. Filtering is a plain GET form and pagination is a set
 * of links, which means the whole admin works without JavaScript, the browser
 * back button behaves, and an operator can bookmark "unpaid orders awaiting
 * dispatch" and share the URL with a colleague. A client-side filter would have
 * needed state, a loading spinner and a way to serialise itself into the URL
 * anyway — this is the version with less machinery, not more.
 */

export const filterControlClass =
  "text-body-sm h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary";

/**
 * The filter bar.
 *
 * `method="get"` puts the filters in the query string, which is what makes them
 * shareable. Any active page number is dropped on submit — page 7 of the old
 * result set is meaningless against the new one, and landing on an empty page
 * after filtering is a bug operators report as "search is broken".
 */
export function FilterBar({
  children,
  clearHref,
  hasFilters,
  submitLabel = "Apply",
}: {
  children: React.ReactNode;
  clearHref: string;
  hasFilters: boolean;
  submitLabel?: string;
}) {
  return (
    <form
      method="get"
      role="search"
      className="grid gap-4 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
    >
      {children}
      <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4">
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
        {hasFilters ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={clearHref}>Clear filters</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** One labelled filter control. */
export function FilterField({
  name,
  label,
  children,
  className,
}: {
  name: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={`filter-${name}`} className="text-label text-muted-foreground">
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** A `<select>` filter built from a label map. */
export function FilterSelect({
  name,
  value,
  options,
  anyLabel = "Any",
}: {
  name: string;
  value: string | null;
  options: { value: string; label: string }[];
  anyLabel?: string;
}) {
  return (
    <select id={`filter-${name}`} name={name} defaultValue={value ?? ""} className={filterControlClass}>
      <option value="">{anyLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function FilterSearch({
  name = "q",
  value,
  placeholder,
}: {
  name?: string;
  value: string;
  placeholder: string;
}) {
  return (
    <input
      id={`filter-${name}`}
      name={name}
      type="search"
      defaultValue={value}
      placeholder={placeholder}
      className={filterControlClass}
    />
  );
}

/**
 * Pagination.
 *
 * Previous/next rather than a numbered strip: an operator working a queue moves
 * one page at a time, and rendering 40 page links for a 1,000-row table is
 * clutter that also needs its own overflow logic. The count line is what
 * actually answers "how much is left".
 */
export function Pagination({
  info,
  basePath,
  params,
  itemLabel = "records",
}: {
  info: PageInfo;
  basePath: string;
  params: SearchParams;
  itemLabel?: string;
}) {
  if (info.total === 0) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5"
    >
      <p className="text-body-sm text-muted-foreground">
        Showing{" "}
        <span className="tabular-nums text-foreground">
          {info.from}–{info.to}
        </span>{" "}
        of <span className="tabular-nums text-foreground">{info.total}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-3">
        {info.hasPrevious ? (
          <Button asChild size="sm" variant="outline">
            <Link
              href={`${basePath}${buildQuery(params, { page: info.page - 1 })}`}
              rel="prev"
              aria-label="Previous page"
            >
              ← Previous
            </Link>
          </Button>
        ) : (
          <span className="text-body-sm text-muted-foreground/50">← Previous</span>
        )}

        <span className="text-metadata tabular-nums text-muted-foreground">
          Page {info.page} of {info.totalPages}
        </span>

        {info.hasNext ? (
          <Button asChild size="sm" variant="outline">
            <Link
              href={`${basePath}${buildQuery(params, { page: info.page + 1 })}`}
              rel="next"
              aria-label="Next page"
            >
              Next →
            </Link>
          </Button>
        ) : (
          <span className="text-body-sm text-muted-foreground/50">Next →</span>
        )}
      </div>
    </nav>
  );
}

/**
 * A KPI tile.
 *
 * `tone="attention"` marks a number that represents work waiting — unpaid
 * orders, unpriced published pieces. It is a border, not a red panel: on a
 * dashboard where everything shouts, nothing is urgent.
 */
export function StatTile({
  label,
  value,
  note,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  note?: string;
  href?: string;
  tone?: "default" | "attention" | "positive";
}) {
  const body = (
    <>
      <p className="text-label text-muted-foreground">{label}</p>
      <p className="text-heading-1 mt-2 tabular-nums">{value}</p>
      {note ? <p className="text-metadata mt-2 text-muted-foreground">{note}</p> : null}
    </>
  );

  const className = cn(
    "flex flex-col rounded-[var(--radius-md)] border bg-surface p-5 transition-colors",
    tone === "attention" && "border-l-2 border-l-accent border-border",
    tone === "positive" && "border-l-2 border-l-secondary border-border",
    tone === "default" && "border-border",
    href && "hover:border-border-strong hover:bg-surface-sunken/50",
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

export function StatGrid({ children, columns = 4 }: { children: React.ReactNode; columns?: 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2",
        columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}
