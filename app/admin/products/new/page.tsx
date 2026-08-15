import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { getCatalogueOptions } from "@/lib/admin/catalogue-options";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";

export const metadata: Metadata = { title: "Add a piece" };
export const dynamic = "force-dynamic";

/**
 * Creating a piece.
 *
 * Deliberately spare: name and web address, then everything else optional. A new
 * record starts in CATALOGUE and cannot reach the storefront until someone
 * publishes it, so there is no risk in saving an incomplete piece — and
 * demanding a price up front would push whoever is entering it to guess one.
 */
export default async function NewProductPage() {
  await requirePermission("product:write");
  const options = await getCatalogueOptions();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        backHref="/admin/products"
        backLabel="All pieces"
        title="Add a piece"
        description="Saved as a catalogue entry. It stays off the public site until you publish it."
      />

      <ProductForm
        values={{
          name: "",
          slug: "",
          sku: "",
          collectionId: "",
          categoryId: "",
          artistId: "",
          description: "",
          story: "",
          material: "",
          careInstructions: "",
          heightCm: "",
          widthCm: "",
          weightKg: "",
          price: "",
          currency: options.defaultCurrency,
          availability: "",
          productionLeadTimeDays: "",
          featured: false,
          sourceNote: "",
        }}
        collections={options.collections}
        categories={options.categories}
        artists={options.artists}
        defaultCurrency={options.defaultCurrency}
        cancelHref="/admin/products"
      />
    </div>
  );
}
