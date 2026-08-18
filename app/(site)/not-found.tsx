import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { PRIMARY_NAV } from "@/lib/navigation";

/**
 * PHASE 8 (finding H2). The public 404.
 *
 * Before this file existed, `notFound()` — called from /products/[slug],
 * /collections/[slug], /orders/[accessToken] and /checkout/sandbox — rendered
 * Next.js's built-in 404: unstyled Helvetica on white, no header, no footer, no
 * way back. For a brand whose entire proposition is that it looks considered, the
 * page a mistyped or expired URL lands on is not a detail.
 *
 * Because this sits inside app/(site)/, the header, footer and skip link come from
 * app/(site)/layout.tsx automatically. A mistyped product URL now looks like part
 * of the site rather than like a crash.
 *
 * WHY THE NAVIGATION IS REPEATED HERE
 *
 * The header collapses to a hamburger on mobile, so a visitor who lands on a dead
 * link on a phone would otherwise see an apology and nothing to press. The routes
 * come from lib/navigation.ts rather than being retyped, so this list cannot drift
 * from the header.
 *
 * NO SUGGESTED PRODUCTS, DELIBERATELY. A "you might like these instead" grid would
 * mean a database query on a route that bots hit constantly with junk URLs, and it
 * is the sort of thing that turns a 404 into a slow 404.
 */
export const metadata: Metadata = {
  title: "Page not found",
  // A 404 must never be indexed, and must not be presented as an alternative to
  // the page the crawler was actually looking for.
  robots: { index: false, follow: true },
};

export default function SiteNotFound() {
  return (
    <Section className="pt-32 lg:pt-40">
      <div className="mx-auto max-w-xl">
        <p className="text-label text-muted-foreground">Error 404</p>
        <h1 className="text-heading-1 mt-3">This page is not here</h1>

        <div className="mt-6 border-l-2 border-ochre pl-4">
          <p className="text-body-sm text-muted-foreground">
            The link may be mistyped, or the piece it pointed to may no longer be
            listed. Every Nnino piece is a one-off, so the catalogue changes as work
            is sold and new work is fired.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/shop">Browse the shop</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/collections">See the collections</Link>
          </Button>
        </div>

        <nav aria-label="Site sections" className="mt-12">
          <p className="text-label text-muted-foreground">Or go to</p>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-body-sm block py-3 text-foreground hover:text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Section>
  );
}
