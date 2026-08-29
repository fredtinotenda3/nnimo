import Link from "next/link";
import { getPublicBanner } from "@/lib/marketing/banner";

/**
 * Renders nothing when there is no enabled banner — see getPublicBanner's own
 * "enabled AND has text" rule in lib/marketing/banner.ts. Mounted once, above
 * the header, in app/(site)/layout.tsx, so it appears on every public page
 * without every page needing to remember to render it.
 */
export async function PromoBanner() {
  const banner = await getPublicBanner();
  if (!banner) return null;

  const content = (
    <span className="flex flex-wrap items-center justify-center gap-2 text-center">
      <span>{banner.text}</span>
      {banner.linkUrl && banner.linkLabel ? (
        <span className="font-medium underline underline-offset-4">{banner.linkLabel}</span>
      ) : null}
    </span>
  );

  return (
    <div className="bg-primary px-4 py-2 text-body-sm text-primary-foreground">
      {banner.linkUrl ? (
        <Link href={banner.linkUrl} className="block">
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}
