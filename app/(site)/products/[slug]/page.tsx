import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  availabilityLabel,
  getDefaultLeadTimeDays,
  getPublicProductBySlug,
  getRelatedProducts,
  isPurchasable,
} from "@/lib/catalogue";
import { formatDimensions, formatPriceOrRequest, formatWeight } from "@/lib/money";
import { resolveMediaUrl } from "@/lib/media";
import { whatsappLink } from "@/lib/brand";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo";
import {
  PURCHASABILITY_MESSAGE,
  evaluatePurchasability,
} from "@/lib/commerce/purchasability";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MediaImage, type MediaRef } from "@/components/catalogue/media-image";
import { AddToCart } from "@/components/commerce/add-to-cart";
import { EnquireAboutPrice } from "@/components/commerce/enquire-about-price";
import { ProductCard } from "@/components/catalogue/product-card";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** One row of product photography, as selected by getPublicProductBySlug. */
type ProductImageRow = { id: string; media: NonNullable<MediaRef> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);
  if (!product) return { title: "Piece not found", robots: { index: false } };

  // Falls back to a factual sentence rather than inventing marketing copy for a
  // product whose description the business has not written yet.
  const description =
    product.description?.trim() ||
    [
      product.name,
      product.collection ? `from the ${product.collection.name} range` : null,
      "— hand sculptured and hand painted at the Nnino studio in Bulawayo.",
    ]
      .filter(Boolean)
      .join(" ");

  const primary = product.images[0]?.media;

  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${product.name} · Nnino Ceramics`,
      description,
      url: `/products/${product.slug}`,
      ...(primary ? { images: [{ url: resolveMediaUrl(primary) }] } : {}),
    },
  };
}

export default async function ProductDetailPage({ params }: Params) {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);
  if (!product) notFound();

  const [related, defaultLeadTime] = await Promise.all([
    getRelatedProducts({
      productId: product.id,
      collectionId: product.collection?.id ?? null,
    }),
    getDefaultLeadTimeDays(),
  ]);

  const verdict = evaluatePurchasability({
    lifecycleStage: "PUBLISHED", // getPublicProductBySlug already filtered on this
    availability: product.availability,
    price: product.price,
    inventory: product.inventory,
  });

  const price = formatPriceOrRequest(product.price, product.currency);
  const availability = availabilityLabel(product.availability);

  // Lead time is only stated when it is actually known: the product's own
  // override, otherwise the studio-wide setting. Never a guess.
  const leadTimeDays = product.productionLeadTimeDays ?? defaultLeadTime;
  const showLeadTime =
    leadTimeDays !== null &&
    (product.availability === "MADE_TO_ORDER" || product.availability === "CUSTOM_ONLY");

  /** Physical facts, each rendered only when recorded. */
  const specs: { label: string; value: string }[] = [];
  const dimensions = formatDimensions(product.heightCm, product.widthCm);
  const weight = formatWeight(product.weightKg);
  if (dimensions) specs.push({ label: "Dimensions", value: dimensions });
  if (weight) specs.push({ label: "Weight", value: weight });
  if (product.material) specs.push({ label: "Material", value: product.material });
  if (product.sku) specs.push({ label: "Reference", value: product.sku });
  if (showLeadTime && leadTimeDays) {
    specs.push({
      label: "Made to order in",
      value: `about ${Math.round(leadTimeDays / 7)} weeks`,
    });
  }

  const images = product.images;
  const enquiryMessage = `Hello Nnino Ceramics, I am interested in "${product.name}".`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productJsonLd({
              name: product.name,
              slug: product.slug,
              description: product.description,
              price: product.price,
              currency: product.currency,
              availability: product.availability,
              material: product.material,
              weightKg: product.weightKg,
              images: images.map((image: ProductImageRow) => resolveMediaUrl(image.media)),
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Shop", path: "/shop" },
              ...(product.collection
                ? [
                    {
                      name: product.collection.name,
                      path: `/collections/${product.collection.slug}`,
                    },
                  ]
                : []),
              { name: product.name, path: `/products/${product.slug}` },
            ]),
          ),
        }}
      />

      <Section className="pt-28 lg:pt-36">
        <nav aria-label="Breadcrumb" className="text-metadata text-muted-foreground">
          <Link href="/shop" className="hover:text-foreground">
            Shop
          </Link>
          {product.collection ? (
            <>
              <span aria-hidden="true"> / </span>
              <Link
                href={`/collections/${product.collection.slug}`}
                className="hover:text-foreground"
              >
                {product.collection.name}
              </Link>
            </>
          ) : null}
          <span aria-hidden="true"> / </span>
          <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="mt-10 grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/* ------------------------------------------------------- Photography */}
          <div className="lg:col-span-7">
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-sunken">
              <MediaImage
                media={images[0]?.media ?? null}
                fallbackTitle={product.name}
                fallbackSubtitle={product.collection?.name ?? null}
                sizes="(min-width: 1024px) 58vw, 100vw"
                priority
              />
            </div>

            {images.length > 1 ? (
              <ul className="mt-4 grid grid-cols-4 gap-3">
                {images.slice(1, 5).map((image: ProductImageRow) => (
                  <li
                    key={image.id}
                    className="relative aspect-square overflow-hidden bg-surface-sunken"
                  >
                    <Image
                      src={resolveMediaUrl(image.media)}
                      alt={image.media.altText?.trim() || `${product.name}, another view`}
                      fill
                      sizes="(min-width: 1024px) 14vw, 22vw"
                      className="object-cover"
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* ------------------------------------------------------------ Details */}
          <div className="lg:col-span-5">
            {product.collection ? (
              <Link
                href={`/collections/${product.collection.slug}`}
                className="text-label text-muted-foreground hover:text-primary"
              >
                {product.collection.name}
              </Link>
            ) : null}

            <h1 className="text-heading-1 mt-3">{product.name}</h1>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <p className="text-price">{price}</p>
              {availability ? (
                <Badge variant={isPurchasable(product.availability) ? "success" : "neutral"}>
                  {availability}
                </Badge>
              ) : null}
            </div>

            {product.description ? (
              <p className="text-body mt-8 text-muted-foreground">{product.description}</p>
            ) : null}

            {product.story ? (
              <div className="mt-8 border-l-2 border-primary/40 pl-5">
                <p className="text-body text-muted-foreground">{product.story}</p>
              </div>
            ) : null}

            {specs.length > 0 ? (
              <dl className="mt-10 divide-y divide-border border-y border-border">
                {specs.map((spec) => (
                  <div key={spec.label} className="flex justify-between gap-6 py-3">
                    <dt className="text-metadata text-muted-foreground">{spec.label}</dt>
                    <dd className="text-body-sm text-right">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {product.artist ? (
              <p className="text-body-sm mt-8 text-muted-foreground">
                Made by <span className="text-foreground">{product.artist.name}</span>,{" "}
                {product.artist.role.toLowerCase()}.
              </p>
            ) : null}

            {/*
              Purchasability is decided on the SERVER, by the same
              evaluatePurchasability() the cart and checkout call. A piece with no
              source-verified price can never render add-to-cart, and the branch is
              not a UI preference — addToCart re-evaluates it and refuses
              regardless of what was rendered here.
            */}
            <div className="mt-10 flex flex-col gap-3">
              {verdict.purchasable ? (
                <AddToCart
                  slug={product.slug}
                  madeToOrder={product.availability === "MADE_TO_ORDER"}
                />
              ) : (
                <EnquireAboutPrice
                  productName={product.name}
                  slug={product.slug}
                  reason={PURCHASABILITY_MESSAGE[verdict.reason]}
                />
              )}

              <Button asChild size="lg" variant="outline">
                <a
                  href={whatsappLink(enquiryMessage)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  WhatsApp the studio
                </a>
              </Button>
            </div>

            {product.careInstructions ? (
              <div className="mt-10">
                <h2 className="text-label text-muted-foreground">Care</h2>
                <p className="text-body-sm mt-3 text-muted-foreground">
                  {product.careInstructions}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </Section>

      {related.length > 0 ? (
        <Section tone="sunken">
          <h2 className="text-heading-2">
            {product.collection ? `More from ${product.collection.name}` : "More pieces"}
          </h2>
          <ul className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((piece) => (
              <li key={piece.id}>
                <ProductCard product={piece} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
