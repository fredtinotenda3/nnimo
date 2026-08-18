import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * PHASE 8 CHANGES
 *
 * 1. The origin now comes from lib/site-url.ts, which refuses to resolve to
 *    localhost in production (finding H1). Previously a missing
 *    NEXT_PUBLIC_SITE_URL silently produced `Sitemap: http://localhost:3000/...`.
 *
 * 2. The disallow list now covers the customer-facing private routes as well as
 *    the admin (finding M7). Every one of them already sets `robots: { index:
 *    false }` in its page metadata, so this is defence in depth rather than a fix
 *    for an active leak — but /orders/[accessToken] renders a customer's name,
 *    email, phone and delivery address, and that deserves both layers. A
 *    page-level noindex only works once the crawler has already fetched the page;
 *    robots.txt stops it before the request.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Operator surfaces.
          "/admin",
          "/admin/",
          "/login",
          "/api/",
          // Customer surfaces that are private, transient, or both. `/orders/`
          // and `/checkout/sandbox/` are the ones that matter: both take an
          // unguessable token in the path, and neither should ever appear in an
          // index or a crawler's referrer log.
          "/cart",
          "/checkout",
          "/checkout/",
          "/orders/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
