import type { Metadata } from "next";
import { BRAND, whatsappLink } from "@/lib/brand";
import { organisationJsonLd } from "@/lib/seo";
import { serialiseJsonLd } from "@/lib/security/json-ld";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { ContactForm } from "@/components/site/contact-form";
import { EditorialImage } from "@/components/site/editorial-image";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact Nnino Ceramics — 25 Waverley Road, Thorngrove, Bulawayo, Zimbabwe. Call, email or WhatsApp the studio.",
  alternates: { canonical: "/contact" },
  openGraph: { title: "Contact · Nnino Ceramics", url: "/contact" },
};

/**
 * Every contact detail here comes from lib/brand.ts, which records the source
 * document for each value. Nothing is invented — there are no opening hours on
 * this page, for instance, because no supplied document states them.
 */
export default function ContactPage() {
  const details = [
    {
      label: "Studio",
      lines: BRAND.addressLines,
    },
    {
      label: "Telephone",
      lines: [BRAND.telephone],
      href: `tel:${BRAND.telephone.replace(/\s/g, "")}`,
    },
    {
      label: "WhatsApp",
      lines: [BRAND.whatsapp],
      href: whatsappLink("Hello Nnino Ceramics, I have an enquiry."),
      external: true,
    },
    {
      label: "Email",
      lines: [BRAND.emails.general],
      href: `mailto:${BRAND.emails.general}`,
    },
    {
      label: "Sales",
      lines: [BRAND.emails.sales],
      href: `mailto:${BRAND.emails.sales}`,
    },
    {
      label: "Instagram",
      lines: [`@${BRAND.social.instagram}`],
      href: `https://instagram.com/${BRAND.social.instagram}`,
      external: true,
    },
    {
      label: "Facebook",
      lines: [BRAND.social.facebook],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serialiseJsonLd(organisationJsonLd()) }}
      />

      <section className="bg-charcoal">
        <Container>
          <div className="max-w-3xl pb-16 pt-32 lg:pb-24 lg:pt-44">
            <p className="text-label text-ochre">Get in touch</p>
            <h1 className="text-display mt-6 text-dark-foreground">Contact</h1>
            <p className="text-body-lg mt-8 max-w-xl text-dark-muted-foreground">
              The studio is in {BRAND.city}. Call, email, message on WhatsApp, or send
              the form and someone will come back to you.
            </p>
          </div>
        </Container>
      </section>

      {/* Contact/visit atmosphere break — see
          public/images/contact/atmosphere.png in lib/editorial-images.ts. */}
      <Section contained={false} className="py-0">
        <div className="relative aspect-[21/9] w-full overflow-hidden">
          <EditorialImage
            slot="contact-atmosphere"
            caption="Visit the studio"
            sizes="100vw"
          />
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <h2 className="text-heading-2">Studio details</h2>
            <dl className="mt-8 divide-y divide-border border-y border-border">
              {details.map((detail) => (
                <div key={detail.label} className="py-4">
                  <dt className="text-metadata text-muted-foreground">{detail.label}</dt>
                  <dd className="text-body-sm mt-1.5">
                    {detail.href ? (
                      <a
                        href={detail.href}
                        className="break-all text-foreground hover:text-primary"
                        {...(detail.external
                          ? { rel: "noopener noreferrer", target: "_blank" }
                          : {})}
                      >
                        {detail.lines.join(", ")}
                      </a>
                    ) : (
                      <span className="text-foreground">
                        {detail.lines.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-body-sm mt-6 text-muted-foreground">
              Opening hours are not listed here because they have not been confirmed —
              message the studio before visiting.
            </p>
          </div>

          <div className="lg:col-span-7">
            <h2 className="text-heading-2">Send a message</h2>
            <div className="mt-8">
              <ContactForm />
            </div>
          </div>
        </div>
      </Section>

      {/* The studio, inside and out — see public/images/studio/interior.png
          and public/images/studio/exterior.png in lib/editorial-images.ts. */}
      <Section tone="sunken">
        <p className="text-label text-muted-foreground">The studio</p>
        <h2 className="text-heading-1 mt-3">Inside and out</h2>
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:gap-4">
          <div className="relative aspect-[4/3] overflow-hidden">
            <EditorialImage
              slot="studio-interior"
              caption="Studio interior"
              sizes="(min-width: 640px) 50vw, 100vw"
            />
          </div>
          <div className="relative aspect-[4/3] overflow-hidden">
            <EditorialImage
              slot="studio-exterior"
              caption="Studio exterior"
              sizes="(min-width: 640px) 50vw, 100vw"
            />
          </div>
        </div>
      </Section>
    </>
  );
}
