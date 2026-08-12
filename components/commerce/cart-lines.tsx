import Image from "next/image";
import Link from "next/link";
import { removeItemAction, updateQuantityAction } from "@/app/(site)/cart/actions";
import { MAX_QUANTITY_PER_LINE } from "@/lib/commerce/purchasability";
import type { CartLine } from "@/lib/commerce/cart";
import { Button } from "@/components/ui/button";

/**
 * Cart lines as plain forms — quantity and removal are one POST each, so they
 * work without JavaScript and need no client state.
 */
export function CartLines({ lines, compact = false }: { lines: CartLine[]; compact?: boolean }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {lines.map((line) => (
        <li key={line.cartItemId} className="flex gap-4 py-5">
          <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-surface-sunken">
            {line.imageUrl ? (
              <Image
                src={line.imageUrl}
                alt={line.imageAlt ?? line.name}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <span className="sr-only">No photograph yet</span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Link
                href={`/products/${line.slug}`}
                className="text-heading-3 hover:text-primary"
              >
                {line.name}
              </Link>
              <span className="text-price shrink-0">{line.lineTotalLabel}</span>
            </div>

            {line.collectionName ? (
              <p className="text-metadata mt-1 text-muted-foreground">{line.collectionName}</p>
            ) : null}

            <p className="text-metadata mt-1 text-muted-foreground">
              {line.unitPriceLabel} each
              {line.requiresProduction ? " · Made to order" : ""}
            </p>

            {line.problem ? (
              <p className="text-body-sm mt-2 border-l-2 border-destructive pl-3 text-destructive">
                {line.problem}
              </p>
            ) : null}

            {!compact ? (
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <form action={updateQuantityAction} className="flex items-center gap-2">
                  <input type="hidden" name="cartItemId" value={line.cartItemId} />
                  <label htmlFor={`q-${line.cartItemId}`} className="text-metadata text-muted-foreground">
                    Qty
                  </label>
                  <select
                    id={`q-${line.cartItemId}`}
                    name="quantity"
                    defaultValue={String(line.quantity)}
                    className="text-body-sm h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2"
                  >
                    {Array.from({ length: MAX_QUANTITY_PER_LINE }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" variant="ghost">
                    Update
                  </Button>
                </form>

                <form action={removeItemAction}>
                  <input type="hidden" name="cartItemId" value={line.cartItemId} />
                  <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">
                    Remove
                  </Button>
                </form>
              </div>
            ) : (
              <p className="text-metadata mt-2 text-muted-foreground">Qty {line.quantity}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
