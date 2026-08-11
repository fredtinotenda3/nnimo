import Link from "next/link";
import { MediaImage, type MediaRef } from "@/components/catalogue/media-image";

export type CollectionCardProps = {
  collection: {
    name: string;
    slug: string;
    description: string | null;
    heroImage: MediaRef;
    _count: { products: number };
  };
  priority?: boolean;
};

export function CollectionCard({ collection, priority = false }: CollectionCardProps) {
  const count = collection._count.products;

  return (
    <Link href={`/collections/${collection.slug}`} className="group block">
      <div className="relative aspect-[3/2] w-full overflow-hidden bg-surface-sunken">
        <MediaImage
          media={collection.heroImage}
          fallbackTitle={collection.name}
          fallbackSubtitle="Range"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 90vw"
          priority={priority}
          className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <div className="gallery-label mt-5">
        <h3 className="text-heading-2">{collection.name}</h3>
        {collection.description ? (
          <p className="text-body-sm mt-2 max-w-prose text-muted-foreground">
            {collection.description}
          </p>
        ) : null}
        <p className="text-metadata mt-3 text-muted-foreground">
          {count === 1 ? "1 piece" : `${count} pieces`}
        </p>
      </div>
    </Link>
  );
}
