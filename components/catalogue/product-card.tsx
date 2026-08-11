import Link from "next/link";
import { formatDimensions, formatPriceOrRequest, formatWeight } from "@/lib/money";
import { availabilityLabel } from "@/lib/catalogue";
import { GalleryLabel } from "@/components/ui/gallery-label";
import { MediaImage, type MediaRef } from "@/components/catalogue/media-image";

export type ProductCardProps = {
  product: {
    name: string;
    slug: string;
    price: unknown;
    currency: string;
    availability: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "MADE_TO_ORDER" | "CUSTOM_ONLY" | "COMING_SOON" | null;
    heightCm: unknown;
    widthCm: unknown;
    weightKg: unknown;
    collection: { name: string; slug: string } | null;
    images: { media: NonNullable<MediaRef> }[];
  };
  priority?: boolean;
};

/**
 * One piece in a grid. The whole card is a single link, and the physical facts
 * are rendered by the shared gallery-label device so a grid reads as a hang
 * rather than a product listing.
 */
export function ProductCard({ product, priority = false }: ProductCardProps) {
  const media = product.images[0]?.media ?? null;
  const facts = [
    formatDimensions(product.heightCm as never, product.widthCm as never),
    formatWeight(product.weightKg as never),
    availabilityLabel(product.availability),
  ];

  return (
    <Link href={`/products/${product.slug}`} className="group block focus-visible:outline-none">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-sunken">
        <MediaImage
          media={media}
          fallbackTitle={product.name}
          fallbackSubtitle={product.collection?.name ?? null}
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
          priority={priority}
          className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <GalleryLabel
        className="mt-5 transition-colors group-focus-visible:text-primary"
        eyebrow={product.collection?.name ?? null}
        title={product.name}
        facts={facts}
        price={formatPriceOrRequest(product.price as never, product.currency)}
      />
    </Link>
  );
}
