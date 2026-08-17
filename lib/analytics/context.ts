import "server-only";
import { db } from "@/lib/db";
import { normaliseTimeZone, DEFAULT_TIME_ZONE } from "@/lib/analytics/range";
import { SETTLED_PAYMENT_STATUSES } from "@/lib/analytics/types";
import { parseFilters, type AnalyticsFilters } from "@/lib/analytics/params";
import type { SearchParams } from "@/lib/admin/query";

/**
 * The two pieces of studio configuration every analytics query needs.
 *
 * Both come from the `Setting` table rather than from constants, because both
 * are business decisions: which currency the studio reports in, and which
 * timezone its trading day is measured against. Read together in one round trip
 * and passed down explicitly, so no query re-reads them and no two figures on
 * the same page can disagree about what "today" means.
 *
 * `reportingCurrency` previously lived as a private helper inside
 * lib/admin/dashboard.ts. It moved here so the dashboard and the analytics
 * section resolve it identically — two implementations of "which currency are
 * we in" is exactly how a headline figure and a detail page end up disagreeing.
 */

export const REPORTING_CURRENCY_SETTING = "commerce.currency";
export const TIME_ZONE_SETTING = "business.timezone";

export type AnalyticsContext = {
  reportingCurrency: string;
  timeZone: string;
  /**
   * Currencies present in settled orders, reporting currency first.
   *
   * Drives the currency selector, which only appears when this has more than
   * one entry — an always-visible selector on a single-currency studio is
   * clutter that implies a complexity the business does not have.
   */
  availableCurrencies: string[];
};

function normaliseCurrency(value: string | null | undefined): string {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}

export async function getAnalyticsContext(): Promise<AnalyticsContext> {
  const [settings, currencyGroups] = await Promise.all([
    db.setting.findMany({
      where: { key: { in: [REPORTING_CURRENCY_SETTING, TIME_ZONE_SETTING] } },
      select: { key: true, value: true },
    }),
    db.order.groupBy({
      by: ["currency"],
      where: { paymentStatus: { in: [...SETTLED_PAYMENT_STATUSES] } },
      _count: { _all: true },
    }),
  ]);

  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  const reportingCurrency = normaliseCurrency(byKey.get(REPORTING_CURRENCY_SETTING));
  const timeZone = normaliseTimeZone(byKey.get(TIME_ZONE_SETTING) ?? DEFAULT_TIME_ZONE);

  const present = currencyGroups
    .map((group) => normaliseCurrency(group.currency))
    .filter((code) => code !== reportingCurrency)
    .sort();

  return {
    reportingCurrency,
    timeZone,
    availableCurrencies: [reportingCurrency, ...present],
  };
}

/**
 * Everything an analytics page needs before it can query anything.
 *
 * One entry point rather than each page assembling context and filters for
 * itself: the timezone must be resolved BEFORE the range is, because "today"
 * is a different pair of instants in Harare than in UTC, and a page that
 * resolved them in the other order would silently report the wrong day.
 */
export async function resolveAnalyticsRequest(
  params: SearchParams,
): Promise<{ context: AnalyticsContext; filters: AnalyticsFilters }> {
  const context = await getAnalyticsContext();
  const filters = parseFilters(params, {
    timeZone: context.timeZone,
    reportingCurrency: context.reportingCurrency,
    availableCurrencies: context.availableCurrencies,
  });
  return { context, filters };
}
