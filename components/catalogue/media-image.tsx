import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export type MediaRef = {
  provider: "LOCAL" | "S3";
  storageKey: string;
  url?: string | null;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
} | null;

/**
 * Renders a `Media` row through the media abstraction, or an elegant fallback.
 *
 * Most of the imported catalogue has no photography yet — the brochure images
 * are 230–270px catalogue thumbnails, too small to present a handmade piece
 * honestly. Rather than a broken frame or a stock photograph, an unphotographed
 * piece renders as a catalogue card: warm panel, the piece name set in the
 * display face, range beneath. It reads as a gallery catalogue entry, which is
 * what it is, and it disappears the moment the team uploads a photograph.
 */
export function MediaImage({
  media,
  fallbackTitle,
  fallbackSubtitle,
  sizes,
  className,
  priority = false,
  fallbackClassName,
}: {
  media: MediaRef;
  fallbackTitle: string;
  fallbackSubtitle?: string | null;
  sizes: string;
  className?: string;
  priority?: boolean;
  fallbackClassName?: string;
}) {
  if (!media) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-sunken px-6 text-center",
          fallbackClassName,
        )}
      >
        <span aria-hidden="true" className="h-px w-8 bg-primary/60" />
        <span className="text-heading-2 text-foreground/75">{fallbackTitle}</span>
        {fallbackSubtitle ? (
          <span className="text-metadata text-muted-foreground">{fallbackSubtitle}</span>
        ) : null}
        <span className="text-metadata mt-1 text-muted-foreground">
          Studio photography coming soon
        </span>
      </div>
    );
  }

  return (
    <Image
      src={resolveMediaUrl(media)}
      // Alt text is the team's, entered with the upload. Falling back to the
      // piece name is better than an empty alt on a content image.
      alt={media.altText?.trim() || fallbackTitle}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", className)}
    />
  );
}
