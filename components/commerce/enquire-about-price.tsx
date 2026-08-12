import Link from "next/link";
import { whatsappLink } from "@/lib/brand";
import { Button } from "@/components/ui/button";

/**
 * Shown in place of add-to-cart when a piece has no source-verified price.
 *
 * This is the common case: 9 of roughly 330 catalogue pieces have a price the
 * documents establish. Rather than hiding those pieces or inventing a number,
 * the piece stays in the catalogue and the call to action becomes a real
 * conversation with the studio.
 */
export function EnquireAboutPrice({
  productName,
  slug,
  reason,
}: {
  productName: string;
  slug: string;
  reason: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="border-l-2 border-ochre pl-4">
        <p className="text-body-sm text-muted-foreground">{reason}</p>
      </div>

      <Button asChild size="lg">
        <Link href={`/custom?piece=${encodeURIComponent(slug)}`}>Request a price</Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <a
          href={whatsappLink(`Hello Nnino Ceramics, could you tell me the price of "${productName}"?`)}
          rel="noopener noreferrer"
          target="_blank"
        >
          Ask on WhatsApp
        </a>
      </Button>
    </div>
  );
}
