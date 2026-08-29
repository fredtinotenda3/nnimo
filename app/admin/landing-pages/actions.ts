"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireMutationPermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { field, formError, formSuccess, validationFailed, type AdminFormState } from "@/lib/admin/forms";
import { idParam, landingPageSchema } from "@/lib/admin/schemas";
import { uniqueSlug, uniqueViolationTarget } from "@/lib/admin/slug";

/**
 * Landing page mutations. Same shape as app/admin/campaigns/actions.ts — see
 * there for the reasoning behind the create/update split and slug handling.
 *
 * The one thing this file must get right that a campaign does not need: a
 * landing page's `status` gates PUBLIC visibility directly (the public route
 * at /c/[slug] rejects anything that is not PUBLISHED — see
 * app/(site)/c/[slug]/page.tsx), so every path that changes `status` revalidates
 * that public route, not just the admin list.
 */

function revalidateLandingPages(slug?: string | null) {
  revalidatePath("/admin/landing-pages");
  if (slug) revalidatePath(`/c/${slug}`);
}

async function slugTaken(candidate: string, excludeId?: string): Promise<boolean> {
  const existing = await db.landingPage.findUnique({ where: { slug: candidate }, select: { id: true } });
  return existing !== null && existing.id !== excludeId;
}

function readLandingPageForm(formData: FormData) {
  return landingPageSchema.safeParse({
    title: field(formData, "title"),
    slug: field(formData, "slug"),
    campaignId: field(formData, "campaignId"),
    heroImageId: field(formData, "heroImageId"),
    message: field(formData, "message"),
    storyContent: field(formData, "storyContent"),
    cta: field(formData, "cta"),
    ctaLabel: field(formData, "ctaLabel"),
    status: field(formData, "status") || "DRAFT",
    defaultUtmSource: field(formData, "defaultUtmSource"),
    defaultUtmMedium: field(formData, "defaultUtmMedium"),
    defaultUtmCampaign: field(formData, "defaultUtmCampaign"),
    defaultUtmTerm: field(formData, "defaultUtmTerm"),
    defaultUtmContent: field(formData, "defaultUtmContent"),
  });
}

export async function createLandingPageAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("campaign:write");

  const parsed = readLandingPageForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  const slug = input.slug ?? (await uniqueSlug(input.title, (candidate) => slugTaken(candidate)));

  let createdId: string;
  try {
    const landingPage = await db.landingPage.create({
      data: { ...input, slug },
      select: { id: true },
    });
    createdId = landingPage.id;
  } catch (error) {
    if (uniqueViolationTarget(error) === "slug") {
      return formError("That web address is already in use.", { slug: "Already taken" });
    }
    logger.error("admin.landing_page.create_failed", { userId: user.id, error });
    return formError("The landing page could not be created. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "landing_page.created",
    entityType: "LandingPage",
    entityId: createdId,
    metadata: { title: input.title, status: input.status },
  });

  revalidateLandingPages(slug);
  redirect(`/admin/landing-pages/${createdId}?created=1`);
}

export async function updateLandingPageAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("campaign:write");

  const idResult = idParam.safeParse(formData.get("id"));
  if (!idResult.success) return formError("That landing page could not be identified.");
  const id = idResult.data;

  const parsed = readLandingPageForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);
  const input = parsed.data;

  const existing = await db.landingPage.findUnique({
    where: { id },
    select: { id: true, slug: true, status: true, title: true },
  });
  if (!existing) return formError("That landing page no longer exists.");

  const slug = input.slug ?? existing.slug;

  try {
    await db.landingPage.update({ where: { id }, data: { ...input, slug } });
  } catch (error) {
    if (uniqueViolationTarget(error) === "slug") {
      return formError("That web address is already in use.", { slug: "Already taken" });
    }
    logger.error("admin.landing_page.update_failed", { userId: user.id, error });
    return formError("The changes could not be saved. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "landing_page.updated",
    entityType: "LandingPage",
    entityId: id,
    metadata: { title: input.title },
  });

  if (existing.status !== input.status && (existing.status === "PUBLISHED" || input.status === "PUBLISHED")) {
    await recordAudit({
      userId: user.id,
      action: input.status === "PUBLISHED" ? "landing_page.published" : "landing_page.unpublished",
      entityType: "LandingPage",
      entityId: id,
      metadata: { from: existing.status, to: input.status, title: input.title },
    });
  }

  revalidateLandingPages(slug);
  if (slug !== existing.slug) revalidatePath(`/c/${existing.slug}`);
  revalidatePath(`/admin/landing-pages/${id}`);

  return formSuccess("Saved.");
}

/** List-page quick toggle, mirroring toggleCampaignPublishedAction. */
export async function toggleLandingPagePublishedAction(formData: FormData): Promise<void> {
  const user = await requireMutationPermission("campaign:write");
  const id = idParam.parse(formData.get("id"));

  const landingPage = await db.landingPage.findUnique({
    where: { id },
    select: { id: true, title: true, slug: true, status: true },
  });
  if (!landingPage) return;

  const publishing = landingPage.status !== "PUBLISHED";

  await db.landingPage.update({
    where: { id },
    data: { status: publishing ? "PUBLISHED" : "DRAFT" },
  });

  await recordAudit({
    userId: user.id,
    action: publishing ? "landing_page.published" : "landing_page.unpublished",
    entityType: "LandingPage",
    entityId: id,
    metadata: { title: landingPage.title },
  });

  revalidateLandingPages(landingPage.slug);
  revalidatePath(`/admin/landing-pages/${id}`);
}
