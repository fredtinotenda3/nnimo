import * as React from "react";
import { getCartItemCount } from "@/lib/commerce/cart";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AttributionCapture } from "@/app/(site)/attribution-capture";
import { PromoBanner } from "@/components/site/promo-banner";

/**
 * Public shell. The header starts transparent over the hero and becomes solid
 * on scroll; `main` carries the id the skip link targets.
 *
 * `AttributionCapture` renders nothing — see its own comment for why it exists
 * and why the /c/[slug] landing page additionally mounts its own instance.
 * `PromoBanner` is a Server Component; it renders nothing itself when no
 * banner is currently enabled (Admin → Content → Promotional banner).
 */
export default async function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Server-resolved so the badge is correct on first paint.
  const cartCount = await getCartItemCount();

  return (
    <div className="flex min-h-dvh flex-col">
      <AttributionCapture />
      <PromoBanner />
      <SiteHeader overHero cartCount={cartCount} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
