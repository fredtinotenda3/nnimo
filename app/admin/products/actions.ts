"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireMutationPermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import {
  formError,
  formSuccess,
  field,
  validationFailed,
  type AdminFormState,
} from "@/lib/admin/forms";
import {
  attachImageSchema,
  detachImageSchema,
  idParam,
  imagePositionSchema,
  productLifecycleSchema,
  productSchema,
  productSeoSchema,
  setPrimaryImageSchema,
} from "@/lib/admin/schemas";
import { slugify, uniqueSlug, uniqueViolationTarget } from "@/lib/admin/slug";


/**
 * Product mutations.
 *
 * Every action opens with `requireMutationPermission("product:write")`. That call is the
 * authorisation boundary — not the admin layout, not the fact that the form was
 * only rendered for permitted roles, and certainly not any value in the
 * FormData. A server action is a POST endpoint with a generated URL; anyone who
 * can reach the app can invoke one, so each must prove the caller's rights on
 * its own. Next's server actions carry an origin check, which covers CSRF, but
 * that says nothing about authorisation.
 *
 * Cache invalidation is explicit at the end of each action, and it always
 * includes the public paths — an admin publishing a piece and not seeing it on
 * the storefront is the bug that makes a CMS feel broken.
 */

/** Public pages whose content depends on the catalogue. */
function revalidateCatalogue(slug?: string | null) {
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/collections");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/products/${slug}`);
}

async function slugTaken(candidate: string, excludeId?: string): Promise<boolean> {
  const existing = await db.product.findUnique({
    where: { slug: candidate },
    select: { id: true },
  });
  return existing !== null && existing.id !== excludeId;
}

function readProductForm(formData: FormData) {
  return productSchema.safeParse({
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    sku: field(formData, "sku"),
    collectionId: field(formData, "collectionId"),
    categoryId: field(formData, "categoryId"),
    artistId: field(formData, "artistId"),
    description: field(formData, "description"),
    story: field(formData, "story"),
    material: field(formData, "material"),
    careInstructions: field(formData, "careInstructions"),
    heightCm: field(formData, "heightCm"),
    widthCm: field(formData, "widthCm"),
    weightKg: field(formData, "weightKg"),
    price: field(formData, "price"),
    currency: field(formData, "currency") || "USD",
    availability: field(formData, "availability"),
    productionLeadTimeDays: field(formData, "productionLeadTimeDays"),
    featured: formData.get("featured"),
    sourceNote: field(formData, "sourceNote"),
  });
}

export async function createProductAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("product:write");

  const parsed = readProductForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  const slug = input.slug ?? (await uniqueSlug(input.name, (candidate) => slugTaken(candidate)));

  let createdId: string;
  let createdSlug: string;
  try {
    const product = await db.product.create({
      data: {
        ...input,
        slug,
        // A new piece always starts in CATALOGUE. Publishing is a separate,
        // audited decision — creating a record and making it public are not the
        // same action and must not share a button.
        lifecycleStage: "CATALOGUE",
      },
      select: { id: true, slug: true, name: true },
    });
    createdId = product.id;
    createdSlug = product.slug;
  } catch (error) {
    const target = uniqueViolationTarget(error);
    if (target === "slug") {
      return formError("That web address is already in use.", { slug: "Already taken" });
    }
    if (target === "sku") {
      return formError("That SKU already belongs to another piece.", { sku: "Already taken" });
    }
    logger.error("admin.product.create_failed", { userId: user.id, error });
    return formError("The piece could not be created. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "product.created",
    entityType: "Product",
    entityId: createdId,
    metadata: { name: input.name, slug: createdSlug },
  });

  revalidateCatalogue(createdSlug);
  // redirect() throws internally, so it must be the last statement — anything
  // after it is unreachable.
  redirect(`/admin/products/${createdId}?created=1`);
}

export async function updateProductAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("product:write");

  const idResult = idParam.safeParse(formData.get("id"));
  if (!idResult.success) return formError("That piece could not be identified.");
  const id = idResult.data;

  const parsed = readProductForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  const existing = await db.product.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true, price: true, currency: true, lifecycleStage: true },
  });
  if (!existing) return formError("That piece no longer exists.");

  const slug = input.slug ?? existing.slug;

  try {
    await db.product.update({ where: { id }, data: { ...input, slug } });
  } catch (error) {
    const target = uniqueViolationTarget(error);
    if (target === "slug") {
      return formError("That web address is already in use.", { slug: "Already taken" });
    }
    if (target === "sku") {
      return formError("That SKU already belongs to another piece.", { sku: "Already taken" });
    }
    logger.error("admin.product.update_failed", { userId: user.id, error });
    return formError("The changes could not be saved. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "product.updated",
    entityType: "Product",
    entityId: id,
    metadata: { name: input.name },
  });

  // A price change gets its own audit entry as well as the general update.
  // It is the field that decides whether money can change hands, so it is worth
  // being able to answer "who set this price, and when" without reading diffs.
  const previousPrice = existing.price === null ? null : String(existing.price);
  if (previousPrice !== input.price) {
    await recordAudit({
      userId: user.id,
      action: "product.price_change",
      entityType: "Product",
      entityId: id,
      metadata: {
        from: previousPrice,
        to: input.price,
        currency: input.currency,
        // Worth flagging: removing the price of a live piece makes it
        // immediately unpurchasable on the storefront.
        wasPublished: existing.lifecycleStage === "PUBLISHED",
      },
    });
  }

  revalidateCatalogue(slug);
  if (slug !== existing.slug) revalidatePath(`/products/${existing.slug}`);
  revalidatePath(`/admin/products/${id}`);

  return formSuccess("Saved.");
}

