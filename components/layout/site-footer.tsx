import * as React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { BRAND, whatsappLink } from "@/lib/brand";
import { FOOTER_BUYING_NAV, PRIMARY_NAV } from "@/lib/navigation";
import { NewsletterForm } from "@/components/site/newsletter-form";

/**
 * Server component: nothing here is interactive, so it ships no JavaScript.
 * Contact details come from lib/brand.ts, which records the source document for
 * every value.
 */
function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface-sunken">
      <Container>
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-5 py-16 lg:py-20">
          <div className="lg:col-span-1">
            <p className="text-heading-2">Nnino</p>
            <p className="text-quote mt-3 text-muted-foreground">{BRAND.tagline}</p>
            <p className="text-body-sm mt-5 max-w-xs text-muted-foreground">
              Handcrafted ceramics and sculpture, individually designed and signed,
              from {BRAND.city}.
            </p>
          </div>

          <nav aria-labelledby="footer-explore">
            <h2 id="footer-explore" className="text-label text-muted-foreground">
              Explore
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              {PRIMARY_NAV.map((item) => (
                <li key={`${item.href}-${item.label}`}>
                  <Link
                    href={item.href}
                    className="text-body-sm text-foreground transition-colors hover:text-primary"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-customer">
            <h2 id="footer-customer" className="text-label text-muted-foreground">
              Buying
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              {FOOTER_BUYING_NAV.map((item) => (
                <li key={`${item.href}-${item.label}`}>
                  <Link
                    href={item.href}
                    className="text-body-sm text-foreground transition-colors hover:text-primary"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-label text-muted-foreground">Visit &amp; contact</h2>
            <address className="text-body-sm mt-5 not-italic text-foreground">
              {BRAND.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <ul className="mt-5 flex flex-col gap-3">
              <li>
                <a
                  href={whatsappLink(`Hello Nnino Ceramics, I have an enquiry.`)}
                  className="text-body-sm text-foreground transition-colors hover:text-primary"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  WhatsApp {BRAND.whatsapp}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${BRAND.telephone.replace(/\s/g, "")}`}
                  className="text-body-sm text-foreground transition-colors hover:text-primary"
                >
                  {BRAND.telephone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${BRAND.emails.general}`}
                  className="text-body-sm break-all text-foreground transition-colors hover:text-primary"
                >
                  {BRAND.emails.general}
                </a>
              </li>
              <li>
                <a
                  href={`https://instagram.com/${BRAND.social.instagram}`}
                  className="text-body-sm text-foreground transition-colors hover:text-primary"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Instagram @{BRAND.social.instagram}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-label text-muted-foreground">Stay in touch</h2>
            <div className="mt-5">
              <NewsletterForm />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-border py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-metadata text-muted-foreground">
            © {year} {BRAND.name} · {BRAND.city}, {BRAND.country}
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <Link
                href="/privacy"
                className="text-metadata text-muted-foreground transition-colors hover:text-foreground"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="text-metadata text-muted-foreground transition-colors hover:text-foreground"
              >
                Terms
              </Link>
            </li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}

export { SiteFooter };
