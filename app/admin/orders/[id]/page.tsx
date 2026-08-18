import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { formatCents, toCents } from "@/lib/commerce/money";
import {
  FULFILMENT_LABEL,
  FULFILMENT_TRANSITIONS,
  PAYMENT_LABEL,
  isPaid,
} from "@/lib/commerce/fulfilment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableNumericCell,
  TableRow,
} from "@/components/ui/table";
import type { AuditEntryView, OrderDetailView } from "@/lib/commerce/order-views";
import { OrderStatusForm } from "@/components/admin/order-status-form";
import { OrderNoteForm } from "@/components/admin/order-note-form";
import { ManualSettlementForm } from "@/components/admin/manual-settlement-form";
import { settlementModeForProvider } from "@/lib/payments";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

type DeliveryAddress = {
  line1?: string;
  line2?: string | null;
  city?: string;
  country?: string;
  notes?: string | null;
};

type TimelineEntry = { at: Date; label: string; detail?: string | null };

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("order:read");
  const { id } = await params;

  const order: OrderDetailView | null = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      paidAt: true,
      confirmedAt: true,
      readyAt: true,
      shippedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      currency: true,
      subtotal: true,
      shippingTotal: true,
      total: true,
      paymentStatus: true,
      fulfilmentStatus: true,
      fulfilmentMethod: true,
      deliveryQuoteStatus: true,
      deliveryAddress: true,
      trackingRef: true,
      customerNotes: true,
      internalNotes: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
      items: {
        select: {
          id: true,
          productNameSnapshot: true,
          skuSnapshot: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          requiresProduction: true,
          productId: true,
        },
      },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          provider: true,
          providerRef: true,
          status: true,
          amount: true,
          currency: true,
          createdAt: true,
          verifiedAt: true,
        },
      },
    },
  });

  if (!order) notFound();

  // The order timeline is assembled from the order's own timestamps, its payment
  // rows and the audit log — no separate timeline table to drift out of sync.
  const auditEntries: AuditEntryView[] = await db.auditLog.findMany({
    where: { entityType: "Order", entityId: order.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, action: true, createdAt: true, metadata: true },
  });

  const canWrite = can(user.role, "order:write");
  const canSettle = can(user.role, "order:settle");

  /**
   * Judged by the provider this order was placed against, not by the current
   * environment — the same rule the customer's confirmation page uses, so the
   * studio and the customer are looking at the same account of the order.
   */
  const settlement = settlementModeForProvider(order.payments.at(-1)?.provider);
  const awaitingSettlement =
    settlement === "manual" && !isPaid(order.paymentStatus) && order.fulfilmentStatus !== "CANCELLED";
  const address = (order.deliveryAddress ?? null) as DeliveryAddress | null;
  const allowed = FULFILMENT_TRANSITIONS[order.fulfilmentStatus];

  const timeline: TimelineEntry[] = [
    { at: order.createdAt, label: "Order placed" },
    ...(order.paidAt ? [{ at: order.paidAt, label: "Payment settled" }] : []),
    ...(order.confirmedAt ? [{ at: order.confirmedAt, label: "Confirmed by the studio" }] : []),
    ...(order.readyAt ? [{ at: order.readyAt, label: "Ready" }] : []),
    ...(order.shippedAt ? [{ at: order.shippedAt, label: "Dispatched", detail: order.trackingRef }] : []),
    ...(order.deliveredAt ? [{ at: order.deliveredAt, label: "Delivered or collected" }] : []),
    ...(order.cancelledAt ? [{ at: order.cancelledAt, label: "Cancelled" }] : []),
    ...order.payments.map((payment) => ({
      at: payment.createdAt,
      label: `Payment ${payment.status.toLowerCase()} via ${payment.provider}`,
    })),
    ...auditEntries.map((entry) => ({
      at: entry.createdAt,
      label: entry.action,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="flex flex-col gap-12">
      <header>
        <Link href="/admin/orders" className="text-metadata text-muted-foreground hover:text-foreground">
          ← All orders
        </Link>
        <h1 className="text-heading-1 mt-4 tabular-nums">{order.orderNumber}</h1>
        <div className="mt-4 flex flex-wrap gap-3">
          <Badge variant={order.paymentStatus === "PAID" ? "success" : "neutral"}>
            Payment: {PAYMENT_LABEL[order.paymentStatus]}
          </Badge>
          {awaitingSettlement ? (
            <Badge variant="outline">Settled by the studio</Badge>
          ) : null}
          <Badge variant="outline">Stage: {FULFILMENT_LABEL[order.fulfilmentStatus]}</Badge>
          <Badge variant="neutral">
            {order.fulfilmentMethod === "COLLECTION" ? "Collection" : "Delivery"}
          </Badge>
        </div>
      </header>

      <section>
        <h2 className="text-heading-2">Pieces</h2>
        <Table className="mt-6">
          <TableCaption className="sr-only">Ordered pieces at purchase price</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Piece</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit</TableHead>
              <TableHead className="text-right">Line</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className="font-medium">{item.productNameSnapshot}</span>
                    <span className="text-metadata mt-1 block text-muted-foreground">
                      {item.skuSnapshot ?? "No SKU"}
                      {item.requiresProduction ? " · Made to order" : ""}
                      {item.productId === null ? " · product since removed" : ""}
                    </span>
                  </TableCell>
                  <TableNumericCell>{item.quantity}</TableNumericCell>
                  <TableNumericCell>
                    {formatCents(toCents(item.unitPrice) ?? 0, order.currency)}
                  </TableNumericCell>
                  <TableNumericCell>
                    {formatCents(toCents(item.lineTotal) ?? 0, order.currency)}
                  </TableNumericCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        <dl className="mt-6 ml-auto flex max-w-xs flex-col gap-2">
          <div className="flex justify-between">
            <dt className="text-body-sm text-muted-foreground">Subtotal</dt>
            <dd className="text-body-sm tabular-nums">
              {formatCents(toCents(order.subtotal) ?? 0, order.currency)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-body-sm text-muted-foreground">Delivery</dt>
            <dd className="text-body-sm tabular-nums">
              {order.deliveryQuoteStatus === "PENDING_QUOTE"
                ? "Not yet quoted"
                : formatCents(toCents(order.shippingTotal) ?? 0, order.currency)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <dt className="text-heading-3">Total</dt>
            <dd className="text-price tabular-nums">
              {formatCents(toCents(order.total) ?? 0, order.currency)}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-12 lg:grid-cols-2">
        <section>
          <h2 className="text-heading-2">Customer</h2>
          <dl className="mt-6 divide-y divide-border border-y border-border">
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-metadata text-muted-foreground">Name</dt>
              <dd className="text-body-sm">{order.customer?.name ?? order.guestName ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-metadata text-muted-foreground">Email</dt>
              <dd className="text-body-sm break-all">
                {order.customer?.email ?? order.guestEmail ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-metadata text-muted-foreground">Phone</dt>
              <dd className="text-body-sm">{order.customer?.phone ?? order.guestPhone ?? "—"}</dd>
            </div>
          </dl>
          {order.customerNotes ? (
            <>
              <h3 className="text-label mt-8 text-muted-foreground">Customer notes</h3>
              <p className="text-body-sm mt-2 text-muted-foreground">{order.customerNotes}</p>
            </>
          ) : null}
        </section>

        <section>
          <h2 className="text-heading-2">
            {order.fulfilmentMethod === "COLLECTION" ? "Collection" : "Delivery"}
          </h2>
          {order.fulfilmentMethod === "COLLECTION" ? (
            <p className="text-body-sm mt-6 text-muted-foreground">
              Collection from the studio. No delivery fee.
            </p>
          ) : (
            <>
              <address className="text-body-sm mt-6 not-italic text-muted-foreground">
                {address?.line1 ? <span className="block">{address.line1}</span> : null}
                {address?.line2 ? <span className="block">{address.line2}</span> : null}
                {address?.city ? <span className="block">{address.city}</span> : null}
                {address?.country ? <span className="block">{address.country}</span> : null}
              </address>
              {address?.notes ? (
                <p className="text-body-sm mt-4 text-muted-foreground">{address.notes}</p>
              ) : null}
              {order.deliveryQuoteStatus === "PENDING_QUOTE" ? (
                <p className="text-body-sm mt-4 border-l-2 border-ochre pl-3 text-muted-foreground">
                  Delivery fee not yet quoted. The customer was told the total excludes
                  delivery and that the studio would confirm it.
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        <section>
          <h2 className="text-heading-2">Status</h2>
          <div className="mt-6">
            {canWrite ? (
              <OrderStatusForm
                orderId={order.id}
                allowed={allowed}
                labels={FULFILMENT_LABEL}
                needsTracking={allowed.includes("SHIPPED")}
                warnUnpaid={!isPaid(order.paymentStatus)}
              />
            ) : (
              <p className="text-body-sm text-muted-foreground">
                Your role can view orders but not change them.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-heading-2">Payment</h2>
          <div className="mt-6">
            {order.paymentStatus === "PAID" ? (
              <p className="text-body-sm text-muted-foreground">
                Recorded as paid
                {order.paidAt
                  ? ` on ${order.paidAt.toISOString().slice(0, 10)}`
                  : ""}
                . See the payments table below for how it settled.
              </p>
            ) : !awaitingSettlement ? (
              <p className="text-body-sm text-muted-foreground">
                This order settles through the payment provider. Its status updates when
                the provider is verified — it is not marked paid by hand.
              </p>
            ) : canSettle ? (
              <>
                <p className="text-body-sm text-muted-foreground">
                  No payment gateway is live, so this order was placed unpaid. Record the
                  payment here once the money has actually arrived.
                </p>
                <div className="mt-5">
                  <ManualSettlementForm
                    orderId={order.id}
                    totalLabel={formatCents(toCents(order.total) ?? 0, order.currency)}
                  />
                </div>
              </>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                This order is awaiting payment confirmation. Your role can view orders but
                not record payments — ask an owner or manager.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-heading-2">Internal notes</h2>
          <div className="mt-6">
            {canWrite ? (
              <OrderNoteForm orderId={order.id} initialValue={order.internalNotes} />
            ) : (
              <p className="text-body-sm text-muted-foreground">
                {order.internalNotes ?? "No notes."}
              </p>
            )}
          </div>
        </section>
      </div>

      <section>
        <h2 className="text-heading-2">Payments</h2>
        {order.payments.length === 0 ? (
          <p className="text-body-sm mt-4 text-muted-foreground">
            No payment attempts recorded.
          </p>
        ) : (
          <Table className="mt-6">
            <TableCaption className="sr-only">Payment attempts</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <span className="font-medium">{payment.provider}</span>
                      {/* Deliberately shows only our own reference — never card
                          data, tokens or raw provider payloads. */}
                      <span className="text-metadata mt-1 block break-all text-muted-foreground">
                        {payment.providerRef ?? "no reference"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={payment.status === "PAID" ? "success" : "neutral"}>
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.verifiedAt ? payment.verifiedAt.toISOString().slice(0, 16).replace("T", " ") : "—"}
                    </TableCell>
                    <TableNumericCell>
                      {formatCents(toCents(payment.amount) ?? 0, payment.currency)}
                    </TableNumericCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="text-heading-2">Timeline</h2>
        <ol className="mt-6 divide-y divide-border border-y border-border">
          {timeline.map((entry, index) => (
            <li key={`${entry.label}-${index}`} className="flex justify-between gap-6 py-3">
              <span className="text-body-sm">{entry.label}</span>
              <span className="text-metadata shrink-0 text-muted-foreground">
                {entry.at.toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/orders">← All orders</Link>
        </Button>
      </div>
    </div>
  );
}