export async function updateProductSeoAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("product:write");

  const idResult = idParam.safeParse(formData.get("id"));
  if (!idResult.success) return formError("That piece could not be identified.");
  const id = idResult.data;

  const parsed = productSeoSchema.safeParse({
    seoTitle: field(formData, "seoTitle"),
    seoDescription: field(formData, "seoDescription"),
    ogImageId: field(formData, "ogImageId"),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const product = await db.product.findUnique({ where: { id }, select: { slug: true } });
  if (!product) return formError("That piece no longer exists.");

  await db.product.update({ where: { id }, data: parsed.data });

  await recordAudit({
    userId: user.id,
    action: "product.updated",
    entityType: "Product",
    entityId: id,
    metadata: { section: "seo" },
  });

  revalidatePath(`/admin/products/${id}`);
  revalidatePath(`/products/${product.slug}`);
  return formSuccess("Search settings saved.");
}

/**
 * Moves a piece between catalogue, published and archived.
 *
 * Publishing sets an availability if none exists, because the storefront cannot
 * say anything truthful about a live piece without one. MADE_TO_ORDER is the
 * honest default for handmade work with no counted stock — IN_STOCK would be a
 * claim about physical inventory nobody has verified. This mirrors the Phase 2
 * toggle exactly rather than introducing a second rule.
 */
export async function setProductLifecycleAction(formData: FormData): Promise<void> {
  const user = await requireMutationPermission("product:write");

  const parsed = productLifecycleSchema.safeParse({
    id: formData.get("id"),
    lifecycleStage: formData.get("lifecycleStage"),
  });
  if (!parsed.success) return;

  const { id, lifecycleStage } = parsed.data;

  const product = await db.product.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, availability: true, lifecycleStage: true, price: true },
  });
  if (!product || product.lifecycleStage === lifecycleStage) return;

  await db.product.update({
    where: { id },
    data: {
      lifecycleStage,
      availability:
        lifecycleStage === "PUBLISHED"
          ? (product.availability ?? "MADE_TO_ORDER")
          : product.availability,
    },
  });

  const action =
    lifecycleStage === "PUBLISHED"
      ? "product.publish"
      : lifecycleStage === "ARCHIVED"
        ? "product.archive"
        : "product.unpublish";

  await recordAudit({
    userId: user.id,
    action,
    entityType: "Product",
    entityId: id,
    metadata: {
      name: product.name,
      from: product.lifecycleStage,
      to: lifecycleStage,
      // Recorded because it is a legitimate but consequential state: live on the
      // site, and impossible to buy.
      publishedWithoutPrice: lifecycleStage === "PUBLISHED" && product.price === null,
    },
  });

  revalidateCatalogue(product.slug);
  revalidatePath(`/admin/products/${id}`);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * Attaches an existing Media row to a product.
 *
 * No file is copied. ProductImage is a join row, so the same photograph can
 * appear on several pieces while one file exists on disk (§5: "do not duplicate
 * physical files unnecessarily"). The unique index on (productId, mediaId) is
 * what makes a double-submit harmless.
 */
export async function attachProductImageAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("product:write");

  const parsed = attachImageSchema.safeParse({
    productId: formData.get("productId"),
    mediaId: formData.get("mediaId"),
  });
  if (!parsed.success) return formError("Choose an image to add.");
  const { productId, mediaId } = parsed.data;

  const [product, media] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, select: { id: true, slug: true } }),
    db.media.findUnique({ where: { id: mediaId }, select: { id: true } }),
  ]);
  if (!product) return formError("That piece no longer exists.");
  if (!media) return formError("That image no longer exists.");

  const [existingCount, alreadyAttached] = await Promise.all([
    db.productImage.count({ where: { productId } }),
    db.productImage.findFirst({ where: { productId, mediaId }, select: { id: true } }),
  ]);

  if (alreadyAttached) return formError("That image is already on this piece.");

  try {
    await db.productImage.create({
      data: {
        productId,
        mediaId,
        position: existingCount,
        // The first image attached becomes the primary one. Otherwise a piece
        // with photographs would still render the "photograph to follow"
        // fallback until someone noticed the primary flag existed.
        isPrimary: existingCount === 0,
      },
    });
  } catch (error) {
    // The unique index caught a concurrent duplicate. Harmless — the desired
    // end state already holds.
    if (uniqueViolationTarget(error)) return formError("That image is already on this piece.");
    logger.error("admin.product.attach_image_failed", { userId: user.id, error });
    return formError("The image could not be added.");
  }

  await recordAudit({
    userId: user.id,
    action: "product.images_updated",
    entityType: "Product",
    entityId: productId,
    metadata: { change: "attached", mediaId },
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidateCatalogue(product.slug);
  return formSuccess("Image added.");
}

export async function detachProductImageAction(formData: FormData): Promise<void> {
  const user = await requireMutationPermission("product:write");

  const parsed = detachImageSchema.safeParse({
    productId: formData.get("productId"),
    imageId: formData.get("imageId"),
  });
  if (!parsed.success) return;
  const { productId, imageId } = parsed.data;

  const image = await db.productImage.findUnique({
    where: { id: imageId },
    select: { id: true, productId: true, isPrimary: true, mediaId: true },
  });
  // The productId check matters: without it, a crafted request could remove an
  // image from a different product than the form claimed to be editing.
  if (!image || image.productId !== productId) return;

  await db.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });

    // Removing the primary image must promote another, or the gallery falls
    // back to "no photograph" while photographs still exist.
    if (image.isPrimary) {
      const next = await tx.productImage.findFirst({
        where: { productId },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      if (next) {
        await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    }

    // Close the gap left in the ordering so positions stay 0..n-1 and the
    // reorder arrows keep behaving.
    const remaining = await tx.productImage.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    for (const [index, row] of remaining.entries()) {
      await tx.productImage.update({ where: { id: row.id }, data: { position: index } });
    }
  });

  await recordAudit({
    userId: user.id,
    action: "product.images_updated",
    entityType: "Product",
    entityId: productId,
    metadata: { change: "detached", mediaId: image.mediaId },
  });

  const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  revalidatePath(`/admin/products/${productId}`);
  revalidateCatalogue(product?.slug ?? null);
}

