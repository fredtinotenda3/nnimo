"use server";

import { db } from "@/lib/db";
import {
  CONTACT_REQUEST_TYPE,
  commissionSchema,
  contactSchema,
  fieldErrors,
  type FormState,
} from "@/lib/inquiries";
import { rateLimit } from "@/lib/rate-limit";
import { clientIdentity } from "@/lib/security/client-identity";
import { logger } from "@/lib/logger";
import { readAttribution, verifiedAttribution } from "@/lib/marketing/attribution";

/**
 * Throttling bucket for a submission.
 *
 * Phase 5 moved the IP handling into lib/security/client-identity.ts, which
 * hashes the address with a server-side salt before it is used as a key. The
 * limiter needs a stable, unique bucket; it does not need to know anyone's IP
 * address, and a leaked rate-limit store should not be a list of visitor IPs.
 */
async function clientKey(prefix: string): Promise<string> {
  return `${prefix}:${await clientIdentity()}`;
}

const GENERIC_FAILURE =
  "Something went wrong sending that. Please try again, or WhatsApp the studio.";

export async function submitCommission(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = commissionSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error),
    };
  }

  // Honeypot filled — accept silently so the bot does not learn it was caught.
  if (parsed.data.website) {
    return { status: "success", message: "Thank you — your enquiry has been sent." };
  }

  if (!(await rateLimit(await clientKey("commission")))) {
    return {
      status: "error",
      message: "That is a few enquiries in a short time. Please try again shortly.",
    };
  }

  // Drop the honeypot before it reaches Prisma.
  const data = { ...parsed.data, website: undefined };

  // Verified against the database before it reaches Prisma — see
  // lib/marketing/attribution.ts for why an unverified campaignId/landingPageId
  // from a stale cookie must never be trusted straight into a foreign key.
  const attribution = await verifiedAttribution(await readAttribution());

  try {
    await db.customOrderInquiry.create({
      data: {
        customerName: data.customerName,
        email: data.email,
        phone: data.phone ?? null,
        organisation: data.organisation ?? null,
        requestType: data.requestType,
        quantity: data.quantity ?? null,
        desiredDate: data.desiredDate ?? null,
        budget: data.budget ?? null,
        description: data.description,
        // status defaults to NEW. No quote, no price, no order — a commission
        // becomes commercial only once the studio has quoted it.
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
        utmTerm: attribution.utmTerm,
        utmContent: attribution.utmContent,
        campaignId: attribution.campaignId,
        landingPageId: attribution.landingPageId,
      },
    });
  } catch (error) {
    logger.error("inquiry.commission_failed", { error });
    return { status: "error", message: GENERIC_FAILURE };
  }

  return {
    status: "success",
    message:
      "Thank you — your enquiry is with the studio. They will come back to you with a quotation.",
  };
}

export async function submitContact(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      errors: fieldErrors(parsed.error),
    };
  }

  if (parsed.data.website) {
    return { status: "success", message: "Thank you — your message has been sent." };
  }

  if (!(await rateLimit(await clientKey("contact")))) {
    return {
      status: "error",
      message: "That is a few messages in a short time. Please try again shortly.",
    };
  }

  const attribution = await verifiedAttribution(await readAttribution());

  try {
    await db.customOrderInquiry.create({
      data: {
        customerName: parsed.data.customerName,
        email: parsed.data.email,
        phone: parsed.data.phone ?? null,
        requestType: CONTACT_REQUEST_TYPE,
        description: parsed.data.description,
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
        utmTerm: attribution.utmTerm,
        utmContent: attribution.utmContent,
        campaignId: attribution.campaignId,
        landingPageId: attribution.landingPageId,
      },
    });
  } catch (error) {
    logger.error("inquiry.contact_failed", { error });
    return { status: "error", message: GENERIC_FAILURE };
  }

  return {
    status: "success",
    message: "Thank you — your message is with the studio.",
  };
}
