import { afterAll, describe, expect, it } from "vitest";
import { db, uid } from "./helpers";

/**
 * Draft landing page protection — the real assertion.
 *
 * See tests/landing-page-authorization.test.ts for why this lives here rather
 * than in the unit suite: `getPublicLandingPageBySlug` composes
 * PUBLIC_LANDING_PAGE_WHERE, which imports the real Prisma enum value, the
 * same as PUBLIC_COLLECTION_WHERE / PUBLIC_PRODUCT_WHERE in lib/catalogue.ts —
 * none of the three can run under the unit-test `@/lib/db` stub.
 */
const created: string[] = [];

afterAll(async () => {
  if (created.length) await db.landingPage.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

async function makeLandingPage(status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  const slug = uid("landing");
  const page = await db.landingPage.create({
    data: { title: `Test landing page ${slug}`, slug, status },
    select: { id: true, slug: true },
  });
  created.push(page.id);
  return page;
}

describe("landing page draft protection", () => {
  it("hides a DRAFT landing page from getPublicLandingPageBySlug", async () => {
    const { getPublicLandingPageBySlug } = await import("@/lib/marketing/public");
    const page = await makeLandingPage("DRAFT");

    const result = await getPublicLandingPageBySlug(page.slug);

    expect(result).toBeNull();
  });

  it("hides an ARCHIVED landing page from getPublicLandingPageBySlug", async () => {
    const { getPublicLandingPageBySlug } = await import("@/lib/marketing/public");
    const page = await makeLandingPage("ARCHIVED");

    const result = await getPublicLandingPageBySlug(page.slug);

    expect(result).toBeNull();
  });

  it("returns a PUBLISHED landing page from getPublicLandingPageBySlug", async () => {
    const { getPublicLandingPageBySlug } = await import("@/lib/marketing/public");
    const page = await makeLandingPage("PUBLISHED");

    const result = await getPublicLandingPageBySlug(page.slug);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(page.id);
  });

  it("404s the public route for a draft page, even with the exact slug", async () => {
    // Mirrors what app/(site)/c/[slug]/page.tsx actually does with a null
    // result: notFound(). This test asserts the data layer gives it that
    // null to act on — the page component itself has no logic branch that a
    // unit test could meaningfully isolate beyond "call notFound() if null",
    // which is exercised by the getPublicLandingPageBySlug assertions above.
    const { getPublicLandingPageBySlug } = await import("@/lib/marketing/public");
    const page = await makeLandingPage("DRAFT");

    const result = await getPublicLandingPageBySlug(page.slug);
    expect(result).toBeNull();

    // A nonexistent slug and a draft slug must be indistinguishable to a
    // visitor — both are "nothing here", never "there's a page but it's not
    // ready", which would leak that unpublished work exists.
    const nonexistent = await getPublicLandingPageBySlug(`${page.slug}-does-not-exist`);
    expect(nonexistent).toBeNull();
  });
});
