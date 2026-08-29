"use server";

import { captureAttribution } from "@/lib/marketing/attribution";
import { hasUtmValues, type AttributionData, type UtmValues } from "@/lib/marketing/utm";

/**
 * Entry point for AttributionCapture (a Client Component — see
 * attribution-capture.tsx). `cookies().set()` is only valid inside a Server
 * Action or Route Handler, never during a Server Component's render, which is
 * why capture cannot happen directly on the page even though the page already
 * knows any campaignId/landingPageId for its own route.
 */
export async function captureAttributionAction(input: {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  campaignId: string | null;
  landingPageId: string | null;
  /**
   * A landing page's own configured UTM defaults (see
   * `landingPageDefaultAttribution` in lib/marketing/utm.ts), used only when
   * the URL itself carried none — a QR code or a direct link to the landing
   * page has no query string of its own to carry UTM values, so the page's
   * defaults fill that gap. URL parameters always win when present.
   */
  fallbackUtm?: UtmValues;
}): Promise<void> {
  const clean = (value: string | null | undefined): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim().slice(0, 150);
    return trimmed.length === 0 ? null : trimmed;
  };

  const fromUrl: UtmValues = {
    utmSource: clean(input.utmSource),
    utmMedium: clean(input.utmMedium),
    utmCampaign: clean(input.utmCampaign),
    utmTerm: clean(input.utmTerm),
    utmContent: clean(input.utmContent),
  };

  const utm = hasUtmValues(fromUrl)
    ? fromUrl
    : {
        utmSource: clean(input.fallbackUtm?.utmSource ?? null),
        utmMedium: clean(input.fallbackUtm?.utmMedium ?? null),
        utmCampaign: clean(input.fallbackUtm?.utmCampaign ?? null),
        utmTerm: clean(input.fallbackUtm?.utmTerm ?? null),
        utmContent: clean(input.fallbackUtm?.utmContent ?? null),
      };

  const incoming: AttributionData = {
    ...utm,
    campaignId: typeof input.campaignId === "string" && input.campaignId.length > 0 ? input.campaignId : null,
    landingPageId:
      typeof input.landingPageId === "string" && input.landingPageId.length > 0 ? input.landingPageId : null,
  };

  await captureAttribution(incoming);
}
