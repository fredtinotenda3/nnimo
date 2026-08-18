import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIdentity } from "@/lib/security/client-identity";
import type {
  OrderFulfilmentStatus,
  OrderPaymentStatus,
} from "@/lib/generated/prisma/enums";
import { formatCents, toCents } from "@/lib/commerce/money";
import {
  customerFacingStatus,
  FULFILMENT_LABEL,
  paymentStatusLabel,
} from "@/lib/commerce/fulfilment";
import { settlementModeForProvider } from "@/lib/payments";
import { BRAND, whatsappLink } from "@/lib/brand";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Order confirmation",
  // An order page must never be indexed or previewed.
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessToken: string }> };

type MoneyValue = { toString(): string };

type OrderItemRow = {
  id: string;
  productNameSnapshot: string;
  skuSnapshot: string | null;
  quantity: number;
  unitPrice: MoneyValue;
  lineTotal: MoneyValue;
  requiresProduction: boolean;
};

type OrderView = {
  orderNumber: string;
  createdAt: Date;
  currency: string;
  subtotal: MoneyValue;
  shippingTotal: MoneyValue;
  total: MoneyValue;
  paymentStatus: OrderPaymentStatus;
  fulfilmentStatus: OrderFulfilmentStatus;
  fulfilmentMethod: "DELIVERY" | "COLLECTION" | null;
  deliveryQuoteStatus: "NOT_REQUIRED" | "PENDING_QUOTE" | "QUOTED";
  deliveryAddress: unknown;
  customerNotes: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  items: OrderItemRow[];
  /** Latest first — only the provider is read, to decide how this order settles. */
  payments: { provider: string }[];
};

type DeliveryAddress = {
  line1?: string;
  line2?: string | null;
  city?: string;
  country?: string;
  notes?: string | null;
};

/**
 * Guest order confirmation.
 *
 * Keyed on the unguessable accessToken, never the order number: order numbers
 * are sequential, so /orders/NN-2026-00042 would let anyone walk the whole
 * customer list. Nothing about the payment instrument is shown — only whether
 * payment has settled.
 */
