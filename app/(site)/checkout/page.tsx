import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCartView } from "@/lib/commerce/cart";
import { activeProviderOrNull, activeSettlementMode } from "@/lib/payments";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { CartLines } from "@/components/commerce/cart-lines";
import { CheckoutForm } from "@/components/commerce/checkout-form";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const cart = await getCartView();

  // Nothing to check out — bounce rather than render an empty form.
  if (cart.lines.length === 0) redirect("/cart");
  if (!cart.checkoutReady) redirect("/cart");

  const provider = activeProviderOrNull();
  const settlement = activeSettlementMode();

  return (
    <Section className="pt-32 lg:pt-40">
      <p className="text-label text-muted-foreground">Checkout</p>
      <h1 className="text-display mt-4">Almost there</h1>

      <div className="mt-14 grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7">
          <CheckoutForm />
        </div>

        <aside className="lg:col-span-5">
          <div className="border border-border bg-surface p-7 lg:sticky lg:top-28">
            <h2 className="text-heading-2">Your order</h2>

            <div className="mt-6">
              <CartLines lines={cart.lines} compact />
            </div>

            <dl className="mt-6 divide-y divide-border border-y border-border">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-body-sm text-muted-foreground">Subtotal</dt>
                <dd className="text-body-sm">{cart.subtotalLabel}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-body-sm text-muted-foreground">Delivery</dt>
                <dd className="text-body-sm text-right">Confirmed separately</dd>
              </div>
            </dl>

            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-label text-muted-foreground">
                {settlement === "manual" ? "Order total" : "Total now"}
              </span>
              <span className="text-price">{cart.subtotalLabel}</span>
            </div>

            <p className="text-metadata mt-3 text-muted-foreground">
              This total excludes delivery. Nnino has no fixed delivery rates yet, so if
              you choose delivery the cost is agreed with you before dispatch — you will
              not be charged for it here.
            </p>

            {/*
              Three distinct states, because collapsing them would mean telling
              the customer something untrue in at least one of them:

                - automatic settlement: an online payment step follows;
                - manual settlement: the order is placed now and payment is
                  arranged with the studio afterwards. Nothing is charged here;
                - no provider at all: same practical position as manual, and it
                  is described the same way rather than as an outage, because
                  from the customer's side nothing is broken.
            */}
            {provider && settlement === "automatic" ? (
              <p className="text-metadata mt-5 border-t border-border pt-5 text-muted-foreground">
                Payment via {provider.displayName}.
              </p>
            ) : (
              <p className="text-body-sm mt-5 border-l-2 border-ochre pl-3 text-muted-foreground">
                You will not be charged on this page. Once you place the order the studio
                confirms availability, delivery and payment with you directly.
              </p>
            )}

            <Button asChild variant="ghost" size="sm" className="mt-5 -ml-3">
              <Link href="/cart">Back to cart</Link>
            </Button>
          </div>
        </aside>
      </div>
    </Section>
  );
}
