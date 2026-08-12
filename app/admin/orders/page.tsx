import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { formatCents, toCents } from "@/lib/commerce/money";
import { FULFILMENT_LABEL, PAYMENT_LABEL } from "@/lib/commerce/fulfilment";
import type { OrderSummaryView } from "@/lib/commerce/order-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const PAYMENT_VALUES = Object.keys(PAYMENT_LABEL);
const FULFILMENT_VALUES = Object.keys(FULFILMENT_LABEL);

const fieldClass =
  "text-body-sm h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-foreground";

type OrderRow = OrderSummaryView;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("order:read");

  const raw = await searchParams;
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? "";

  // Validated against known sets before reaching Prisma.
  const q = first(raw.q).trim().slice(0, 120);
  const paymentParam = first(raw.payment);
  const payment = PAYMENT_VALUES.includes(paymentParam) ? paymentParam : "";
  const fulfilmentParam = first(raw.fulfilment);
  const fulfilment = FULFILMENT_VALUES.includes(fulfilmentParam) ? fulfilmentParam : "";

  const where = {
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { guestName: { contains: q, mode: "insensitive" as const } },
            { guestEmail: { contains: q, mode: "insensitive" as const } },
            { customer: { email: { contains: q, mode: "insensitive" as const } } },
            { customer: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(payment ? { paymentStatus: payment as never } : {}),
    ...(fulfilment ? { fulfilmentStatus: fulfilment as never } : {}),
  };

  const orders: OrderRow[] = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      currency: true,
      total: true,
      paymentStatus: true,
      fulfilmentStatus: true,
      guestName: true,
      guestEmail: true,
      customer: { select: { name: true, email: true } },
      _count: { select: { items: true } },
    },
  });

  const filtered = Boolean(q || payment || fulfilment);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-label text-muted-foreground">Operations</p>
        <h1 className="text-heading-1 mt-3">Orders</h1>
      </header>

      <form method="get" className="grid gap-4 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <div className="lg:col-span-2">
          <label htmlFor="q" className="text-label text-muted-foreground">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Order number, name or email"
            className={`${fieldClass} mt-2 placeholder:text-muted-foreground`}
          />
        </div>
        <div>
          <label htmlFor="payment" className="text-label text-muted-foreground">
            Payment
          </label>
          <select id="payment" name="payment" defaultValue={payment} className={`${fieldClass} mt-2`}>
            <option value="">Any</option>
            {PAYMENT_VALUES.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_LABEL[value as keyof typeof PAYMENT_LABEL]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fulfilment" className="text-label text-muted-foreground">
            Stage
          </label>
          <select id="fulfilment" name="fulfilment" defaultValue={fulfilment} className={`${fieldClass} mt-2`}>
            <option value="">Any</option>
            {FULFILMENT_VALUES.map((value) => (
              <option key={value} value={value}>
                {FULFILMENT_LABEL[value as keyof typeof FULFILMENT_LABEL]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit" size="sm">
            Apply
          </Button>
          {filtered ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/orders">Clear</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {orders.length === 0 ? (
        <EmptyState
          title={filtered ? "No orders match those filters" : "No orders yet"}
          description={
            filtered
              ? "Try a different status or clear the filters."
              : "Orders placed through the storefront will appear here."
          }
        />
      ) : (
        <Table>
          <TableCaption className="sr-only">Orders, newest first</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="font-medium tabular-nums hover:text-primary"
                  >
                    {order.orderNumber}
                  </Link>
                  <span className="text-metadata mt-1 block text-muted-foreground">
                    {order._count.items === 1 ? "1 piece" : `${order._count.items} pieces`}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="block">{order.customer?.name ?? order.guestName ?? "—"}</span>
                  <span className="text-metadata mt-1 block break-all text-muted-foreground">
                    {order.customer?.email ?? order.guestEmail ?? ""}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {order.createdAt.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell>
                  <Badge variant={order.paymentStatus === "PAID" ? "success" : "neutral"}>
                    {PAYMENT_LABEL[order.paymentStatus]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{FULFILMENT_LABEL[order.fulfilmentStatus]}</Badge>
                </TableCell>
                <TableNumericCell>
                  {formatCents(toCents(order.total) ?? 0, order.currency)}
                </TableNumericCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {orders.length === 100 ? (
        <p className="text-body-sm text-muted-foreground">
          Showing the 100 most recent orders. Narrow with search or a status filter.
        </p>
      ) : null}
    </div>
  );
}
