"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireMutationPermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { field, formError, formSuccess, validationFailed, type AdminFormState } from "@/lib/admin/forms";
import { campaignProductSchema, campaignSchema, idParam } from "@/lib/admin/schemas";
import { uniqueSlug, uniqueViolationTarget } from "@/lib/admin/slug";

/**
 * Campaign mutations.
 *
 * Deliberately mirrors app/admin/collections/actions.ts: a campaign is
 * structurally the same kind of record as a collection — named, sluggable,
 * publishable, optionally holding a hero image — so it gets the identical
 * create/update split, slug-collision handling, and audited-status-change
 * pattern rather than a new shape invented for it.
 */

function revalidateCampaigns() {
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin/analytics/campaigns");
}

async function slugTaken(candidate: string, excludeId?: string): Promise<boolean> {
  const existing = await db.campaign.findUnique({ where: { slug: candidate }, select: { id: true } });
  return existing !== null && existing.id !== excludeId;
}

function readCampaignForm(formData: FormData) {
  return campaignSchema.safeParse({
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    description: field(formData, "description"),
    heroImageId: field(formData, "heroImageId"),
    collectionId: field(formData, "collectionId"),
    cta: field(formData, "cta"),
    ctaLabel: field(formData, "ctaLabel"),
    startDate: field(formData, "startDate"),
    endDate: field(formData, "endDate"),
    status: field(formData, "status") || "DRAFT",
  });
}

export async function createCampaignAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("campaign:write");

  const parsed = readCampaignForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  const slug = input.slug ?? (await uniqueSlug(input.name, (candidate) => slugTaken(candidate)));

  let createdId: string;
  try {
    const campaign = await db.campaign.create({
      data: { ...input, slug },
      select: { id: true },
    });
    createdId = campaign.id;
  } catch (error) {
    if (uniqueViolationTarget(error) === "slug") {
      return formError("That web address is already in use.", { slug: "Already taken" });
    }
    logger.error("admin.campaign.create_failed", { userId: user.id, error });
    return formError("The campaign could not be created. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "campaign.created",
    entityType: "Campaign",
    entityId: createdId,
    metadata: { name: input.name, status: input.status },
  });

  revalidateCampaigns();
  redirect(`/admin/campaigns/${createdId}?created=1`);
}

export async function updateCampaignAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("campaign:write");

  const idResult = idParam.safeParse(formData.get("id"));
  if (!idResult.success) return formError("That campaign could not be identified.");
  const id = idResult.data;

  const parsed = readCampaignForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  const existing = await db.campaign.findUnique({
    where: { id },
    select: { id: true, slug: true, status: true, name: true },
  });
  if (!existing) return formError("That campaign no longer exists.");

  const slug = input.slug ?? existing.slug;

  try {
    await db.campaign.update({ where: { id }, data: { ...input, slug } });
  } catch (error) {
    if (uniqueViolationTarget(error) === "slug") {
      return formError("That web address is already in use.", { slug: "Already taken" });
    }
    logger.error("admin.campaign.update_failed", { userId: user.id, error });
    return formError("The changes could not be saved. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "campaign.updated",
    entityType: "Campaign",
    entityId: id,
    metadata: { name: input.name },
  });

  // A status change into or out of ACTIVE is its own audited event, the same
  // way a collection's publish/unpublish is — it is the moment the campaign
  // becomes (or stops being) the thing landing pages and CTAs point at.
  if (existing.status !== input.status && (existing.status === "ACTIVE" || input.status === "ACTIVE")) {
    await recordAudit({
      userId: user.id,
      action: input.status === "ACTIVE" ? "campaign.published" : "campaign.unpublished",
      entityType: "Campaign",
      entityId: id,
      metadata: { from: existing.status, to: input.status, name: input.name },
    });
  }

  revalidateCampaigns();
  revalidatePath(`/admin/campaigns/${id}`);

  return formSuccess("Saved.");
}

/**
 * The list page's quick toggle, for the common case of switching a campaign
 * between Active and Archived without opening the full edit form — mirrors
 * toggleCollectionPublished in app/admin/publish-actions.ts. Anything other
 * than Active/Archived (Scheduled, Ended) is set from the edit form instead,
 * since those are date-driven states this toggle should not collapse.
 */
export async function toggleCampaignPublishedAction(formData: FormData): Promise<void> {
  const user = await requireMutationPermission("campaign:write");
  const id = idParam.parse(formData.get("id"));

  const campaign = await db.campaign.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!campaign) return;

  const publishing = campaign.status !== "ACTIVE";

  await db.campaign.update({
    where: { id },
    data: { status: publishing ? "ACTIVE" : "ARCHIVED" },
  });

  await recordAudit({
    userId: user.id,
    action: publishing ? "campaign.published" : "campaign.unpublished",
    entityType: "Campaign",
    entityId: id,
    metadata: { name: campaign.name },
  });

  revalidateCampaigns();
  revalidatePath(`/admin/campaigns/${id}`);
}

/**
 * Adds or removes a product from a campaign.
 *
 * Unlike collection membership (Product.collectionId, a single foreign key),
 * campaign membership is the CampaignProduct join table — a product can
 * legitimately be featured in more than one campaign at once (a piece running
 * in both a seasonal push and its own range launch), so this is an add/remove
 * against rows, not a reassignment of a single field.
 */
export async function setCampaignProductAction(formData: FormData): Promise<void> {
  const user = await requireMutationPermission("campaign:write");

  const parsed = campaignProductSchema.safeParse({
    campaignId: formData.get("campaignId"),
    productId: formData.get("productId"),
    action: formData.get("action"),
  });
  if (!parsed.success) return;
  const { campaignId, productId, action } = parsed.data;

  const [campaign, product] = await Promise.all([
    db.campaign.findUnique({ where: { id: campaignId }, select: { id: true, name: true } }),
    db.product.findUnique({ where: { id: productId }, select: { id: true, name: true } }),
  ]);
  if (!campaign || !product) return;

  if (action === "add") {
    await db.campaignProduct.upsert({
      where: { campaignId_productId: { campaignId, productId } },
      create: { campaignId, productId },
      update: {},
    });
  } else {
    await db.campaignProduct.deleteMany({ where: { campaignId, productId } });
  }

  await recordAudit({
    userId: user.id,
    action: "campaign.products_updated",
    entityType: "Campaign",
    entityId: campaignId,
    metadata: { productId, productName: product.name, action },
  });

  revalidatePath(`/admin/campaigns/${campaignId}`);
}
