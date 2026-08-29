import "server-only";
import { db } from "@/lib/db";
import { LandingPageStatus } from "@/lib/generated/prisma/enums";

/**
 * The single place the public/draft boundary is defined for landing pages —
 * same convention as PUBLIC_COLLECTION_WHERE / PUBLIC_PRODUCT_WHERE in
 * lib/catalogue.ts. `getPublicLandingPageBySlug` composes this rather than
 * writing its own `where`, so "a draft or archived landing page is invisible
 * to the public, even with the direct link" is enforced in one place.
 */
export const PUBLIC_LANDING_PAGE_WHERE = {
  status: LandingPageStatus.PUBLISHED,
} as const;

export async function getPublicLandingPageBySlug(slug: string) {
  return db.landingPage.findFirst({
    where: { slug, ...PUBLIC_LANDING_PAGE_WHERE },
    select: {
      id: true,
      title: true,
      slug: true,
      message: true,
      storyContent: true,
      cta: true,
      ctaLabel: true,
      defaultUtmSource: true,
      defaultUtmMedium: true,
      defaultUtmCampaign: true,
      defaultUtmTerm: true,
      defaultUtmContent: true,
      heroImage: {
        select: { provider: true, storageKey: true, url: true, altText: true },
      },
      campaign: {
        select: {
          id: true,
          name: true,
          slug: true,
          cta: true,
          ctaLabel: true,
          collection: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
}
