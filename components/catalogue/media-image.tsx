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
  quality = 90,
  fit = "cover",
}: {
  media: MediaRef;
  fallbackTitle: string;
  fallbackSubtitle?: string | null;
  sizes: string;
  className?: string;
  priority?: boolean;
  fallbackClassName?: string;
  /**
   * Defaults to 90 rather than next/image's own default of 75. Product
   * photography carries fine painted linework and glaze texture that the
   * default quality softens visibly after AVIF/WebP re-encoding — see
   * next.config.ts `images.qualities` for the allow-listed values this can
   * be set to.
   */
  quality?: number;
  /**
   * "cover" (default) fills the frame and crops. "framed" is for a portrait
   * product photograph sitting in a wide/short hero-style slot — instead of
   * cropping most of the photo away, it shows a soft blurred, darkened
   * version of the same image as an ambient backdrop with the full,
   * uncropped photo centred on top.
   */
  fit?: "cover" | "framed";
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

  const src = resolveMediaUrl(media);
  const alt = media.altText?.trim() || fallbackTitle;

  if (fit === "framed") {
    return (
      <div className={cn("relative h-full w-full overflow-hidden bg-charcoal", className)}>
        <Image
          src={src}
          alt=""
          aria-hidden="true"
          fill
          sizes={sizes}
          quality={40}
          className="scale-110 object-cover opacity-60 blur-2xl"
        />
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          quality={95}
          className="object-contain"
        />
      </div>
    );
  }

  return (
    <Image
      src={src}
      // Alt text is the team's, entered with the upload. Falling back to the
      // piece name is better than an empty alt on a content image.
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      quality={quality}
      className={cn("object-cover", className)}
    />
  );
}
