"use client";

import { useActionState } from "react";
import Link from "next/link";
import { addToCartAction, type CartActionState } from "@/app/(site)/cart/actions";
import { MAX_QUANTITY_PER_LINE } from "@/lib/commerce/purchasability";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const INITIAL: CartActionState = { error: null, ok: false };

/**
 * Add-to-cart, for a piece already established as purchasable on the server.
 *
 * The form carries a slug and a quantity and nothing else. Price, availability
 * and purchasability are re-derived server-side in addToCart — the client cannot
 * influence any of them.
 */
export function AddToCart({ slug, madeToOrder }: { slug: string; madeToOrder: boolean }) {
  const [state, formAction, pending] = useActionState(addToCartAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      <div className="flex items-end gap-4">
        <div className="w-24">
          <Label htmlFor={`qty-${slug}`}>Quantity</Label>
          <select
            id={`qty-${slug}`}
            name="quantity"
            defaultValue="1"
            className="text-body-sm mt-2 h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-foreground"
          >
            {Array.from({ length: MAX_QUANTITY_PER_LINE }, (_, index) => index + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="lg" disabled={pending} className="flex-1">
          {pending ? "Adding…" : "Add to cart"}
        </Button>
      </div>

      {madeToOrder ? (
        <p className="text-metadata text-muted-foreground">
          Made to order — the studio needs about five to six weeks, depending on drying
          conditions.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-body-sm border-l-2 border-destructive pl-3 text-destructive">
          {state.error}
        </p>
      ) : null}

      {state.ok ? (
        <p role="status" className="text-body-sm border-l-2 border-secondary pl-3">
          Added to your cart.{" "}
          <Link href="/cart" className="text-primary hover:underline">
            View cart
          </Link>
        </p>
      ) : null}
    </form>
  );
}
