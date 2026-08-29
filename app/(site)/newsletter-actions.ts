"use server";

import { db } from "@/lib/db";
import {
  newsletterSignupSchema,
  newsletterFieldErrors,
  type NewsletterFormState,
} from "@/lib/marketing/newsletter";
import { readAttribution } from "@/lib/marketing/attribution";
import { rateLimit } from "@/lib/rate-limit";
import { clientIdentity } from "@/lib/security/client-identity";
import { logger } from "@/lib/logger";

const GENERIC_FAILURE = "Something went wrong signing you up. Please try again in a moment.";

/**
 * Newsletter signup. Mirrors app/(site)/custom/actions.ts: same rate-limit
 * pattern, same honeypot handling, same "accept silently" response to a
 * filled honeypot so a bot never learns it was caught.
 *
 * `source` is not asked of the visitor — it is derived from where the form
 * was submitted, passed in by the caller (the footer form always passes
 * "footer"; a future landing-page-embedded form would pass its own slug).
 */
export async function subscribeToNewsletterAction(
  source: string,
  _previous: NewsletterFormState,
  formData: FormData,
): Promise<NewsletterFormState> {
  const parsed = newsletterSignupSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      errors: newsletterFieldErrors(parsed.error),
    };
  }

  if (parsed.data.website) {
    return { status: "success", message: "Thank you for signing up." };
  }

  if (!(await rateLimit(`newsletter:${await clientIdentity()}`))) {
    return {
      status: "error",
      message: "That is a few signups in a short time. Please try again shortly.",
    };
  }

  // Not FK-verified like order/enquiry attribution — a subscriber's utm_*
  // fields are informational only here, never a foreign key, so a stale or
  // unresolved campaignId in the cookie cannot break this write the way it
  // could a database relation.
  const attribution = await readAttribution();

  try {
    await db.newsletterSubscriber.upsert({
      where: { email: parsed.data.email },
      create: {
        email: parsed.data.email,
        consent: true,
        source,
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
      },
      update: {
        // Re-signing up is how someone who previously unsubscribed opts back
        // in — consent and unsubscribedAt both reset, but source/utm are left
        // as they were on first signup rather than overwritten, since that is
        // the more accurate record of how this person originally arrived.
        consent: true,
        unsubscribedAt: null,
      },
    });
  } catch (error) {
    logger.error("newsletter.signup_failed", { error });
    return { status: "error", message: GENERIC_FAILURE };
  }

  return { status: "success", message: "Thank you — you're on the list." };
}
