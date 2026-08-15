import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { formatCents, toCents } from "@/lib/commerce/money";
import { FULFILMENT_LABEL, PAYMENT_LABEL } from "@/lib/commerce/fulfilment";
import {
  getCatalogueKpis,
  getCommerceKpis,
  getOperationsFeed,
  hasMixedCurrencies,
} from "@/lib/admin/dashboard";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { StatGrid, StatTile } from "@/components/admin/list-controls";
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

export const dynamic = "force-dynamic";

/**
 * The dashboard.
 *
 * Every figure is a real aggregate. There is no sample data, no trend line drawn
 * from one data point and no "up 12% on last month" invented from an empty
 * table — with no orders yet the honest answer is zero, and zero is what shows.
 *
 * Panels are gated on the reader's permissions, not just hidden by CSS: an
 * ORDER_MANAGER sees the commerce and operations panels and never runs the
 * catalogue queries. A dashboard that fetches everything and renders some of it
 * is a slower page and a wider disclosure surface for no benefit.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("dashboard:read");
  const query = await searchParams;
  const denied = typeof query.denied === "string" ? query.denied : null;

  const showCommerce = can(user.role, "order:read");
  const showCatalogue = can(user.role, "product:read");
  const showInquiries = can(user.role, "custom_order:read");

  const [commerce, catalogue, feed, mixedCurrencies] = await Promise.all([
    showCommerce ? getCommerceKpis() : Promise.resolve(null),
    showCatalogue ? getCatalogueKpis() : Promise.resolve(null),
    showCommerce || showInquiries ? getOperationsFeed() : Promise.resolve(null),
    showCommerce ? hasMixedCurrencies() : Promise.resolve(false),
  ]);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="Overview"
        title={`Good day, ${user.name.split(" ")[0] ?? user.name}`}
        description="Every number below is counted directly from the database."
      />

      {denied ? (
        <p role="alert" className="text-body-sm border-l-2 border-destructive pl-3 text-destructive">
          Your role does not have permission for that section ({denied}).
        </p>
      ) : null}

      {commerce ? (
        <AdminSection
          title="Commerce"
          description={
            commerce.ordersTotal === 0
              ? "No orders yet. These fill in as soon as the first one is placed."
              : `Revenue counts settled payments only, in ${commerce.currency}.`
          }
        >
          <StatGrid>
            <StatTile label="Orders" value={commerce.ordersTotal} href="/admin/orders" />
            <StatTile
              label="Paid orders"
              value={commerce.ordersPaid}
              tone={commerce.ordersPaid > 0 ? "positive" : "default"}
              href="/admin/orders?payment=PAID"
            />
            <StatTile
              label="Revenue"
              value={commerce.revenueFormatted}
              note="Settled payments only"
            />
            <StatTile
              label="Average order"
              value={commerce.averageOrderValueFormatted}
              note={commerce.ordersPaid === 0 ? "No settled orders yet" : undefined}
            />
          </StatGrid>

          {mixedCurrencies ? (
            <p className="text-body-sm border-l-2 border-ochre pl-3 text-muted-foreground">
              Settled orders exist in more than one currency. The revenue and average
              figures above add them together, which makes them unreliable — per-currency
              totals are needed before these numbers can be trusted.
            </p>
          ) : null}
        </AdminSection>
      ) : null}

      {commerce ? (
        <AdminSection title="Needs attention" description="Work waiting on someone.">
          <StatGrid>
            <StatTile
              label="Awaiting payment"
              value={commerce.ordersAwaitingPayment}
              tone={commerce.ordersAwaitingPayment > 0 ? "attention" : "default"}
              href="/admin/orders?payment=UNPAID"
            />
            <StatTile
              label="Awaiting confirmation"
              value={commerce.ordersAwaitingConfirmation}
              tone={commerce.ordersAwaitingConfirmation > 0 ? "attention" : "default"}
              href="/admin/orders?fulfilment=PENDING"
            />
            <StatTile
              label="Needs production"
              value={commerce.ordersRequiringProduction}
              note="Made-to-order pieces not yet finished"
              href="/admin/orders?fulfilment=IN_PRODUCTION"
            />
            <StatTile
              label="Ready for dispatch"
              value={commerce.ordersReady}
              tone={commerce.ordersReady > 0 ? "attention" : "default"}
              href="/admin/orders?fulfilment=READY"
            />
          </StatGrid>
        </AdminSection>
      ) : null}

      {catalogue ? (
        <AdminSection
          title="Catalogue"
          description="A piece being in the catalogue does not make it purchasable. These counts show the gap."
        >
          <StatGrid>
            <StatTile
              label="Published pieces"
              value={catalogue.productsPublished}
              href="/admin/products?stage=PUBLISHED"
            />
            <StatTile
              label="In catalogue only"
              value={catalogue.productsCatalogue}
              note="Known to exist, not on the site"
              href="/admin/products?stage=CATALOGUE"
            />
            <StatTile
              label="Published, not purchasable"
              value={catalogue.productsPublishedWithoutPrice}
              tone={catalogue.productsPublishedWithoutPrice > 0 ? "attention" : "default"}
              note="Live but no confirmed price"
              href="/admin/products?needs=unsellable"
            />
            <StatTile
              label="Without a photograph"
              value={catalogue.productsWithoutImages}
              href="/admin/products?needs=needs_image"
            />
          </StatGrid>

          <StatGrid columns={3}>
            <StatTile
              label="Published ranges"
              value={catalogue.collectionsPublished}
              href="/admin/collections?status=PUBLISHED"
            />
            <StatTile
              label="Draft ranges"
              value={catalogue.collectionsDraft}
              href="/admin/collections?status=DRAFT"
            />
            <StatTile
              label="Published but empty"
              value={catalogue.collectionsPublishedEmpty}
              tone={catalogue.collectionsPublishedEmpty > 0 ? "attention" : "default"}
              note="Ranges with no published pieces"
              href="/admin/collections?status=PUBLISHED"
            />
          </StatGrid>
        </AdminSection>
      ) : null}

      {feed && showInquiries ? (
        <AdminSection title="Enquiries">
          <StatGrid columns={3}>
            <StatTile
              label="New commissions"
              value={feed.newInquiries}
              tone={feed.newInquiries > 0 ? "attention" : "default"}
              href="/admin/inquiries?status=NEW"
            />
            <StatTile label="Open commissions" value={feed.openInquiries} href="/admin/inquiries" />
            <StatTile label="New wholesale" value={feed.newWholesaleInquiries} />
          </StatGrid>
        </AdminSection>
      ) : null}

      {feed && showCommerce ? (
        <AdminSection
          title="Recent orders"
          actions={
            <Link href="/admin/orders" className="text-nav text-primary hover:underline">
              All orders
            </Link>
          }
        >
          {feed.recentOrders.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">
              No orders yet. The storefront is live and checkout is working — the first
              order will appear here.
            </p>
          ) : (
            <Table>
              <TableCaption className="sr-only">The eight most recent orders</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feed.recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-body-sm font-medium tabular-nums hover:text-primary"
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="text-metadata mt-1 block text-muted-foreground">
                        {order.createdAt.toISOString().slice(0, 10)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{order.customerName}</TableCell>
                    <TableCell>
                      <Badge variant={order.paymentStatus === "PAID" ? "success" : "neutral"}>
                        {PAYMENT_LABEL[order.paymentStatus as keyof typeof PAYMENT_LABEL]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {FULFILMENT_LABEL[order.fulfilmentStatus as keyof typeof FULFILMENT_LABEL]}
                      </Badge>
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
      ) : null}

      {feed && can(user.role, "customer:read") && feed.recentCustomers.length > 0 ? (
        <AdminSection
          title="Recent customers"
          actions={
            <Link href="/admin/customers" className="text-nav text-primary hover:underline">
              All customers
            </Link>
          }
        >
          <ul className="divide-y divide-border border-y border-border">
            {feed.recentCustomers.map((customer) => (
              <li key={customer.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <Link
                  href={`/admin/customers/${customer.id}`}
                  className="text-body-sm font-medium hover:text-primary"
                >
                  {customer.name}
                </Link>
                <span className="text-metadata text-muted-foreground">
                  {customer.orderCount} order{customer.orderCount === 1 ? "" : "s"} ·{" "}
                  {customer.createdAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </AdminSection>
      ) : null}
    </div>
  );
}
