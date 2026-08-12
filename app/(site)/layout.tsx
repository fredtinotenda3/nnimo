import * as React from "react";
import { getCartItemCount } from "@/lib/commerce/cart";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Public shell. The header starts transparent over the hero and becomes solid
 * on scroll; `main` carries the id the skip link targets.
 */
export default async function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Server-resolved so the badge is correct on first paint.
  const cartCount = await getCartItemCount();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader overHero cartCount={cartCount} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
