"use client";

import * as React from "react";
import { captureAttributionAction } from "@/app/(site)/attribution-actions";
import type { UtmValues } from "@/lib/marketing/utm";

/**
 * Renders nothing. Fires once on mount to capture any `utm_*` query
 * parameters on the current URL (see lib/marketing/utm.ts), plus
 * `campaignId`/`landingPageId` when the page it is mounted on already knows
 * them.
 *
 * Two mount points, deliberately:
 *
 *  - One instance in app/(site)/layout.tsx with no props, for the general
 *    case: an ad linking straight at /shop?utm_source=facebook&… or any other
 *    page with its own UTM string. The layout persists across client-side
 *    navigation, so this only fires on first paint of a session — which is
 *    exactly when a hard-navigation ad click lands.
 *  - One instance on the /c/[slug] landing page itself, with campaignId,
 *    landingPageId and fallbackUtm filled in. A page-level component
 *    remounts on every fresh navigation to that route (unlike the shared
 *    layout), so a landing page visited a second time in the same browsing
 *    session still attributes.
 *
 * Both may fire on the same landing-page visit; `captureAttribution` is
 * first-touch and idempotent, so the second call is a harmless no-op.
 *
 * Reads `window.location.search` directly rather than `useSearchParams()`
 * so this never forces a Suspense boundary onto every page it is mounted on
 * — this component has no rendered output to suspend in the first place.
 */
export function AttributionCapture({
  campaignId = null,
  landingPageId = null,
  fallbackUtm,
}: {
  campaignId?: string | null;
  landingPageId?: string | null;
  /** A landing page's own default UTM values, used only if the URL has none. */
  fallbackUtm?: UtmValues;
}) {
  React.useEffect(() => {
    const search = window.location.search;
    const hasFallback = fallbackUtm && Object.values(fallbackUtm).some(Boolean);
    if (!search && !campaignId && !landingPageId && !hasFallback) return;

    const params = new URLSearchParams(search);
    void captureAttributionAction({
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      utmTerm: params.get("utm_term"),
      utmContent: params.get("utm_content"),
      campaignId,
      landingPageId,
      fallbackUtm,
    });
    // Intentionally runs once on mount only — see the mount-point note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
