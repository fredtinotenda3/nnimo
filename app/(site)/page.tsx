import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { CollectionStatus, ProductLifecycleStage } from "@/lib/generated/prisma/enums";
import { BRAND } from "@/lib/brand";
import { formatDimensions, formatPriceOrRequest, formatWeight } from "@/lib/money";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { GalleryLabel } from "@/components/ui/gallery-label";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Reads live catalogue state, so it must not be captured at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [publishedCollections, featuredPieces, artists] = await Promise.all([
    db.collection.findMany({
      where: { status: CollectionStatus.PUBLISHED },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
      take: 6,
      select: { id: true, name: true, slug: true, description: true },
    }),
    db.product.findMany({
      where: { lifecycleStage: ProductLifecycleStage.PUBLISHED },
      orderBy: [{ featured: "desc" }, { name: "asc" }],
      take: 6,
      select: {
        id: true,
        name: true,
        slug: true,
        heightCm: true,
        widthCm: true,
        weightKg: true,
        price: true,
        currency: true,
        collection: { select: { name: true } },
      },
    }),
    db.artist.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative flex min-h-[88svh] items-end overflow-hidden bg-charcoal">
        {/*
          The hero image slot is intentionally empty until the team uploads a
          rights-cleared crop through the admin. Rather than shipping a stock
          photograph, the slot renders as a deep charcoal field so the
          typography carries the page and the real photograph drops in later
          without any layout change.
        */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-charcoal via-charcoal to-[#1d1a18]"
        />
        <Container className="relative pb-16 pt-32 sm:pb-24 lg:pb-32">
          <p className="text-label text-ochre">
            {BRAND.city}, {BRAND.country}
          </p>
          <h1 className="text-display mt-5 max-w-4xl text-warm-white">
            Made by hand,
            <br />
            with heart.
          </h1>
          <p className="text-body-lg mt-8 max-w-xl text-warm-white/75">
            Every piece is individually designed, hand sculptured, hand painted, and
            signed at the bottom. One piece takes five to six weeks from clay to
            finished work.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Button asChild size="lg">
              <Link href="/shop">Browse the shop</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-warm-white/40 text-warm-white hover:bg-warm-white/10">
              <Link href="/legacy">The Nnino story</Link>
            </Button>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------- The work */}
      <Section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-label text-muted-foreground">Selected pieces</p>
            <h2 className="text-heading-1 mt-3">Currently in the gallery</h2>
          </div>
          {featuredPieces.length > 0 ? (
            <Link href="/shop" className="text-nav text-primary hover:underline">
              See everything
            </Link>
          ) : null}
        </div>

        <div className="mt-12">
          {featuredPieces.length === 0 ? (
            <EmptyState
              title="No pieces are published yet"
              description="The catalogue has been imported from the Nnino brochures, but nothing has been published for sale. Publish a piece from the admin and it will appear here."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/products">Open the catalogue</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {featuredPieces.map((piece) => (
                <li key={piece.id}>
                  <Link href={`/shop/${piece.slug}`} className="group block">
                    <div className="aspect-[4/5] w-full bg-surface-sunken transition-colors group-hover:bg-border" />
                    <GalleryLabel
                      className="mt-5"
                      eyebrow={piece.collection?.name ?? null}
                      title={piece.name}
                      facts={[
                        formatDimensions(piece.heightCm, piece.widthCm),
                        formatWeight(piece.weightKg),
                      ]}
                      price={formatPriceOrRequest(piece.price, piece.currency)}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------- The story */}
      <Section tone="sunken">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="text-label text-muted-foreground">The Nnino legacy</p>
            <h2 className="text-heading-1 mt-3">
              Exposing local talent in sculpture and art
            </h2>
          </div>
          <div className="lg:col-span-7">
            <p className="text-quote text-foreground">
              Nnino Ceramics was established by {BRAND.founder} in {BRAND.city},{" "}
              {BRAND.country}.
            </p>
            <p className="text-body-lg mt-6 text-muted-foreground">
              Each piece is individually designed and handcrafted with passion and
              style to create a unique product, exposing the local talent in
              sculpture and art. Behind the work is a team of {BRAND.teamSize} —
              potters, sculptors, painters, a moulder, and the kiln and glazing
              hands that finish every piece.
            </p>
            <Button asChild variant="link" className="mt-6">
              <Link href="/legacy">Read the full story</Link>
            </Button>
          </div>
        </div>
      </Section>

      {/* --------------------------------------------------------- Collections */}
      <Section>
        <p className="text-label text-muted-foreground">Ranges</p>
        <h2 className="text-heading-1 mt-3">Collections</h2>
        <div className="mt-12">
          {publishedCollections.length === 0 ? (
            <EmptyState
              title="No collections are published yet"
              description="All ranges from the brochure have been imported as drafts. Publish one from the admin to show it here."
            />
          ) : (
            <ul className="grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {publishedCollections.map((collection) => (
                <li key={collection.id} className="bg-surface">
                  <Link
                    href={`/collections/${collection.slug}`}
                    className="flex h-full flex-col p-7 transition-colors hover:bg-surface-sunken"
                  >
                    <h3 className="text-heading-2">{collection.name}</h3>
                    {collection.description ? (
                      <p className="text-body-sm mt-3 text-muted-foreground">
                        {collection.description}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------- The family */}
      <Section tone="sunken">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-label text-muted-foreground">The people</p>
            <h2 className="text-heading-1 mt-3">Meet the Nnino family</h2>
          </div>
          <Link href="/family" className="text-nav text-primary hover:underline">
            Meet everyone
          </Link>
        </div>
        <ul className="mt-12 flex flex-wrap gap-3">
          {artists.map((artist) => (
            <li key={artist.id}>
              <Badge variant="outline" className="px-3 py-2">
                <span className="text-body-sm">{artist.name}</span>
                <span className="text-metadata text-muted-foreground">{artist.role}</span>
              </Badge>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
