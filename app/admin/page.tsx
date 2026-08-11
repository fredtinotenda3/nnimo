import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import {
  CollectionStatus,
  ProductLifecycleStage,
} from "@/lib/generated/prisma/enums";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableNumericCell, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/**
 * Phase 1 dashboard: counts only, every one a real COUNT(*) against the
 * database. No revenue, no conversion, no "sales this month" — there are no
 * orders yet, and a chart drawn from nothing is the fake analytics the brief
 * rules out. Those panels arrive in Phase 7 when there is data behind them.
 */
export default async function AdminDashboardPage() {
  await requirePermission("dashboard:read");

  const [
    collectionsTotal,
    collectionsPublished,
    productsTotal,
    productsCatalogue,
    productsPublished,
    productsArchived,
    productsWithPrice,
    productsWithDimensions,
    artistsTotal,
    ordersTotal,
    customOrdersTotal,
    wholesaleTotal,
  ] = await Promise.all([
    db.collection.count(),
    db.collection.count({ where: { status: CollectionStatus.PUBLISHED } }),
    db.product.count(),
    db.product.count({ where: { lifecycleStage: ProductLifecycleStage.CATALOGUE } }),
    db.product.count({ where: { lifecycleStage: ProductLifecycleStage.PUBLISHED } }),
    db.product.count({ where: { lifecycleStage: ProductLifecycleStage.ARCHIVED } }),
    db.product.count({ where: { price: { not: null } } }),
    db.product.count({ where: { heightCm: { not: null } } }),
    db.artist.count(),
    db.order.count(),
    db.customOrderInquiry.count(),
    db.wholesaleInquiry.count(),
  ]);

  const catalogueRows = [
    { label: "In catalogue, not published", value: productsCatalogue, note: "Imported from the brochures" },
    { label: "Published for sale", value: productsPublished, note: "Visible on the public site" },
    { label: "Archived", value: productsArchived, note: "Kept for reference only" },
  ];

  const dataQualityRows = [
    {
      label: "Pieces with a confirmed price",
      value: productsWithPrice,
      of: productsTotal,
      note: "From the supplied price list",
    },
    {
      label: "Pieces with measured dimensions",
      value: productsWithDimensions,
      of: productsTotal,
      note: "From the Nnino catalogue",
    },
  ];

  return (
    <div className="flex flex-col gap-14">
      <header>
        <p className="text-label text-muted-foreground">Overview</p>
        <h1 className="text-heading-1 mt-3">Dashboard</h1>
        <p className="text-body-sm mt-4 max-w-2xl text-muted-foreground">
          Everything below is counted directly from the database. Revenue, order and
          campaign reporting are deliberately absent until there are orders to
          report on.
        </p>
      </header>

      <section>
        <h2 className="text-heading-2">Catalogue</h2>
        <Table className="mt-6">
          <TableCaption className="sr-only">
            Product counts by lifecycle stage
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead>Meaning</TableHead>
              <TableHead className="text-right">Pieces</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalogueRows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-muted-foreground">{row.note}</TableCell>
                <TableNumericCell>{row.value}</TableNumericCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-medium">Total</TableCell>
              <TableCell className="text-muted-foreground">
                Across {collectionsTotal} ranges, {collectionsPublished} published
              </TableCell>
              <TableNumericCell className="font-medium">{productsTotal}</TableNumericCell>
            </TableRow>
          </TableBody>
        </Table>
        <Link href="/admin/products" className="text-nav mt-5 inline-block text-primary hover:underline">
          Open the catalogue
        </Link>
      </section>

      <section>
        <h2 className="text-heading-2">What still needs the team&rsquo;s input</h2>
        <p className="text-body-sm mt-3 max-w-2xl text-muted-foreground">
          The import only carried facts the source documents actually state. These
          counts show how much of the catalogue is still waiting on real numbers.
        </p>
        <Table className="mt-6">
          <TableCaption className="sr-only">Catalogue data completeness</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Complete</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataQualityRows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-muted-foreground">{row.note}</TableCell>
                <TableNumericCell>
                  {row.value} / {row.of}
                </TableNumericCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section>
        <h2 className="text-heading-2">Elsewhere</h2>
        <Table className="mt-6">
          <TableCaption className="sr-only">Other record counts</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Record</TableHead>
              <TableHead className="text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Team members</TableCell>
              <TableNumericCell>{artistsTotal}</TableNumericCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Orders</TableCell>
              <TableNumericCell>{ordersTotal}</TableNumericCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Commission enquiries</TableCell>
              <TableNumericCell>{customOrdersTotal}</TableNumericCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Wholesale enquiries</TableCell>
              <TableNumericCell>{wholesaleTotal}</TableNumericCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
