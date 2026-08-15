import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { formatCents, toCents } from "@/lib/commerce/money";
import { FULFILMENT_LABEL, PAYMENT_LABEL } from "@/lib/commerce/fulfilment";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { CustomerForm } from "@/components/admin/customer-form";
import { Badge } from "@/components/ui/badge";
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

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  total: { toString(): string };
  currency: string;
  paymentStatus: keyof typeof PAYMENT_LABEL;
  fulfilmentStatus: keyof typeof FULFILMENT_LABEL;
  _count: { items: number };
};

/**
 * One customer.
 *
 * Order history links straight through to the order rather than duplicating its
 * detail — an order's state lives in one place, and a second rendering of it is
 * a second thing to keep correct.
 *
 * No payment instrument, token or provider payload appears here. Those live on
 * Payment rows, shown only on the order page and only as a provider name and our
 * own reference.
 */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("customer:read");
  const { id } = await params;

  const customer = await db.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      marketingConsent: true,
      notes: true,
      createdAt: true,
      orders: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          total: true,
          currency: true,
          paymentStatus: true,
          fulfilmentStatus: true,
          _count: { select: { items: true } },
        },
      },
    },
  });

  if (!customer) notFound();

  const orders = customer.orders as OrderRow[];
  const settled = orders.filter(
    (order) => order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED",
  );
  const spendCents = settled.reduce((sum, order) => sum + (toCents(order.total) ?? 0), 0);
  const currency = settled[0]?.currency ?? "USD";
  const canWrite = can(user.role, "customer:write");

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        backHref="/admin/customers"
        backLabel="All customers"
        title={customer.name}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <span className="break-all">{customer.email}</span>
            <Badge variant={customer.marketingConsent ? "success" : "neutral"}>
              {customer.marketingConsent ? "Marketing consented" : "No marketing consent"}
            </Badge>
          </span>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Orders", value: String(orders.length) },
          { label: "Settled orders", value: String(settled.length) },
          { label: "Total spend", value: formatCents(spendCents, currency) },
          { label: "Customer since", value: customer.createdAt.toISOString().slice(0, 10) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--radius-md)] border border-border bg-surface p-5"
          >
            <dt className="text-label text-muted-foreground">{stat.label}</dt>
            <dd className="text-heading-2 mt-2 tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <AdminSection
        title="Contact and consent"
        description="The email address is fixed: it identifies this customer's orders and the links in their confirmation emails."
      >
        {canWrite ? (
          <CustomerForm
            values={{
              id: customer.id,
              name: customer.name,
              email: customer.email,
              phone: customer.phone ?? "",
              marketingConsent: customer.marketingConsent,
              notes: customer.notes ?? "",
            }}
          />
        ) : (
          <dl className="divide-y divide-border border-y border-border">
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-metadata text-muted-foreground">Phone</dt>
              <dd className="text-body-sm">{customer.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-metadata text-muted-foreground">Notes</dt>
              <dd className="text-body-sm">{customer.notes ?? "—"}</dd>
            </div>
          </dl>
        )}
      </AdminSection>

      <AdminSection title="Orders">
        {orders.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <Table>
            <TableCaption className="sr-only">Orders placed by this customer</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
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
                      className="text-body-sm font-medium tabular-nums hover:text-primary"
                    >
                      {order.orderNumber}
                    </Link>
                    <span className="text-metadata mt-1 block text-muted-foreground">
                      {order._count.items === 1 ? "1 piece" : `${order._count.items} pieces`}
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
      </AdminSection>
    </div>
  );
}
