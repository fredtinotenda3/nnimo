import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { ProductLifecycleStage } from "@/lib/generated/prisma/enums";
import { formatDimensions, formatPrice, formatWeight, PRICE_ON_REQUEST } from "@/lib/money";
import { availableQuantity } from "@/lib/inventory";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PublishToggle } from "@/components/admin/publish-toggle";
import { toggleProductPublished } from "@/app/admin/publish-actions";
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

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

type BadgeTone = "neutral" | "success" | "outline";

/**
 * Presentation of the lifecycle stage, kept as functions with an explicit
 * parameter type rather than bare record lookups so the compiler checks the
 * argument at every call site and the mapping stays exhaustive if a stage is
 * ever added to the enum.
 */
const STAGE_LABEL: Record<ProductLifecycleStage, string> = {
  CATALOGUE: "Catalogue",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const STAGE_TONE: Record<ProductLifecycleStage, BadgeTone> = {
  CATALOGUE: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "outline",
};

function stageLabel(stage: ProductLifecycleStage): string {
  return STAGE_LABEL[stage];
}

function stageTone(stage: ProductLifecycleStage): BadgeTone {
  return STAGE_TONE[stage];
}

/**
 * Read-only catalogue listing for Phase 1.
 *
 * Its job is to make the state of the imported data legible: which pieces are
 * merely in the catalogue versus published for sale, and which have real prices
 * and measurements as opposed to fields still waiting on the business. Editing
 * arrives in Phase 4.
 */
export default async function AdminProductsPage() {
  await requirePermission("product:read");

  const products = await db.product.findMany({
    orderBy: [{ collection: { sortOrder: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      sku: true,
      lifecycleStage: true,
      availability: true,
      price: true,
      currency: true,
      heightCm: true,
      widthCm: true,
      weightKg: true,
      sourceNote: true,
      collection: { select: { name: true } },
      inventory: { select: { onHand: true, reserved: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-label text-muted-foreground">Catalogue</p>
        <h1 className="text-heading-1 mt-3">Products</h1>
        <p className="text-body-sm mt-4 max-w-2xl text-muted-foreground">
          {products.length} pieces imported from the Nnino brochure and catalogue. A
          piece being in the catalogue does not mean it is for sale — publishing is a
          separate decision, made here.
        </p>
      </header>

      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Run `npm run db:seed` to import the catalogue from the supplied brochures."
        />
      ) : (
        <Table>
          <TableCaption className="sr-only">
            All catalogue products with stage, price and measurements
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Piece</TableHead>
              <TableHead>Range</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Measurements</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead><span className="sr-only">Publish</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const price = formatPrice(product.price, product.currency);
              const dimensions = formatDimensions(product.heightCm, product.widthCm);
              const weight = formatWeight(product.weightKg);
              const measurements = [dimensions, weight].filter(Boolean).join(" · ");

              return (
                <TableRow key={product.id}>
                  <TableCell>
                    <span className="font-medium">{product.name}</span>
                    {product.sku ? (
                      <span className="text-metadata mt-1 block text-muted-foreground">
                        {product.sku}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.collection?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={stageTone(product.lifecycleStage)}>
                      {stageLabel(product.lifecycleStage)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {measurements || (
                      <span className="text-metadata">Not recorded</span>
                    )}
                  </TableCell>
                  <TableNumericCell>
                    {price ?? (
                      <span className="text-metadata text-muted-foreground">
                        {PRICE_ON_REQUEST}
                      </span>
                    )}
                  </TableNumericCell>
                  <TableNumericCell className="text-muted-foreground">
                    {product.inventory ? availableQuantity(product.inventory) : "—"}
                  </TableNumericCell>
                  <TableCell className="text-right">
                    <PublishToggle
                      id={product.id}
                      published={product.lifecycleStage === "PUBLISHED"}
                      action={toggleProductPublished}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
