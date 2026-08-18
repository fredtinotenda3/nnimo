import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { SiteLogo } from "@/components/site/site-logo";
import { PRIMARY_NAV } from "@/lib/navigation";

/**
 * PHASE 8 (finding H2). The 404 for a URL that matches no route at all.
 *
 * WHY THIS EXISTS SEPARATELY FROM app/(site)/not-found.tsx
 *
 * Route groups do not appear in URLs, so a request for /nonsense matches nothing
 * and Next resolves the ROOT not-found — app/(site)/not-found.tsx never runs for
 * it. Two files are needed to cover both cases: that one for `notFound()` thrown
 * inside a site route, this one for an unmatched path.
 *
 * WHY THE CHROME IS HAND-ROLLED RATHER THAN IMPORTED
 *
 * This renders inside app/layout.tsx only, so there is no SiteHeader above it. It
 * deliberately does NOT import SiteHeader: that component is a client component
 * with a scroll listener and a cart badge, and pulling it in here would mean
 * shipping JavaScript and reading the cart cookie to render a dead end. A static
 * wordmark that links home is the whole of what this page needs.
 *
 * This route also catches unmatched paths under /admin, which is why the copy
 * stays neutral about who the reader is.
 */
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function RootNotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <Container>
          <div className="flex h-16 items-center lg:h-20">
            <Link href="/" aria-label="Nnino Ceramics — home">
              <SiteLogo className="h-7 lg:h-8" />
            </Link>
          </div>
        </Container>
      </header>

      <main id="main" className="flex-1">
        <Container>
          <div className="mx-auto max-w-xl py-20 lg:py-28">
            <p className="text-label text-muted-foreground">Error 404</p>
            <h1 className="text-heading-1 mt-3">This page is not here</h1>

            <div className="mt-6 border-l-2 border-ochre pl-4">
              <p className="text-body-sm text-muted-foreground">
                That address does not match anything on the site. The link may be
                mistyped, or it may have pointed somewhere that has since moved.
              </p>
            </div>

            <div className="mt-10">
              <Button asChild>
                <Link href="/">Return to the home page</Link>
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
        </Container>
      </main>
    </div>
  );
}
