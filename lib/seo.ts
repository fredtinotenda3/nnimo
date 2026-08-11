import { BRAND } from "@/lib/brand";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl).toString();
}

/**
 * Structured data.
 *
 * Only facts the source documents establish are emitted. In particular there is
 * no `aggregateRating`, no `review` and no `AggregateOffer` — those need real
 * review and stock data, and inventing them to win a rich snippet is both a lie
 * and a Google manual-action risk.
 */
export function organisationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    url: siteUrl,
    slogan: BRAND.tagline,
    founder: { "@type": "Person", name: BRAND.founder },
    address: {
      "@type": "PostalAddress",
      streetAddress: `${BRAND.addressLines[0]}, ${BRAND.addressLines[1]}`,
      addressLocality: BRAND.city,
      addressCountry: "ZW",
    },
    telephone: BRAND.telephone,
    email: BRAND.emails.general,
    sameAs: [`https://instagram.com/${BRAND.social.instagram}`],
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * Product markup. `offers` is emitted only when a price actually exists — a
 * price of 0 or a guessed availability would be structured misinformation.
 */
export function productJsonLd(product: {
  name: string;
  slug: string;
  description?: string | null;
  price?: unknown;
  currency: string;
  availability: string | null;
  material?: string | null;
  weightKg?: unknown;
  images: string[];
}) {
  const schemaAvailability: Record<string, string> = {
    IN_STOCK: "https://schema.org/InStock",
    LOW_STOCK: "https://schema.org/LimitedAvailability",
    OUT_OF_STOCK: "https://schema.org/OutOfStock",
    MADE_TO_ORDER: "https://schema.org/MadeToOrder",
    COMING_SOON: "https://schema.org/PreOrder",
  };

  const priceString = product.price != null ? String(product.price) : null;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url: absoluteUrl(`/products/${product.slug}`),
    ...(product.description ? { description: product.description } : {}),
    ...(product.material ? { material: product.material } : {}),
    ...(product.images.length > 0
      ? { image: product.images.map((src) => absoluteUrl(src)) }
      : {}),
    ...(product.weightKg != null
      ? {
          weight: {
            "@type": "QuantitativeValue",
            value: String(product.weightKg),
            unitCode: "KGM",
          },
        }
      : {}),
    brand: { "@type": "Brand", name: BRAND.name },
    ...(priceString && product.availability && schemaAvailability[product.availability]
      ? {
          offers: {
            "@type": "Offer",
            price: priceString,
            priceCurrency: product.currency,
            availability: schemaAvailability[product.availability],
            url: absoluteUrl(`/products/${product.slug}`),
          },
        }
      : {}),
  };
}
