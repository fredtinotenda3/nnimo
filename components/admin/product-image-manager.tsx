import * as React from "react";
import Link from "next/link";
import {
  detachProductImageAction,
  moveProductImageAction,
  setPrimaryImageAction,
} from "@/app/admin/products/actions";
import { MediaThumb, mediaLabel, type AdminMediaRef } from "@/components/admin/media-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AttachImageForm, RemoveImageButton } from "@/components/admin/product-image-controls";

export type ProductImageRow = {
  id: string;
  position: number;
  isPrimary: boolean;
  media: AdminMediaRef & { originalFilename?: string | null; createdAt?: Date };
};

/**
 * The product gallery.
 *
 * Almost all of it is plain forms posting to server actions — reorder, set
 * primary and remove need no client state, so they have none. Only the two
 * controls that genuinely need interactivity (a pending-aware attach form and a
 * two-step remove confirmation) are client components.
 *
 * "Associate existing media" is the primary path rather than upload-per-product.
 * One photograph often shows several pieces from a range, and ProductImage is a
 * join row, so attaching costs nothing and no file is duplicated.
 */
export function ProductImageManager({
  productId,
  productName,
  images,
  availableMedia,
}: {
  productId: string;
  productName: string;
  images: ProductImageRow[];
  availableMedia: { id: string; altText: string | null; originalFilename: string | null; createdAt: Date }[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {images.length === 0 ? (
        <EmptyState
          title="No photographs yet"
          description="Until a photograph is added, this piece renders on the site as a catalogue card with its name and range — not a broken image."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/media?returnTo=${encodeURIComponent(`/admin/products/${productId}`)}`}>
                Open the media library
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-wrap items-center gap-4 py-4">
              <MediaThumb media={image.media} size={72} label={productName} />

              <div className="min-w-0 flex-1">
                <p className="text-body-sm truncate font-medium">{mediaLabel(image.media)}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {image.isPrimary ? <Badge variant="success">Primary</Badge> : null}
                  {image.media.altText?.trim() ? null : (
                    <Badge variant="neutral">Needs alt text</Badge>
                  )}
                  <span className="text-metadata text-muted-foreground">
                    Position {index + 1} of {images.length}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <form action={moveProductImageAction}>
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <input type="hidden" name="direction" value="up" />
                  <Button type="submit" size="sm" variant="ghost" disabled={index === 0}>
                    <span aria-hidden="true">↑</span>
                    <span className="sr-only">Move {mediaLabel(image.media)} earlier</span>
                  </Button>
                </form>

                <form action={moveProductImageAction}>
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <input type="hidden" name="direction" value="down" />
                  <Button type="submit" size="sm" variant="ghost" disabled={index === images.length - 1}>
                    <span aria-hidden="true">↓</span>
                    <span className="sr-only">Move {mediaLabel(image.media)} later</span>
                  </Button>
                </form>

                {image.isPrimary ? null : (
                  <form action={setPrimaryImageAction}>
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="imageId" value={image.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Make primary
                    </Button>
                  </form>
                )}

                <form action={detachProductImageAction}>
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <RemoveImageButton name={mediaLabel(image.media)} />
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-[var(--radius-md)] border border-border bg-surface p-5">
        <h3 className="text-heading-3">Add a photograph</h3>
        <p className="text-body-sm mt-2 text-muted-foreground">
          Choose an image already in the library. Uploading a new one, and adding alt
          text, both happen in the{" "}
          <Link href="/admin/media" className="text-primary hover:underline">
            media library
          </Link>
          .
        </p>
        <div className="mt-4">
          <AttachImageForm
            productId={productId}
            options={availableMedia.map((media) => ({ id: media.id, label: mediaLabel(media) }))}
          />
        </div>
      </div>
    </div>
  );
}
