import type { MetadataRoute } from "next";
import { getPublicSlugs } from "@/lib/catalogue";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Generated per request, not at build time.
 *
 * Two reasons. A prerendered sitemap queries the database during `next build`,
 * which makes every deploy depend on the database being reachable from the build
 * environment — on Vercel it often is not. And it would freeze the sitemap at
 * deploy time, so a piece published on Tuesday would stay missing from
 * /sitemap.xml until the next deploy. Crawlers fetch this rarely, so serving it
 * dynamically costs nothing.
 */
export const dynamic = "force-dynamic";

/**
 * Only published content is listed. Draft ranges and catalogue-only pieces are
 * excluded because their URLs 404 — submitting them would generate crawl errors.
 * /admin and /login are excluded here and disallowed in robots.ts.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products, collections } = await getPublicSlugs();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/shop`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/collections`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/family`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/custom`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/contact`, changeFrequency: "yearly", priority: 0.5 },
  ];

  return [
    ...staticRoutes,
    ...collections.map((collection) => ({
      url: `${siteUrl}/collections/${collection.slug}`,
      lastModified: collection.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...products.map((product) => ({
      url: `${siteUrl}/products/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
