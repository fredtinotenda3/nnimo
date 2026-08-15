/**
 * Search-param parsing for the admin list views.
 *
 * Every admin table is filtered, sorted and paginated in Postgres, never in
 * React (§20 of the Phase 4 brief). That means the URL is user input reaching a
 * query, so nothing here trusts it: page numbers are clamped, search terms are
 * length-capped, and enum filters are checked against the known set before they
 * can become a `where` clause.
 *
 * Prisma parameterises values, so this is not an injection defence — it is a
 * correctness and cost defence. `?page=999999999` should not become an OFFSET
 * that scans the table, and `?status=<4kb>` should not reach the planner.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a possibly-repeated query parameter. */
export function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** A free-text search term, trimmed and capped. Empty means "no filter". */
export function parseSearch(params: SearchParams, key = "q", maxLength = 120): string {
  return firstParam(params[key]).trim().slice(0, maxLength);
}

/**
 * A filter value validated against a known set.
 *
 * Returning `null` for anything unrecognised — rather than throwing — means a
 * stale bookmark or a hand-edited URL degrades to "no filter" instead of a 500.
 */
export function parseEnum<T extends string>(
  params: SearchParams,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = firstParam(params[key]);
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** An opaque id filter (a collection id, say). Capped to a plausible cuid length. */
export function parseId(params: SearchParams, key: string): string | null {
  const value = firstParam(params[key]).trim();
  if (!value || value.length > 60) return null;
  return value;
}

export type Pagination = {
  page: number;
  pageSize: number;
  /** Ready to spread into a Prisma query. */
  skip: number;
  take: number;
};

export function parsePagination(params: SearchParams, pageSize = DEFAULT_PAGE_SIZE): Pagination {
  const size = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  const raw = Number.parseInt(firstParam(params.page), 10);
  // Clamped rather than validated: page 0 and page -3 are both page 1, and an
  // absurd page number lands on the last plausible one instead of an error.
  const page = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 10_000) : 1;
  return { page, pageSize: size, skip: (page - 1) * size, take: size };
}

export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /** 1-based index of the first row shown, for "Showing 26-50 of 312". */
  from: number;
  to: number;
};

export function pageInfo(pagination: Pagination, total: number): PageInfo {
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const page = Math.min(pagination.page, totalPages);
  return {
    page,
    pageSize: pagination.pageSize,
    total,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
    from: total === 0 ? 0 : (page - 1) * pagination.pageSize + 1,
    to: Math.min(page * pagination.pageSize, total),
  };
}

/**
 * Rebuilds the current query string with one parameter changed.
 *
 * Used by the pagination links so that changing the page keeps the active
 * filters — the alternative being a "next page" that silently drops the search
 * the operator just typed.
 */
export function buildQuery(
  params: SearchParams,
  overrides: Record<string, string | number | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = firstParam(value);
    if (single) search.set(key, single);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === "") search.delete(key);
    else search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** Whether any filter is active, so the list can offer a "Clear" affordance. */
export function hasActiveFilters(params: SearchParams, keys: string[]): boolean {
  return keys.some((key) => firstParam(params[key]).trim().length > 0);
}

/** Case-insensitive `contains`, in the shape Prisma expects. */
export function contains(value: string) {
  return { contains: value, mode: "insensitive" as const };
}
