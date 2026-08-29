import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  EMPTY_ATTRIBUTION,
  hasAttribution,
  resolveFirstTouchAttribution,
  type AttributionData,
} from "@/lib/marketing/utm";

export const ATTRIBUTION_COOKIE = "nnino_attribution";
// 30 days: long enough to cover a typical browse-then-buy gap for a
// considered handmade purchase, matching CART_COOKIE_MAX_AGE in
// lib/commerce/cart.ts for the same reason.
const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function parseCookieValue(raw: string | undefined): AttributionData | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    const str = (key: string): string | null => (typeof value[key] === "string" ? (value[key] as string) : null);
    return {
      utmSource: str("utmSource"),
      utmMedium: str("utmMedium"),
      utmCampaign: str("utmCampaign"),
      utmTerm: str("utmTerm"),
      utmContent: str("utmContent"),
      campaignId: str("campaignId"),
      landingPageId: str("landingPageId"),
    };
  } catch {
    // A malformed or tampered cookie degrades to "no attribution recorded"
    // rather than breaking whatever page reads it.
    return null;
  }
}

/**
 * Reads whatever attribution is currently on record for this visitor.
 *
 * Used at checkout and enquiry submission to decide what to write onto the
 * Order / CustomOrderInquiry being created. Does not verify that campaignId /
 * landingPageId still exist — see `verifiedAttribution`, which callers writing
 * to the database must use instead.
 */
export async function readAttribution(): Promise<AttributionData> {
  const store = await cookies();
  return parseCookieValue(store.get(ATTRIBUTION_COOKIE)?.value) ?? EMPTY_ATTRIBUTION;
}

/**
 * Captures attribution for this visitor, first-touch.
 *
 * A no-op when `incoming` carries nothing worth recording (a plain internal
 * navigation), and a no-op when attribution is already on record — see
 * `resolveFirstTouchAttribution`. Called from a Server Action
 * (app/(site)/attribution-actions.ts) triggered by the client on first
 * paint, never during a Server Component render — `cookies().set()` is only
 * valid from a Server Action or Route Handler.
 */
export async function captureAttribution(incoming: AttributionData): Promise<void> {
  if (!hasAttribution(incoming)) return;

  const store = await cookies();
  const existing = parseCookieValue(store.get(ATTRIBUTION_COOKIE)?.value);
  const resolved = resolveFirstTouchAttribution(existing, incoming);
  if (existing && resolved === existing) return;

  store.set(ATTRIBUTION_COOKIE, JSON.stringify(resolved), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ATTRIBUTION_COOKIE_MAX_AGE,
  });
}

/**
 * Confirms `campaignId` / `landingPageId` still reference real rows before
 * they reach a database write.
 *
 * Necessary because the attribution cookie can outlive the campaign or
 * landing page it names — up to 30 days old, and `Campaign`/`LandingPage`
 * rows CAN be deleted by an operator in that window. `onDelete: SetNull` on
 * Order/CustomOrderInquiry only protects a row that already references a
 * campaign that is later deleted; it does nothing for an INSERT that names a
 * campaign id which is already gone, which would otherwise fail the foreign
 * key constraint and break checkout. The UTM strings need no such check —
 * they are free text, not references.
 */
export async function verifiedAttribution(data: AttributionData): Promise<AttributionData> {
  const [campaign, landingPage] = await Promise.all([
    data.campaignId
      ? db.campaign.findUnique({ where: { id: data.campaignId }, select: { id: true } })
      : null,
    data.landingPageId
      ? db.landingPage.findUnique({ where: { id: data.landingPageId }, select: { id: true } })
      : null,
  ]);

  return {
    ...data,
    campaignId: campaign ? data.campaignId : null,
    landingPageId: landingPage ? data.landingPageId : null,
  };
}
