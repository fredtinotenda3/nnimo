"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";

/**
 * Publish / unpublish toggles.
 *
 * Strictly speaking full catalogue editing is Phase 4. These two actions are
 * here because without them Phase 2 is unreviewable: everything imports as
 * DRAFT/CATALOGUE by design, so the public site is empty until somebody decides
 * what to publish — and that decision has to be the studio's, made in the admin,
 * not something baked into a seed script.
 *
 * Both are permission-gated and both write an audit row.
 */
const idSchema = z.object({ id: z.string().min(1).max(60) });

export async function toggleProductPublished(formData: FormData) {
  const user = await requirePermission("product:write");
  const { id } = idSchema.parse({ id: formData.get("id") });

  const product = await db.product.findUnique({
    where: { id },
    select: { id: true, name: true, lifecycleStage: true, availability: true },
  });
  if (!product) return;

  const publishing = product.lifecycleStage !== "PUBLISHED";

  await db.product.update({
    where: { id },
    data: {
      lifecycleStage: publishing ? "PUBLISHED" : "CATALOGUE",
      // A published piece needs an availability for the storefront to say
      // anything truthful about it. MADE_TO_ORDER is the honest default for
      // handmade one-offs with no stock record — not IN_STOCK, which would be a
      // claim about physical inventory nobody has counted.
      availability: publishing ? (product.availability ?? "MADE_TO_ORDER") : null,
    },
  });

  await recordAudit({
    userId: user.id,
    action: publishing ? "product.publish" : "product.unpublish",
    entityType: "Product",
    entityId: id,
    metadata: { name: product.name },
  });

  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/");
}

export async function toggleCollectionPublished(formData: FormData) {
  const user = await requirePermission("collection:write");
  const { id } = idSchema.parse({ id: formData.get("id") });

  const collection = await db.collection.findUnique({
    where: { id },
    select: { id: true, name: true, status: true },
  });
  if (!collection) return;

  const publishing = collection.status !== "PUBLISHED";

  await db.collection.update({
    where: { id },
    data: { status: publishing ? "PUBLISHED" : "DRAFT" },
  });

  await recordAudit({
    userId: user.id,
    action: publishing ? "product.publish" : "product.unpublish",
    entityType: "Collection",
    entityId: id,
    metadata: { name: collection.name },
  });

  revalidatePath("/admin/collections");
  revalidatePath("/collections");
  revalidatePath("/");
}
