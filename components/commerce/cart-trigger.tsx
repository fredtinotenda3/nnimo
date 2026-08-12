"use client";

import * as React from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { fetchCartAction } from "@/app/(site)/cart/actions";
import type { CartView } from "@/lib/commerce/cart";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";

/**
 * Quick-access cart.
 *
 * Contents are fetched when the panel opens rather than pushed into every page's
 * payload, so the header stays cheap. The count comes from the server layout as a
 * prop, which is what keeps the badge correct after an add without any client
 * cache to invalidate.
 */
export function CartTrigger({ count, solid }: { count: number; solid: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [cart, setCart] = React.useState<CartView | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    fetchCartAction()
      .then(setCart)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex h-11 w-11 items-center justify-center transition-colors",
            solid ? "text-foreground" : "text-warm-white",
          )}
        >
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          {count > 0 ? (
            <span className="text-metadata absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-primary-foreground">
              {count}
            </span>
          ) : null}
          <span className="sr-only">
            {count === 0 ? "Cart, empty" : `Cart, ${count} item${count === 1 ? "" : "s"}`}
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Your cart</DialogTitle>
          <DialogDescription>
            {count === 0 ? "Nothing in it yet." : "Every piece is made by hand."}
          </DialogDescription>
        </DialogHeader>

        {loading && !cart ? (
          <LoadingState label="Loading your cart" rows={3} />
        ) : !cart || cart.lines.length === 0 ? (
          <div className="py-6">
            <p className="text-body-sm text-muted-foreground">
              Your cart is empty. Browse the collection and add a piece.
            </p>
            <Button asChild className="mt-6" onClick={() => setOpen(false)}>
              <Link href="/shop">Browse the shop</Link>
            </Button>
          </div>
        ) : (
          <div className="max-h-[60svh] overflow-y-auto">
            <ul className="divide-y divide-border border-y border-border">
              {cart.lines.map((line) => (
                <li key={line.cartItemId} className="flex justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-heading-3 truncate">{line.name}</p>
                    <p className="text-metadata mt-1 text-muted-foreground">
                      Qty {line.quantity} · {line.unitPriceLabel}
                    </p>
                    {line.problem ? (
                      <p className="text-body-sm mt-1 text-destructive">{line.problem}</p>
                    ) : null}
                  </div>
                  <span className="text-price shrink-0">{line.lineTotalLabel}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-baseline justify-between">
              <span className="text-label text-muted-foreground">Subtotal</span>
              <span className="text-price">{cart.subtotalLabel}</span>
            </div>
            <p className="text-metadata mt-2 text-muted-foreground">
              Delivery is confirmed separately by the studio.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <Button asChild onClick={() => setOpen(false)}>
                <Link href="/cart">View cart</Link>
              </Button>
              {cart.checkoutReady ? (
                <Button asChild variant="outline" onClick={() => setOpen(false)}>
                  <Link href="/checkout">Checkout</Link>
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