/**
 * Moves one image up or down in the gallery.
 *
 * Two buttons rather than drag-and-drop. Reordering by keyboard is a WCAG 2.1.1
 * requirement, drag-and-drop needs a keyboard alternative anyway, and a piece
 * has three or four photographs — the arrows are the whole feature, not a
 * fallback for one. The swap runs in a transaction so an interrupted request
 * cannot leave two images sharing a position.
 */
export async function moveProductImageAction(formData: FormData): Promise<void> {
  await requireMutationPermission("product:write");

  const parsed = imagePositionSchema.safeParse({
    productId: formData.get("productId"),
    imageId: formData.get("imageId"),
    direction: formData.get("direction"),
  });
  if (!parsed.success) return;
  const { productId, imageId, direction } = parsed.data;

  const images = await db.productImage.findMany({
    where: { productId },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });

  const index = images.findIndex((image: { id: string }) => image.id === imageId);
  if (index === -1) return;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= images.length) return;

  const current = images[index];
  const target = images[swapIndex];
  if (!current || !target) return;

  await db.$transaction([
    db.productImage.update({ where: { id: current.id }, data: { position: target.position } }),
    db.productImage.update({ where: { id: target.id }, data: { position: current.position } }),
  ]);

  revalidatePath(`/admin/products/${productId}`);
  const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  revalidateCatalogue(product?.slug ?? null);
}

export async function setPrimaryImageAction(formData: FormData): Promise<void> {
  const user = await requireMutationPermission("product:write");

  const parsed = setPrimaryImageSchema.safeParse({
    productId: formData.get("productId"),
    imageId: formData.get("imageId"),
  });
  if (!parsed.success) return;
  const { productId, imageId } = parsed.data;

  const image = await db.productImage.findUnique({
    where: { id: imageId },
    select: { id: true, productId: true },
  });
  if (!image || image.productId !== productId) return;

  // Clear then set, in one transaction: "exactly one primary" is an invariant
  // the storefront query depends on (it orders by isPrimary desc, take 1).
  await db.$transaction([
    db.productImage.updateMany({ where: { productId }, data: { isPrimary: false } }),
    db.productImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
  ]);

  await recordAudit({
    userId: user.id,
    action: "product.images_updated",
    entityType: "Product",
    entityId: productId,
    metadata: { change: "primary", imageId },
  });

  revalidatePath(`/admin/products/${productId}`);
  const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  revalidateCatalogue(product?.slug ?? null);
}

/** Suggests a slug from a name, for the "generate" button on the form. */
export async function suggestSlugAction(name: string): Promise<string> {
  await requireMutationPermission("product:write");
  const base = slugify(name);
  if (!base) return "";
  return uniqueSlug(base, (candidate) => slugTaken(candidate));
}
