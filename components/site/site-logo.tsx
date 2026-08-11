import Image from "next/image";
import { cn } from "@/lib/utils";
import { WORDMARK } from "@/lib/brand-assets";

/**
 * The real Nnino wordmark, taken from the supplied brand artwork.
 *
 * The asset is black ink on white, so `mix-blend-multiply` drops the white into
 * whatever surface sits behind it — no alpha editing of the original, and it
 * sits correctly on both the warm background and the charcoal hero.
 */
export function SiteLogo({
  className,
  invert = false,
}: {
  className?: string;
  /** Over dark imagery: lighten the mark instead of multiplying it. */
  invert?: boolean;
}) {
  return (
    <Image
      src={WORDMARK.src}
      alt={WORDMARK.alt}
      width={WORDMARK.width}
      height={WORDMARK.height}
      priority
      className={cn(
        "h-auto w-auto",
        invert ? "mix-blend-screen invert" : "mix-blend-multiply",
        className,
      )}
    />
  );
}
