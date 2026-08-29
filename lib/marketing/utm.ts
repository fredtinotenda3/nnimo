/**
 * UTM parsing and first-touch attribution — pure logic only.
 *
 * Deliberately has no `server-only` and no `@/lib/db` import, unlike
 * lib/marketing/attribution.ts (the cookie/database plumbing that uses this).
 * The unit test suite (vitest.config.ts) aliases `@/lib/db` to a stub that
 * throws on any property access, so keeping the parsing and merge rules here,
 * separate from the file that touches cookies and the database, is what makes
 * them testable without a live Postgres instance — the same split
 * lib/analytics/compute.ts uses against lib/analytics/sales.ts.
 */

export const UTM_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type UtmValues = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
};

export type AttributionData = UtmValues & {
  campaignId: string | null;
  landingPageId: string | null;
};

export const EMPTY_UTM: UtmValues = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
};

export const EMPTY_ATTRIBUTION: AttributionData = {
  ...EMPTY_UTM,
  campaignId: null,
  landingPageId: null,
};

/**
 * UTM values are attacker-reachable — anyone can put anything in a query
 * string. Capped and never trusted as HTML; every render site treats them as
 * plain text.
 */
const MAX_UTM_LENGTH = 150;

function cleanParam(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_UTM_LENGTH);
  return trimmed.length === 0 ? null : trimmed;
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function readParam(source: ParamSource, key: string): string | null {
  if (source instanceof URLSearchParams) return source.get(key);
  const value = source[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

/** Extracts the five standard UTM parameters from a URL's query string. */
export function parseUtmParams(source: ParamSource): UtmValues {
  return {
    utmSource: cleanParam(readParam(source, "utm_source")),
    utmMedium: cleanParam(readParam(source, "utm_medium")),
    utmCampaign: cleanParam(readParam(source, "utm_campaign")),
    utmTerm: cleanParam(readParam(source, "utm_term")),
    utmContent: cleanParam(readParam(source, "utm_content")),
  };
}

export function hasUtmValues(values: UtmValues): boolean {
  return Boolean(
    values.utmSource || values.utmMedium || values.utmCampaign || values.utmTerm || values.utmContent,
  );
}

export function hasAttribution(data: AttributionData): boolean {
  return hasUtmValues(data) || Boolean(data.campaignId) || Boolean(data.landingPageId);
}

/**
 * First-touch resolution.
 *
 * Attribution answers "how did this visitor first arrive", so once something
 * meaningful is on record it is never overwritten by a later visit — including
 * a later DIRECT visit with no UTM parameters at all, which must not erase an
 * earlier ad click's attribution. Returns whichever of the two should be
 * treated as current.
 */
export function resolveFirstTouchAttribution(
  existing: AttributionData | null,
  incoming: AttributionData,
): AttributionData {
  if (existing && hasAttribution(existing)) return existing;
  return incoming;
}

/**
 * A landing page's own configured UTM defaults, used when a visitor reaches
 * `/c/{slug}` with no query parameters of their own — an ad that links
 * straight at the landing page without its own UTM string still attributes
 * correctly, because the landing page carries its own defaults.
 */
export function landingPageDefaultAttribution(landingPage: {
  id: string;
  campaignId: string | null;
  defaultUtmSource: string | null;
  defaultUtmMedium: string | null;
  defaultUtmCampaign: string | null;
  defaultUtmTerm: string | null;
  defaultUtmContent: string | null;
}): AttributionData {
  return {
    utmSource: landingPage.defaultUtmSource,
    utmMedium: landingPage.defaultUtmMedium,
    utmCampaign: landingPage.defaultUtmCampaign,
    utmTerm: landingPage.defaultUtmTerm,
    utmContent: landingPage.defaultUtmContent,
    campaignId: landingPage.campaignId,
    landingPageId: landingPage.id,
  };
}

/**
 * Combines whatever UTM parameters are on the current URL with the
 * campaign/landing-page ids the visitor is currently on, if any. URL
 * parameters always win over a landing page's defaults — call
 * `landingPageDefaultAttribution` first and pass its UTM values in only when
 * the URL supplied none, at the call site.
 */
export function resolveIncomingAttribution(params: {
  urlParams: ParamSource;
  campaignId?: string | null;
  landingPageId?: string | null;
}): AttributionData {
  return {
    ...parseUtmParams(params.urlParams),
    campaignId: params.campaignId ?? null,
    landingPageId: params.landingPageId ?? null,
  };
}
