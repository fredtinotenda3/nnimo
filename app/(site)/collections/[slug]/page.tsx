import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicCollectionBySlug, getRelatedCollections } from "@/lib/catalogue";
import { resolveMediaUrl } from "@/lib/media";
import { breadcrumbJsonLd, absoluteUrl } from "@/lib/seo";
import { serialiseJsonLd } from "@/lib/security/json-ld";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCard, type ProductCardProps } from "@/components/catalogue/product-card";
import { EditorialImage } from "@/components/site/editorial-image";
import { ShareLinks } from "@/components/site/share-links";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/**
 * Metadata resolves against the same published-only query as the page, so an
 * unpublished range cannot leak its name and description through a link preview
 * even though the page itself would 404.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getPublicCollectionBySlug(slug);
  if (!collection) return { title: "Collection not found", robots: { index: false } };

  const description =
    collection.description?.trim() ||
    `Pieces from the ${collection.name} range, hand sculptured and hand painted at the Nnino studio in Bulawayo.`;

  return {
    title: collection.name,
    description,
    alternates: { canonical: `/collections/${collection.slug}` },
    openGraph: {
      type: "website",
      title: `${collection.name} · Nnino Ceramics`,
      description,
      url: `/collections/${collection.slug}`,
      ...(collection.heroImage
        ? { images: [{ url: resolveMediaUrl(collection.heroImage) }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${collection.name} · Nnino Ceramics`,
      description,
      ...(collection.heroImage ? { images: [resolveMediaUrl(collection.heroImage)] } : {}),
    },
  };
}

export default async function CollectionDetailPage({ params }: Params) {
  const { slug } = await params;
  const collection = await getPublicCollectionBySlug(slug);

  // A draft or archived range is a 404 publicly, not a redirect — there is
  // nothing at this URL for a visitor or a crawler.
  if (!collection) notFound();

  const related = await getRelatedCollections(collection.id, 3);
  const pieces = collection.products;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serialiseJsonLd(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Collections", path: "/collections" },
              { name: collection.name, path: `/collections/${collection.slug}` },
            ]),
          ),
        }}
      />

      {collection.heroImage ? (
        <section className="relative h-[52svh] min-h-[360px] w-full bg-charcoal">
          <Image
            src={resolveMediaUrl(collection.heroImage)}
            alt={collection.heroImage.altText?.trim() || `${collection.name} range`}
            fill
            priority
            sizes="100vw"
            quality={95}
            className="object-cover"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-charcoal/45" />
          <Container className="relative flex h-full flex-col justify-end pb-12">
            <p className="text-label text-ochre">Range</p>
            <h1 className="text-display mt-4 text-dark-foreground">{collection.name}</h1>
          </Container>
        </section>
      ) : (
        <Section className="pb-0 pt-32 lg:pt-40">
          <nav aria-label="Breadcrumb" className="text-metadata text-muted-foreground">
            <Link href="/collections" className="hover:text-foreground">
              Collections
            </Link>
            <span aria-hidden="true"> / </span>
            <span>{collection.name}</span>
          </nav>
          <p className="text-label mt-8 text-muted-foreground">Range</p>
          <h1 className="text-display mt-4">{collection.name}</h1>
        </Section>
      )}

      {/* Generic mood imagery, only when this range has no hero photograph of
          its own — real collection photography (collection.heroImage, via
          Admin → Media) always takes priority. See
          public/images/collection-atmosphere/default.png in
          lib/editorial-images.ts. */}
      {!collection.heroImage ? (
        <Section contained={false} className="py-0">
          <div className="relative aspect-[21/9] w-full overflow-hidden">
            <EditorialImage
              slot="collection-atmosphere"
              caption={`${collection.name} range`}
              sizes="100vw"
            />
          </div>
        </Section>
      ) : null}

      <Section>
        {collection.description || collection.story ? (
          <div className="max-w-2xl">
            {collection.description ? (
              <p className="text-body-lg text-muted-foreground">{collection.description}</p>
            ) : null}
            {collection.story ? (
              <p className="text-body mt-5 text-muted-foreground">{collection.story}</p>
            ) : null}
          </div>
        ) : null}

        <ShareLinks
          url={absoluteUrl(`/collections/${collection.slug}`)}
          title={collection.name}
          className="mt-8"
        />

        <div className="mt-14">
          <div className="flex items-baseline justify-between gap-4 border-b border-border pb-4">
            <h2 className="text-heading-2">Pieces in this range</h2>
            <span className="text-metadata text-muted-foreground">
              {pieces.length === 1 ? "1 piece" : `${pieces.length} pieces`}
            </span>
          </div>

          <div className="mt-12">
            {pieces.length === 0 ? (
              <EmptyState
                title="No pieces from this range are published yet"
                description="The range is live but none of its pieces have been published for sale. They are in the catalogue and can be published from the admin."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/custom">Enquire about this range</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                {pieces.map((piece: ProductCardProps["product"] & { id: string }, index: number) => (
                  <li key={piece.id}>
                    <ProductCard product={piece} priority={index < 3} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {related.length > 0 ? (
        <Section tone="sunken">
          <h2 className="text-heading-2">Other ranges</h2>
          <ul className="mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3">
            {related.map((item) => (
              <li key={item.id} className="bg-surface">
                <Link
                  href={`/collections/${item.slug}`}
                  className="flex h-full flex-col justify-between gap-6 p-7 transition-colors hover:bg-surface-sunken"
                >
                  <h3 className="text-heading-2">{item.name}</h3>
                  <span className="text-metadata text-muted-foreground">
                    {item._count.products === 1
                      ? "1 piece"
                      : `${item._count.products} pieces`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
