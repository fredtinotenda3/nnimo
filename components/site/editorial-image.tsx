import Image from "next/image";
import { resolveEditorialImage, type EditorialSlotKey } from "@/lib/editorial-images";
import { cn } from "@/lib/utils";

/**
 * Renders an editorial/atmospheric image slot (see public/images/README.md
 * and lib/editorial-images.ts). Every slot currently resolves to "not
 * filled", so this always renders the fallback panel today — that is
 * expected, not a bug. The panel intentionally echoes the wording and
 * styling of the product photography fallback (`MediaImage`) rather than
 * inventing a second visual language for "no image yet".
 *
 * `caption` is this component's copy, not the registry's alt text — it is
 * shown only in the empty state, to name what the finished section will be
 * (e.g. "Studio interior") without asserting a photograph that isn't there.
 */
export function EditorialImage({
  slot,
  caption,
  sizes,
  className,
  fallbackClassName,
  priority = false,
}: {
  slot: EditorialSlotKey;
  caption: string;
  sizes: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
}) {
  const resolved = resolveEditorialImage(slot);

  if (!resolved.filled) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-sunken px-6 text-center",
          fallbackClassName,
        )}
      >
        <span aria-hidden="true" className="h-px w-8 bg-primary/60" />
        <span className="text-heading-3 text-foreground/75">{caption}</span>
        <span className="text-metadata mt-1 text-muted-foreground">
          Studio photography coming soon
        </span>
      </div>
    );
  }

  return (
    <Image
      src={resolved.src}
      alt={resolved.alt || caption}
      fill
      sizes={sizes}
      priority={priority}
      quality={90}
      className={cn("object-cover", className)}
    />
  );
}
