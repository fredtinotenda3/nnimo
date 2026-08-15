import "server-only";
import { db } from "@/lib/db";
import type { Option } from "@/components/admin/product-form";

/**
 * The option lists every catalogue form needs.
 *
 * One place, because the create and edit pages must offer identical choices —
 * two queries that drift is how a range appears when adding a piece and vanishes
 * when editing it. Archived collections are included deliberately: a piece can
 * legitimately still belong to a retired range, and hiding them would silently
 * strip the association on the next save.
 */
export async function getCatalogueOptions(): Promise<{
  collections: Option[];
  categories: Option[];
  artists: Option[];
  defaultCurrency: string;
}> {
  const [collections, categories, artists, currencySetting] = await Promise.all([
    db.collection.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, status: true },
    }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.artist.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true, isActive: true },
    }),
    db.setting.findUnique({ where: { key: "commerce.currency" }, select: { value: true } }),
  ]);

  return {
    collections: (collections as { id: string; name: string; status: string }[]).map(
      (collection) => ({
        id: collection.id,
        label:
          collection.status === "PUBLISHED"
            ? collection.name
            : `${collection.name} (${collection.status.toLowerCase()})`,
      }),
    ),
    categories: (categories as { id: string; name: string }[]).map((category) => ({
      id: category.id,
      label: category.name,
    })),
    artists: (artists as { id: string; name: string; role: string; isActive: boolean }[]).map(
      (artist) => ({
        id: artist.id,
        label: artist.isActive ? `${artist.name} — ${artist.role}` : `${artist.name} (inactive)`,
      }),
    ),
    defaultCurrency: currencySetting?.value?.trim().toUpperCase() || "USD",
  };
}

/** Decimal to the plain string a text input expects. Never via a JS number. */
export function decimalToInput(value: { toString(): string } | null | undefined): string {
  return value === null || value === undefined ? "" : value.toString();
}
