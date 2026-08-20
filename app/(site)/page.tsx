import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BRAND, whatsappLink } from "@/lib/brand";
import {
  getContentBlocks,
  getFeaturedCollections,
  getFeaturedProducts,
  getPublicTeam,
} from "@/lib/catalogue";
import {
  ANTELOPE_VASE,
  GIRAFFE_TUREEN_VIEWS,
  HERO_PIECE,
  MOTIF,
  TEAM_PHOTO,
} from "@/lib/brand-assets";
import { organisationJsonLd } from "@/lib/seo";
import { serialiseJsonLd } from "@/lib/security/json-ld";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCard } from "@/components/catalogue/product-card";
import { CollectionCard } from "@/components/catalogue/collection-card";

export const metadata: Metadata = {
  title: "Nnino Ceramics — Made By Hand, With Heart",
  description:
    "Handcrafted ceramics and sculpture from Bulawayo, Zimbabwe. Every piece is individually designed, hand sculptured, hand painted and signed.",
  alternates: { canonical: "/" },
};

// Reads live catalogue state — publishing a piece must show up immediately.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [collections, pieces, team, copy] = await Promise.all([
    getFeaturedCollections(3),
    getFeaturedProducts(6),
    getPublicTeam(),
    getContentBlocks([
      "homepage.hero.headline",
      "legacy.origin",
      "about.products",
    ]),
  ]);

  const headline = copy.get("homepage.hero.headline") ?? BRAND.tagline;
  const origin = copy.get("legacy.origin");
  const craft = copy.get("about.products");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serialiseJsonLd(organisationJsonLd()) }}
      />

      {/* ============================================================== 1. Hero
          Split rather than full-bleed: the supplied photograph is 810x1080, and
          stretching it across a 1440px viewport would soften the one thing that
          has to look sharp. Type holds the left, the piece holds the right.

          Art direction (Phase 9): checked object-cover's crop direction against
          the container's aspect ratio at every breakpoint currently in use —
          mobile's 4:5 frame (0.80) and the desktop min-h-[92svh] column (>0.75
          on any realistic viewport) are both wider, relative to height, than the
          source photograph's 0.75 ratio, so object-cover always trims the sides
          and never the top or bottom; the full height of the piece stays in
          frame at every size this ships at today. The focal point — the four
          giraffe heads forming the lid handle — sits slightly above centre, so
          object-position is set explicitly rather than left to the 50/50
          default, as a guard for any future container ratio narrow enough to
          crop vertically instead. */}
      <section className="relative bg-charcoal">
        <div className="grid lg:min-h-[92svh] lg:grid-cols-2">
          <div className="order-2 flex flex-col justify-center px-5 pb-20 pt-14 sm:px-8 lg:order-1 lg:px-14 lg:py-28 xl:px-20">
            <p className="text-label text-ochre">
              {BRAND.city}, {BRAND.country}
            </p>
            <h1 className="text-display mt-6 text-dark-foreground">{headline}</h1>
            <p className="text-body-lg mt-8 max-w-md text-dark-muted-foreground">
              Individually designed, hand sculptured, hand painted, and signed at the
              bottom of every piece.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Button asChild size="lg">
                <Link href="/shop">Browse the collection</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-dark-border text-dark-foreground hover:bg-dark-foreground/10"
              >
                <Link href="/about">The Nnino story</Link>
              </Button>
            </div>
          </div>

          <div className="relative order-1 aspect-[4/5] w-full lg:order-2 lg:aspect-auto lg:h-full">
            <Image
              src={HERO_PIECE.src}
              alt={HERO_PIECE.alt}
              width={HERO_PIECE.width}
              height={HERO_PIECE.height}
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="h-full w-full object-cover object-[50%_42%]"
            />
          </div>
        </div>
      </section>

      {/* ================================================= 2. Brand statement */}
      <Section>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-label text-muted-foreground">Nnino Ceramics</p>
          <p className="text-quote mt-6 text-foreground">
            {origin ??
              `Nnino Ceramics was established by ${BRAND.founder} in ${BRAND.city}, ${BRAND.country}.`}
          </p>
        </div>
      </Section>

      {/* =============================================== 3. Featured collections */}
      <Section tone="sunken">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-label text-muted-foreground">Ranges</p>
            <h2 className="text-heading-1 mt-3">Collections</h2>
          </div>
          <Link href="/collections" className="text-nav text-primary hover:underline">
            All collections
          </Link>
        </div>

        <div className="mt-12">
          {collections.length === 0 ? (
            <EmptyState
              title="No collections are published yet"
              description="Every range from the Nnino brochure has been imported as a draft. Publish one from the admin and it will appear here."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/collections">Open collections</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((collection, index) => (
                <li key={collection.id}>
                  <CollectionCard collection={collection} priority={index === 0} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* ================================================== 4. Featured products */}
      <Section>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-label text-muted-foreground">Selected pieces</p>
            <h2 className="text-heading-1 mt-3">In the gallery</h2>
          </div>
          {pieces.length > 0 ? (
            <Link href="/shop" className="text-nav text-primary hover:underline">
              See everything
            </Link>
          ) : null}
        </div>

        <div className="mt-12">
          {pieces.length === 0 ? (
            <EmptyState
              title="No pieces are published yet"
              description="The catalogue is imported and waiting. Publishing is a separate decision from importing, so nothing is offered for sale until the team says so."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/products">Open the catalogue</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {pieces.map((piece) => (
                <li key={piece.id}>
                  <ProductCard product={piece} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* ===================================================== 5. Craftsmanship */}
      <Section tone="sunken">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <div className="relative aspect-[3/4] w-full overflow-hidden">
              <Image
                src={ANTELOPE_VASE.src}
                alt={ANTELOPE_VASE.alt}
                fill
                sizes="(min-width: 1024px) 45vw, 90vw"
                className="object-cover"
              />
            </div>
          </div>
          <div className="lg:col-span-6">
            <p className="text-label text-muted-foreground">Craftsmanship</p>
            <h2 className="text-heading-1 mt-3">Five to six weeks, by hand</h2>
            <p className="text-body-lg mt-6 text-muted-foreground">
              {craft ??
                "Each and every piece is individually designed, handmade, hand sculptured and hand painted, and signed at the bottom."}
            </p>
            <dl className="mt-10 grid gap-6 sm:grid-cols-2">
              <div className="gallery-label">
                <dt className="text-metadata text-muted-foreground">Studio</dt>
                <dd className="text-heading-3 mt-1">A team of {BRAND.teamSize}</dd>
              </div>
              <div className="gallery-label">
                <dt className="text-metadata text-muted-foreground">Every piece</dt>
                <dd className="text-heading-3 mt-1">Signed underneath</dd>
              </div>
            </dl>
          </div>
        </div>
      </Section>

      {/* ==================================================== 6. Story / legacy */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="text-label text-muted-foreground">The Nnino legacy</p>
            <h2 className="text-heading-1 mt-3">
              Exposing local talent in sculpture and art
            </h2>
          </div>
          <div className="lg:col-span-7">
            <p className="text-body-lg text-muted-foreground">
              {origin ??
                `Nnino Ceramics was established by ${BRAND.founder} in ${BRAND.city}.`}
            </p>
            <Button asChild variant="link" className="mt-6">
              <Link href="/about">Read the full story</Link>
            </Button>
          </div>
        </div>

        {/* Four views of one piece — the same tureen from every side, which is how
            a one-off is actually assessed. */}
        <ul className="mt-16 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {GIRAFFE_TUREEN_VIEWS.map((view) => (
            <li key={view.src} className="relative aspect-[3/4] overflow-hidden">
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
      </Section>

      {/* ================================================ 7. Nnino Family preview */}
      <Section tone="sunken">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <div className="relative aspect-[3/2] w-full overflow-hidden">
              <Image
                src={TEAM_PHOTO.src}
                alt={TEAM_PHOTO.alt}
                fill
                sizes="(min-width: 1024px) 55vw, 90vw"
                className="object-cover"
              />
            </div>
          </div>
          <div className="lg:col-span-5">
            <p className="text-label text-muted-foreground">The people</p>
            <h2 className="text-heading-1 mt-3">Meet the Nnino family</h2>
            <p className="text-body mt-6 text-muted-foreground">
              Potters, sculptors, painters, a moulder, and the kiln and glazing hands
              that finish every piece.
            </p>
            {team.length > 0 ? (
              <ul className="mt-8 flex flex-col divide-y divide-border border-t border-border">
                {team.slice(0, 5).map((member) => (
                  <li
                    key={member.id}
                    className="flex items-baseline justify-between gap-4 py-3"
                  >
                    <span className="text-body-sm font-medium">{member.name}</span>
                    <span className="text-metadata text-muted-foreground">
                      {member.role}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button asChild variant="link" className="mt-6">
              <Link href="/family">Meet everyone</Link>
            </Button>
          </div>
        </div>
      </Section>

      {/* =============================================== 8. Custom commissions */}
      <Section className="relative overflow-hidden">
        {/* The brand's own motif, used once and kept almost invisible. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `url(${MOTIF.src})`,
            backgroundSize: "420px auto",
            backgroundRepeat: "repeat",
          }}
        />
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="text-label text-muted-foreground">Commissions</p>
          <h2 className="text-heading-1 mt-3">Have a piece made for you</h2>
          <p className="text-body-lg mt-6 text-muted-foreground">
            Custom sculptures, corporate gifts, dinner services and event pieces. Tell
            the studio what you have in mind and they will come back to you with a
            quotation.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/custom">Start a commission</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a
                href={whatsappLink(
                  "Hello Nnino Ceramics, I would like to discuss a commission.",
                )}
                rel="noopener noreferrer"
                target="_blank"
              >
                WhatsApp the studio
              </a>
            </Button>
          </div>
        </div>
      </Section>

      {/* ====================================================== 9. Closing CTA */}
      <section className="bg-charcoal">
        <Container>
          <div className="flex flex-col items-start gap-8 py-20 lg:flex-row lg:items-center lg:justify-between lg:py-28">
            <div>
              <h2 className="text-heading-1 max-w-xl text-dark-foreground">{BRAND.tagline}</h2>
              <p className="text-body mt-4 max-w-md text-dark-muted-foreground">
                Visit the studio at {BRAND.addressLines[0]}, {BRAND.addressLines[1]}, or
                send a message.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Button asChild size="lg">
                <Link href="/contact">Contact the studio</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-dark-border text-dark-foreground hover:bg-dark-foreground/10"
              >
                <Link href="/collections">Explore collections</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* 10. Footer comes from app/(site)/layout.tsx */}
    </>
  );
}
