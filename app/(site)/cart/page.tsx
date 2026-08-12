import type { Metadata } from "next";
import Link from "next/link";
import { getCartView } from "@/lib/commerce/cart";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CartLines } from "@/components/commerce/cart-lines";

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cart = await getCartView();

  return (
    <Section className="pt-32 lg:pt-40">
      <p className="text-label text-muted-foreground">Your selection</p>
      <h1 className="text-display mt-4">Cart</h1>

      {cart.lines.length === 0 ? (
        <div className="mt-14 max-w-2xl">
          <EmptyState
            title="Your cart is empty"
            description="Pieces you add will be held here. Every piece is individually made, so what you choose is genuinely one of a kind."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/shop">Browse the collection</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-14 grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <CartLines lines={cart.lines} />
          </div>

          <aside className="lg:col-span-5">
            <div className="border border-border bg-surface p-7">
              <h2 className="text-heading-2">Summary</h2>

              <dl className="mt-6 divide-y divide-border border-y border-border">
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-body-sm text-muted-foreground">Subtotal</dt>
                  <dd className="text-body-sm">{cart.subtotalLabel}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-body-sm text-muted-foreground">Delivery</dt>
                  {/* Not a fabricated flat fee. The studio quotes it. */}
                  <dd className="text-body-sm text-right">Confirmed separately</dd>
                </div>
              </dl>

              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-label text-muted-foreground">Total</span>
                <span className="text-price">{cart.subtotalLabel}</span>
              </div>
              <p className="text-metadata mt-3 text-muted-foreground">
                Excludes delivery. If you choose delivery, the studio confirms the cost
                with you before dispatch.
              </p>

              {cart.blockedCount > 0 ? (
                <p className="text-body-sm mt-6 border-l-2 border-destructive pl-3 text-destructive">
                  {cart.blockedCount === 1
                    ? "One piece in your cart cannot be ordered online right now. Remove it, or ask the studio about it, to continue."
                    : `${cart.blockedCount} pieces in your cart cannot be ordered online right now. Remove them, or ask the studio, to continue.`}
                </p>
              ) : null}

              <div className="mt-7 flex flex-col gap-3">
                <Button asChild size="lg" disabled={!cart.checkoutReady}>
                  {cart.checkoutReady ? (
                    <Link href="/checkout">Continue to checkout</Link>
                  ) : (
                    <span aria-disabled="true">Continue to checkout</span>
                  )}
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <Link href="/shop">Keep browsing</Link>
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </Section>
  );
}
