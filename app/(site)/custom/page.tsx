import type { Metadata } from "next";
import Image from "next/image";
import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE, getContentBlocks } from "@/lib/catalogue";
import { GIRAFFE_TUREEN_VIEWS, HERO_PIECE } from "@/lib/brand-assets";
import { BRAND, whatsappLink } from "@/lib/brand";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { CommissionForm } from "@/components/site/commission-form";

export const metadata: Metadata = {
  title: "Custom Commissions",
  description:
    "Commission a handmade Nnino piece — custom sculptures, corporate gifts, dinner services and event pieces, made to order in Bulawayo.",
  alternates: { canonical: "/custom" },
  openGraph: { title: "Custom Commissions · Nnino Ceramics", url: "/custom" },
};

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Tell the studio what you need",
    body: "Shapes, animals, colours, quantities, how the piece will be used. Reference images help; you can send them on WhatsApp once the studio replies.",
  },
  {
    title: "The studio quotes",
    body: "Nnino reviews the request and comes back with a price and a realistic timeline. Nothing is charged until you approve it.",
  },
  {
    title: "It is made by hand",
    body: "Sculptured, painted, glazed and fired. Around five to six weeks, depending on drying conditions.",
  },
  {
    title: "Delivery or collection",
    body: "Collect from the studio in Bulawayo, or arrange delivery with the team.",
  },
];

export default async function CustomPage({
  searchParams,
}: {
  searchParams: Promise<{ piece?: string }>;
}) {
  const { piece: pieceSlug } = await searchParams;
  const copy = await getContentBlocks(["commissions.intro"]);

  // If the visitor arrived from a product page, resolve the slug to a real
  // published piece. An unknown or unpublished slug is simply ignored rather
  // than echoed back into the page.
  const piece =
    pieceSlug && pieceSlug.length < 200
      ? await db.product.findFirst({
          where: { slug: pieceSlug, ...PUBLIC_PRODUCT_WHERE },
          select: { name: true },
        })
      : null;

  return (
    <>
      <section className="relative bg-charcoal">
        <div className="grid lg:grid-cols-2">
          <div className="order-2 flex flex-col justify-center px-5 pb-20 pt-14 sm:px-8 lg:order-1 lg:px-14 lg:py-28">
            <p className="text-label text-ochre">Commissions</p>
            <h1 className="text-display mt-6 text-warm-white">
              Have a piece
              <br />
              made for you
            </h1>
            <p className="text-body-lg mt-8 max-w-md text-warm-white/75">
              {copy.get("commissions.intro") ??
                "Nnino works to commission: sculptures, corporate and branded pieces, dinner services, and pieces for events. Every commission is designed and made by hand in the Bulawayo studio."}
            </p>
          </div>
          <div className="relative order-1 aspect-[4/5] w-full lg:order-2 lg:aspect-auto">
            <Image
              src={HERO_PIECE.src}
              alt={HERO_PIECE.alt}
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      <Section>
        <p className="text-label text-muted-foreground">How it works</p>
        <h2 className="text-heading-1 mt-3">From conversation to kiln</h2>
        <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="gallery-label">
              <p className="text-metadata text-muted-foreground">
                Step {index + 1}
              </p>
              <h3 className="text-heading-3 mt-2">{step.title}</h3>
              <p className="text-body-sm mt-3 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="sunken">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {GIRAFFE_TUREEN_VIEWS.map((view) => (
            <li key={view.src} className="relative aspect-square overflow-hidden">
              <Image
                src={view.src}
                alt={view.alt}
                fill
                sizes="(min-width: 1024px) 24vw, 45vw"
                className="object-cover"
              />
            </li>
          ))}
        </ul>
        <p className="text-body-sm mt-6 max-w-2xl text-muted-foreground">
          One commissioned tureen, photographed from every side. Each piece is
          sculptured individually, so no two are the same.
        </p>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <p className="text-label text-muted-foreground">Enquire</p>
            <h2 className="text-heading-1 mt-3">Start a commission</h2>
            <p className="text-body mt-6 text-muted-foreground">
              The studio replies to every enquiry. There is no obligation and nothing to
              pay until you have a quotation you are happy with.
            </p>
            <div className="mt-8 border-t border-border pt-6">
              <p className="text-metadata text-muted-foreground">Prefer to talk?</p>
              <a
                href={whatsappLink("Hello Nnino Ceramics, I would like to discuss a commission.")}
                className="text-body-sm mt-2 block text-primary hover:underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                WhatsApp {BRAND.whatsapp}
              </a>
              <a
                href={`mailto:${BRAND.emails.sales}`}
                className="text-body-sm mt-2 block break-all text-primary hover:underline"
              >
                {BRAND.emails.sales}
              </a>
            </div>
          </div>
          <div className="lg:col-span-8">
            <CommissionForm piece={piece?.name} />
          </div>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-label text-muted-foreground">Trade &amp; hospitality</p>
          <h2 className="text-heading-1 mt-3">Hotels, lodges and interiors</h2>
          <p className="text-body-lg mt-6 text-muted-foreground">
            Nnino has produced specially designed handcrafted safari ceramics for the
            hospitality trade. If you are buying for a hotel, lodge, restaurant, gallery
            or gift shop, use the form above and choose a bulk or wholesale order — the
            studio will quote on volume.
          </p>
          <Button asChild size="lg" variant="outline" className="mt-8">
            <a href={`mailto:${BRAND.emails.general}?subject=Wholesale%20enquiry`}>
              Email the studio
            </a>
          </Button>
        </div>
      </Section>
    </>
  );
}
