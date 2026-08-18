"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireMutationPermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import {
  field,
  formError,
  formSuccess,
  validationFailed,
  type AdminFormState,
} from "@/lib/admin/forms";
import { collectionMembershipSchema, collectionSchema, idParam } from "@/lib/admin/schemas";
import { uniqueSlug, uniqueViolationTarget } from "@/lib/admin/slug";



/**
 * Collection mutations.
 *
 * The rule this section exists to protect is the public/draft boundary. A
 * collection's `status` is what `PUBLIC_COLLECTION_WHERE` filters on, and every
 * public query composes that constant — so unpublishing a range removes it from
 * /collections, the homepage and the sitemap with no further work here. What
 * this file must get right is invalidating those pages, which is why every
 * mutation revalidates the public paths as well as the admin ones.
 */

function revalidateCollections(slug?: string | null) {
  revalidatePath("/admin/collections");
  revalidatePath("/collections");
  revalidatePath("/shop");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/collections/${slug}`);
}

async function slugTaken(candidate: string, excludeId?: string): Promise<boolean> {
  const existing = await db.collection.findUnique({
    where: { slug: candidate },
    select: { id: true },
  });
  return existing !== null && existing.id !== excludeId;
}

function readCollectionForm(formData: FormData) {
  return collectionSchema.safeParse({
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    description: field(formData, "description"),
    story: field(formData, "story"),
    heroImageId: field(formData, "heroImageId"),
    status: field(formData, "status") || "DRAFT",
    featured: formData.get("featured"),
    sortOrder: field(formData, "sortOrder"),
    seoTitle: field(formData, "seoTitle"),
    seoDescription: field(formData, "seoDescription"),
    ogImageId: field(formData, "ogImageId"),
  });
}

export async function createCollectionAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("collection:write");

  const parsed = readCollectionForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  const slug = input.slug ?? (await uniqueSlug(input.name, (candidate) => slugTaken(candidate)));

  let createdId: string;
  try {
    const collection = await db.collection.create({
      data: { ...input, slug },
      select: { id: true, slug: true },
    });
    createdId = collection.id;
  } catch (error) {
    if (uniqueViolationTarget(error) === "slug") {
      return formError("That web address is already in use.", { slug: "Already taken" });
    }
    logger.error("admin.collection.create_failed", { userId: user.id, error });
    return formError("The range could not be created. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "collection.created",
    entityType: "Collection",
    entityId: createdId,
    metadata: { name: input.name, status: input.status },
  });

  revalidateCollections(slug);
  redirect(`/admin/collections/${createdId}?created=1`);
}

export async function updateCollectionAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("collection:write");

  const idResult = idParam.safeParse(formData.get("id"));
  if (!idResult.success) return formError("That range could not be identified.");
  const id = idResult.data;

  const parsed = readCollectionForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  const existing = await db.collection.findUnique({
    where: { id },
    select: { id: true, slug: true, status: true, name: true },
  });
  if (!existing) return formError("That range no longer exists.");

  const slug = input.slug ?? existing.slug;

  try {
    await db.collection.update({ where: { id }, data: { ...input, slug } });
  } catch (error) {
    if (uniqueViolationTarget(error) === "slug") {
      return formError("That web address is already in use.", { slug: "Already taken" });
    }
    logger.error("admin.collection.update_failed", { userId: user.id, error });
    return formError("The changes could not be saved. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "collection.updated",
    entityType: "Collection",
    entityId: id,
    metadata: { name: input.name },
  });

  // A status change is its own audited event: it is the moment a range becomes
  // visible to the public, which is not the same class of change as fixing a
  // typo in its description.
  if (existing.status !== input.status) {
    await recordAudit({
      userId: user.id,
      action: input.status === "PUBLISHED" ? "collection.published" : "collection.unpublished",
      entityType: "Collection",
      entityId: id,
      metadata: { from: existing.status, to: input.status, name: input.name },
    });
  }

  revalidateCollections(slug);
  if (slug !== existing.slug) revalidatePath(`/collections/${existing.slug}`);
  revalidatePath(`/admin/collections/${id}`);

  return formSuccess("Saved.");
}

export async function updateCollectionSeoAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("collection:write");

  const idResult = idParam.safeParse(formData.get("id"));
  if (!idResult.success) return formError("That range could not be identified.");
  const id = idResult.data;

  const parsed = collectionSchema
    .pick({ seoTitle: true, seoDescription: true, ogImageId: true })
    .safeParse({
      seoTitle: field(formData, "seoTitle"),
      seoDescription: field(formData, "seoDescription"),
      ogImageId: field(formData, "ogImageId"),
    });
  if (!parsed.success) return validationFailed(parsed.error);

  const collection = await db.collection.findUnique({ where: { id }, select: { slug: true } });
  if (!collection) return formError("That range no longer exists.");

  await db.collection.update({ where: { id }, data: parsed.data });

  await recordAudit({
    userId: user.id,
    action: "collection.updated",
    entityType: "Collection",
    entityId: id,
    metadata: { section: "seo" },
  });

  revalidatePath(`/admin/collections/${id}`);
  revalidatePath(`/collections/${collection.slug}`);
  return formSuccess("Search settings saved.");
}

/**
 * Adds or removes a piece from a range.
 *
 * Membership lives on Product.collectionId, so "remove from range" sets it to
 * null rather than deleting anything — a piece without a range is a valid state
 * the catalogue already contains, and removing it from a range must never risk
 * removing it from the catalogue.
 */
export async function setCollectionMembershipAction(formData: FormData): Promise<void> {
  const user = await requireMutationPermission("collection:write");

  const parsed = collectionMembershipSchema.safeParse({
    collectionId: formData.get("collectionId"),
    productId: formData.get("productId"),
    action: formData.get("action"),
  });
  if (!parsed.success) return;
  const { collectionId, productId, action } = parsed.data;

  const [collection, product] = await Promise.all([
    db.collection.findUnique({ where: { id: collectionId }, select: { id: true, slug: true } }),
    db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, slug: true, collectionId: true },
    }),
  ]);
  if (!collection || !product) return;

  // Removing only applies when the piece is actually in this range. Without the
  // check, a stale form could clear a piece's membership of a different range.
  if (action === "remove" && product.collectionId !== collectionId) return;

  await db.product.update({
    where: { id: productId },
    data: { collectionId: action === "add" ? collectionId : null },
  });

  await recordAudit({
    userId: user.id,
    action: "collection.products_updated",
    entityType: "Collection",
    entityId: collectionId,
    metadata: { change: action, productId, productName: product.name },
  });

  revalidatePath(`/admin/collections/${collectionId}`);
  revalidatePath(`/products/${product.slug}`);
  revalidateCollections(collection.slug);
}
