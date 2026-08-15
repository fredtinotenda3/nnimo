"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import {
  IDLE_FORM_STATE,
  field,
  formError,
  formSuccess,
  validationFailed,
  type AdminFormState,
} from "@/lib/admin/forms";
import { idParam, teamSchema } from "@/lib/admin/schemas";

export { IDLE_FORM_STATE };

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
  const user = await requirePermission("artist:write");

  const parsed = readTeamForm(formData);
  if (!parsed.success) return validationFailed(parsed.error);

  let createdId: string;
  try {
    const artist = await db.artist.create({ data: parsed.data, select: { id: true } });
    createdId = artist.id;
  } catch (error) {
    console.error("[admin/team] create failed", error);
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
  const user = await requirePermission("artist:write");

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

  await db.artist.update({ where: { id }, data: parsed.data });

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