export default async function OrderConfirmationPage({ params }: Params) {
  const { accessToken } = await params;

  if (!accessToken || accessToken.length > 100) notFound();

  /**
   * PHASE 5 ADDITION.
   *
   * The token is a UUIDv4, so brute force is already infeasible on entropy
   * grounds — this is not what stops an attacker guessing it. What it does is
   * cap the COST to us of someone trying: without it, an enumeration attempt is
   * an unbounded stream of indexed database lookups on a force-dynamic route.
   *
   * A limited request is rendered as notFound() rather than an explicit
   * rate-limit page, so the response is identical to a wrong token and reveals
   * nothing about whether a guess was close.
   */
  const limit = await checkRateLimit("orderAccess", await clientIdentity());
  if (!limit.allowed) notFound();

  const order: OrderView | null = await db.order.findUnique({
    where: { accessToken },
    select: {
      orderNumber: true,
      createdAt: true,
      currency: true,
      subtotal: true,
      shippingTotal: true,
      total: true,
      paymentStatus: true,
      fulfilmentStatus: true,
      fulfilmentMethod: true,
      deliveryQuoteStatus: true,
      deliveryAddress: true,
      customerNotes: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      items: {
        select: {
          id: true,
          productNameSnapshot: true,
          skuSnapshot: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          requiresProduction: true,
        },
      },
      /**
       * How this order settles is a property of the order, not of the process
       * rendering it: it is decided by the provider the order was placed
       * against. Only the provider id is selected — nothing about the payment
       * instrument, reference or payload belongs on a page reachable with a
       * link.
       */
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { provider: true },
      },
    },
  });

  if (!order) notFound();

  const address = (order.deliveryAddress ?? null) as DeliveryAddress | null;
  const subtotalCents = toCents(order.subtotal) ?? 0;
  const shippingCents = toCents(order.shippingTotal) ?? 0;
  const totalCents = toCents(order.total) ?? 0;
  const deliveryPending = order.deliveryQuoteStatus === "PENDING_QUOTE";
  const madeToOrder = order.items.some((item) => item.requiresProduction);
  const settlement = settlementModeForProvider(order.payments[0]?.provider);
  const awaitingStudioPayment =
    settlement === "manual" && order.paymentStatus !== "PAID";

  return (
    <Section className="pt-32 lg:pt-40">
      <div className="mx-auto max-w-3xl">
        <p className="text-label text-muted-foreground">Order received</p>
        <h1 className="text-display mt-4">Thank you</h1>
        <p className="text-body-lg mt-6 text-muted-foreground">
          {customerFacingStatus(
            {
              paymentStatus: order.paymentStatus,
              fulfilmentStatus: order.fulfilmentStatus,
            },
            settlement,
          )}
        </p>

        <dl className="mt-10 grid gap-6 border-y border-border py-6 sm:grid-cols-3">
          <div>
            <dt className="text-metadata text-muted-foreground">Order number</dt>
            <dd className="text-heading-3 mt-1 tabular-nums">{order.orderNumber}</dd>
          </div>
          <div>
            <dt className="text-metadata text-muted-foreground">Payment</dt>
            <dd className="mt-1">
              <Badge variant={order.paymentStatus === "PAID" ? "success" : "neutral"}>
                {paymentStatusLabel(order.paymentStatus, settlement)}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-metadata text-muted-foreground">Stage</dt>
            <dd className="mt-1">
              <Badge variant="outline">{FULFILMENT_LABEL[order.fulfilmentStatus]}</Badge>
            </dd>
          </div>
        </dl>

        <h2 className="text-heading-2 mt-12">Your pieces</h2>
        <ul className="mt-6 divide-y divide-border border-y border-border">
          {order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-6 py-4">
                <div>
                  <p className="text-body-sm font-medium">{item.productNameSnapshot}</p>
                  <p className="text-metadata mt-1 text-muted-foreground">
                    {item.quantity} × {formatCents(toCents(item.unitPrice) ?? 0, order.currency)}
                    {item.requiresProduction ? " · Made to order" : ""}
                  </p>
                </div>
                <p className="text-body-sm tabular-nums">
                  {formatCents(toCents(item.lineTotal) ?? 0, order.currency)}
                </p>
              </li>
            ))}
        </ul>

        <dl className="mt-6 flex flex-col gap-2">
          <div className="flex justify-between">
            <dt className="text-body-sm text-muted-foreground">Subtotal</dt>
            <dd className="text-body-sm tabular-nums">
              {formatCents(subtotalCents, order.currency)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-body-sm text-muted-foreground">
              {order.fulfilmentMethod === "COLLECTION" ? "Collection" : "Delivery"}
            </dt>
            <dd className="text-body-sm tabular-nums">
              {order.fulfilmentMethod === "COLLECTION"
                ? "Free"
                : deliveryPending
                  ? "To be confirmed"
                  : formatCents(shippingCents, order.currency)}
            </dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-3">
            <dt className="text-heading-3">Total</dt>
            <dd className="text-price tabular-nums">
              {formatCents(totalCents, order.currency)}
            </dd>
          </div>
        </dl>

        {deliveryPending ? (
          <p className="text-body-sm mt-4 border-l-2 border-ochre pl-4 text-muted-foreground">
            This total does not include delivery. Nnino does not have a published
            delivery rate card yet, so the studio will confirm the delivery cost with
            you directly before anything is dispatched.
          </p>
        ) : null}

        <div className="mt-12 grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="text-heading-2">Your details</h2>
            <address className="text-body-sm mt-4 not-italic text-muted-foreground">
              <span className="block text-foreground">{order.guestName}</span>
              <span className="block">{order.guestEmail}</span>
              {order.guestPhone ? <span className="block">{order.guestPhone}</span> : null}
            </address>
          </div>
          <div>
            <h2 className="text-heading-2">
              {order.fulfilmentMethod === "COLLECTION" ? "Collection" : "Delivery"}
            </h2>
            {order.fulfilmentMethod === "COLLECTION" ? (
              <address className="text-body-sm mt-4 not-italic text-muted-foreground">
                {BRAND.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            ) : (
              <address className="text-body-sm mt-4 not-italic text-muted-foreground">
                {address?.line1 ? <span className="block">{address.line1}</span> : null}
                {address?.line2 ? <span className="block">{address.line2}</span> : null}
                {address?.city ? <span className="block">{address.city}</span> : null}
                {address?.country ? <span className="block">{address.country}</span> : null}
              </address>
            )}
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <h2 className="text-heading-2">What happens next</h2>
          <ol className="text-body-sm mt-4 flex flex-col gap-2 text-muted-foreground">
            {awaitingStudioPayment ? (
              <li>
                Nothing has been charged. The studio will be in touch to confirm
                availability and arrange payment with you.
              </li>
            ) : null}
            <li>The studio confirms your order and, if you chose delivery, the delivery cost.</li>
            {madeToOrder ? (
              <li>
                Made-to-order pieces are produced by hand — around five to six weeks,
                depending on drying conditions.
              </li>
            ) : null}
            <li>You will hear from the studio when your order is ready.</li>
          </ol>

          <p className="text-body-sm mt-6 text-muted-foreground">
            Questions? WhatsApp{" "}
            <a
              href={whatsappLink(`Hello Nnino Ceramics, about order ${order.orderNumber}.`)}
              className="text-primary hover:underline"
              rel="noopener noreferrer"
              target="_blank"
            >
              {BRAND.whatsapp}
            </a>{" "}
            or email{" "}
            <a href={`mailto:${BRAND.emails.general}`} className="text-primary hover:underline">
              {BRAND.emails.general}
            </a>
            . Keep this page — it is the link to your order.
          </p>

          <Button asChild variant="outline" className="mt-8">
            <Link href="/shop">Back to the shop</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
