import * as React from "react";
import { cn } from "@/lib/utils";

export interface GalleryLabelProps extends React.ComponentProps<"div"> {
  /** Range or collection the piece belongs to. */
  eyebrow?: string | null;
  title: string;
  /** Physical facts: dimensions, weight, material. Nulls are dropped. */
  facts?: (string | null | undefined)[];
  /** Formatted price, or the "Price on request" fallback. */
  price?: string | null;
}

/**
 * The site's signature device: a museum wall label.
 *
 * Every Nnino piece is one-off, hand-sculpted and signed underneath, so the
 * catalogue is closer to a gallery hang than a product grid. Rendering the
 * physical facts as a wall label — hairline terracotta rule, name, then
 * dimensions and weight in small caps — is the one distinctive move in the
 * system; everything around it stays deliberately quiet.
 *
 * Nulls are dropped rather than shown as a placeholder, because most of the
 * imported catalogue genuinely has no measured weight yet and inventing one
 * would be worse than omitting it.
 */
function GalleryLabel({
  className,
  eyebrow,
  title,
  facts,
  price,
  ...props
}: GalleryLabelProps) {
  const shownFacts = (facts ?? []).filter((fact): fact is string => Boolean(fact));

  return (
    <div className={cn("gallery-label", className)} {...props}>
      {eyebrow ? (
        <p className="text-metadata mb-1.5 text-muted-foreground">{eyebrow}</p>
      ) : null}
      <h3 className="text-heading-3">{title}</h3>
      {shownFacts.length > 0 ? (
        <dl className="mt-2">
          <dt className="sr-only">Dimensions and weight</dt>
          <dd className="text-metadata text-muted-foreground">
            {shownFacts.join(" · ")}
          </dd>
        </dl>
      ) : null}
      {price ? <p className="text-price mt-3">{price}</p> : null}
    </div>
  );
}

export { GalleryLabel };
