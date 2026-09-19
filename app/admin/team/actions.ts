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
import { idParam, teamSchema } from "@/lib/admin/schemas";

/**
 * Team member mutations.
 *
 * The rule that governs this section is that these are ten real people, and the
 * source material states only their names and roles. Every other field —
 * biography, craft, photograph — is nullable and stays null until the studio
 * supplies something real. Nothing here generates, suggests or defaults any of
 * them.
 *
 * `sourceNote` is where a disputed fact is recorded rather than resolved. Marion
 * Moyo appears as "Artist" in the catalogue and as "Production Manager" on her
 * business card; the role field holds whichever the studio decides, and the note
 * records that the sources disagree until somebody who knows says which is right.
 */
function revalidateTeam() {
  revalidatePath("/admin/team");
  revalidatePath("/family");
  revalidatePath("/");
}

function readTeamForm(formData: FormData) {
  return teamSchema.safeParse({
    name: field(formData, "name"),
    role: field(formData, "role"),
    craft: field(formData, "craft"),
    bio: field(formData, "bio"),
    photoId: field(formData, "photoId"),
    featured: formData.get("featured"),
    isActive: formData.get("isActive"),
    sortOrder: field(formData, "sortOrder"),
    sourceNote: field(formData, "sourceNote"),
  });
}

export async function createTeamMemberAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("artist:write");

  const parsed = readTeamForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);

  let createdId: string;
  try {
    const artist = await db.artist.create({ data: parsed.data, select: { id: true } });
    createdId = artist.id;
  } catch (error) {
    logger.error("admin.team.create_failed", { userId: user.id, error });
    return formError("The team member could not be added. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "team.created",
    entityType: "Artist",
    entityId: createdId,
    metadata: { name: parsed.data.name, role: parsed.data.role },
  });

  revalidateTeam();
  redirect(`/admin/team/${createdId}?created=1`);
}

export async function updateTeamMemberAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("artist:write");

  const idResult = idParam.safeParse(formData.get("id"));
  if (!idResult.success) return formError("That team member could not be identified.");
  const id = idResult.data;

  const parsed = readTeamForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);

  const existing = await db.artist.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true },
  });
  if (!existing) return formError("That team member no longer exists.");

  try {
    await db.artist.update({ where: { id }, data: parsed.data });
  } catch (error) {
    // A photo picked from a stale page (e.g. a second tab open since before an
    // upload, or a photo deleted from Media in the meantime) fails here as a
    // foreign-key violation on photoId — not a slug clash like the product/
    // collection forms, so it gets its own check rather than reusing
    // uniqueViolationTarget from lib/admin/slug.ts.
    if (isForeignKeyViolation(error, "photoId")) {
      return formError(
        "That photograph could not be found — it may have been deleted, or this page was open before it was uploaded. Refresh and pick it again.",
        { photoId: "No longer available" },
      );
    }
    logger.error("admin.team.update_failed", { userId: user.id, id, error });
    return formError("The changes could not be saved. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "team.updated",
    entityType: "Artist",
    entityId: id,
    metadata: {
      name: parsed.data.name,
      roleChanged: existing.role !== parsed.data.role,
      visibilityChanged: existing.isActive !== parsed.data.isActive,
    },
  });

  revalidateTeam();
  revalidatePath(`/admin/team/${id}`);
  return formSuccess("Saved.");
}

/**
 * Postgres foreign-key-violation code, as surfaced by Prisma (P2003).
 *
 * `field` narrows to the column this call actually cares about — `meta.field_name`
 * on a Postgres-backed Prisma error is the constraint name (e.g.
 * `Artist_photoId_fkey`), not the bare column, so this checks for the column
 * name appearing in it rather than an exact match.
 */
function isForeignKeyViolation(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  if ((error as { code: unknown }).code !== "P2003") return false;
  const meta = (error as { meta?: { field_name?: unknown } }).meta;
  const fieldName = meta?.field_name;
  return typeof fieldName === "string" && fieldName.toLowerCase().includes(field.toLowerCase());
}
