import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/commerce/money";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/generated/prisma/enums";
import {
  RANGE_PRESETS,
  RANGE_PRESET_LABEL,
  formatCivilDate,
  type ResolvedRange,
} from "@/lib/analytics/range";
import { rangeQuery, type AnalyticsFilters } from "@/lib/analytics/params";
import { ANALYTICS_SECTIONS } from "@/lib/analytics/sections";
import type { CurrencySegmentation, DataNote } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

/**
 * The furniture every analytics page shares.
 *
 * All server components. The range picker is a plain GET form and the section
 * tabs are links, exactly as the Phase 4 list views work — so the whole section
 * functions without JavaScript, the back button behaves, and an operator can
 * bookmark "previous month, sales" and send the URL to a colleague. A
 * client-side date picker would have needed state, a loading spinner and a way
 * to serialise itself into the URL anyway; this is the version with less
 * machinery, not more.
 */

/**
 * Section tabs.
 *
 * Filtered by permission so a role never sees a tab it would be redirected away
 * from — but that is presentation only. Each page calls `requirePermission()`
 * for itself, because a URL typed into the address bar never passes through
 * this list.
 *
 * Every link carries the current range, so changing section keeps the period.
 */
export function AnalyticsTabs({
  role,
  current,
  filters,
}: {
  role: Role;
  current: string;
  filters: AnalyticsFilters;
}) {
  const query = rangeQuery(filters);
  const visible = ANALYTICS_SECTIONS.filter((section) => can(role, section.permission));

  return (
    <nav aria-label="Analytics sections" className="border-b border-border">
      <ul className="flex items-center gap-6 overflow-x-auto">
        {visible.map((section) => {
          const active = section.href === current;
          return (
            <li key={section.href}>
              <Link
                href={`${section.href}${query}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-nav relative -mb-px block whitespace-nowrap border-b-2 pb-3 pt-1 transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const controlClass =
  "text-body-sm h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary";

/**
 * The date-range and currency picker.
 *
 * The two date fields are always present rather than revealed by choosing
 * "Custom range": conditional fields need JavaScript, and a form whose
 * controls appear and disappear is harder to use with a keyboard or a screen
 * reader than one that simply explains what each field is for.
 *
 * The currency selector renders only when settled orders exist in more than one
 * currency. On a single-currency studio it would be a control implying a
 * complexity the business does not have.
 */
export function RangePicker({
  filters,
  availableCurrencies,
  basePath,
}: {
  filters: AnalyticsFilters;
  availableCurrencies: string[];
  basePath: string;
}) {
  const { range } = filters;
  const showCurrency = availableCurrencies.length > 1;

  return (
    <form
      method="get"
      action={basePath}
      className="grid gap-4 border-b border-border pb-6 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
    >
      <div>
        <label htmlFor="analytics-range" className="text-label text-muted-foreground">
          Period
        </label>
        <select
          id="analytics-range"
          name="range"
          defaultValue={range.preset}
          className={`${controlClass} mt-2`}
        >
          {RANGE_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {RANGE_PRESET_LABEL[preset]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="analytics-from" className="text-label text-muted-foreground">
          From
        </label>
        <input
          id="analytics-from"
          name="from"
          type="date"
          defaultValue={range.from ? formatCivilDate(range.from) : ""}
          aria-describedby="analytics-custom-help"
          className={`${controlClass} mt-2`}
        />
      </div>

      <div>
        <label htmlFor="analytics-to" className="text-label text-muted-foreground">
          To
        </label>
        <input
          id="analytics-to"
          name="to"
          type="date"
          defaultValue={range.to ? formatCivilDate(range.to) : ""}
          aria-describedby="analytics-custom-help"
          className={`${controlClass} mt-2`}
        />
      </div>

      {showCurrency ? (
        <div>
          <label htmlFor="analytics-currency" className="text-label text-muted-foreground">
            Currency
          </label>
          <select
            id="analytics-currency"
            name="currency"
            defaultValue={filters.currency}
            className={`${controlClass} mt-2`}
          >
            {availableCurrencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
        <Button type="submit" size="sm">
          Apply
        </Button>
        <p id="analytics-custom-help" className="text-metadata text-muted-foreground">
          From and To apply when the period is set to “Custom range”. Dates are
          read in the studio&rsquo;s timezone ({range.timeZone}).
        </p>
      </div>
    </form>
  );
}

/** The period the figures below cover, stated plainly under the heading. */
export function RangeSummary({ range }: { range: ResolvedRange }) {
  if (!range.from || !range.to) {
    return (
      <span>
        All time, in <span className="tabular-nums">{range.timeZone}</span>
      </span>
    );
  }
  return (
    <span>
      {RANGE_PRESET_LABEL[range.preset]} ·{" "}
      <span className="tabular-nums">
        {formatCivilDate(range.from)} to {formatCivilDate(range.to)}
      </span>{" "}
      ({range.timeZone})
    </span>
  );
}

/**
 * The caveats that apply to the figures on this page.
 *
 * Derived from the fetched data rather than written into the page, so a
 * limitation states itself identically everywhere it applies and stops
 * rendering on its own once the underlying gap closes.
 */
export function DataNotes({ notes }: { notes: DataNote[] }) {
  if (notes.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3">
      {notes.map((note) => (
        <li
          key={note.id}
          className={cn(
            "text-body-sm border-l-2 pl-3 text-muted-foreground",
            note.severity === "warning" ? "border-ochre" : "border-border-strong",
          )}
        >
          {note.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * Money in every currency it was taken in.
 *
 * The reporting currency is the headline; anything else is listed beneath it,
 * never added to it. This component exists so that "we do not sum across
 * currencies" is a single rendering decision rather than a rule each page has
 * to remember.
 */
export function CurrencyBreakdown({ segmentation }: { segmentation: CurrencySegmentation }) {
  if (!segmentation.isMixed) return null;

  return (
    <div className="border-l-2 border-ochre pl-3">
      <p className="text-label text-muted-foreground">Other currencies</p>
      <ul className="mt-2 flex flex-col gap-1">
        {segmentation.others.map((total) => (
          <li key={total.currency} className="text-body-sm tabular-nums">
            {formatCents(total.cents, total.currency)}{" "}
            <span className="text-muted-foreground">
              across {total.count} {total.count === 1 ? "order" : "orders"}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-metadata mt-2 text-muted-foreground">
        Shown separately. Currencies are never added together.
      </p>
    </div>
  );
}

/** A panel a role can see the heading of but has no permission to populate. */
export function RestrictedPanel({ label }: { label: string }) {
  return (
    <p className="text-body-sm border-l-2 border-border-strong pl-3 text-muted-foreground">
      {label} is not available to your role.
    </p>
  );
}
