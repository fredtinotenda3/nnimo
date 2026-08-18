"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireMutationPermission } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import {
  IDLE_FORM_STATE,
  formError,
  formSuccess,
  type AdminFormState,
} from "@/lib/admin/forms";
import {
  SETTING_GROUPS,
  settingDefinition,
  settingsInGroup,
  validateSettingValue,
  type SettingGroup,
} from "@/lib/admin/settings-registry";

export { IDLE_FORM_STATE };

/**
 * Saving business settings.
 *
 * The registry is an allow-list, and it works in one direction only: a key that
 * is not defined there is ignored, not saved. That is what stops the settings
 * form from becoming a way to write arbitrary rows into a table other code
 * reads — and it is why no credential can ever be set or displayed here.
 * Payment and storage secrets live in the environment and are validated at boot
 * by lib/env.ts; there is no code path from this form to any of them.
 *
 * Saves are per-group, in one transaction. A half-applied group would leave the
 * business in a state nobody chose.
 */
export async function updateSettingsAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await requireMutationPermission("settings:write");

  const rawGroup = formData.get("group");
  const group = SETTING_GROUPS.find((candidate) => candidate === rawGroup) as
    | SettingGroup
    | undefined;
  if (!group) return formError("That group of settings was not recognised.");

  const definitions = settingsInGroup(group);
  const errors: Record<string, string> = {};
  const updates: { key: string; value: string }[] = [];

  for (const definition of definitions) {
    // A checkbox that is unticked is simply absent from the FormData. Reading it
    // as an explicit "false" is what makes turning a setting OFF actually save.
    const raw =
      definition.kind === "boolean"
        ? formData.get(definition.key) === null
          ? "false"
          : "true"
        : String(formData.get(definition.key) ?? "");

    const result = validateSettingValue(definition, raw);
    if (!result.ok) {
      errors[definition.key] = result.error;
      continue;
    }
    updates.push({ key: definition.key, value: result.value });
  }

  if (Object.keys(errors).length > 0) {
    return {
      status: "error",
      message: "Some settings need attention before this group can be saved.",
      errors,
    };
  }

  try {
    await db.$transaction(
      updates.map((update) =>
        db.setting.upsert({
          where: { key: update.key },
          create: { key: update.key, value: update.value, updatedBy: user.id },
          update: { value: update.value, updatedBy: user.id },
        }),
      ),
    );
  } catch (error) {
    logger.error("admin.settings.save_failed", { userId: user.id, group, error });
    return formError("Those settings could not be saved. Please try again.");
  }

  await recordAudit({
    userId: user.id,
    action: "settings.update",
    entityType: "Setting",
    entityId: group,
    // Keys, not values. A settings audit that recorded values would end up
    // holding a copy of every contact detail the business has ever had.
    metadata: { group, keys: updates.map((update) => update.key) },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");

  const unknown = definitions.length !== updates.length;
  return formSuccess(unknown ? "Saved." : `${SETTING_GROUP_NOUN[group]} saved.`);
}

const SETTING_GROUP_NOUN: Record<SettingGroup, string> = {
  business: "Business details",
  commerce: "Commerce settings",
  production: "Production settings",
  delivery: "Delivery settings",
  seo: "Search settings",
  social: "Social links",
};

/** Reads a single setting. Exposed for pages that need one value. */
export async function readSetting(key: string): Promise<string | null> {
  if (!settingDefinition(key)) return null;
  const row = await db.setting.findUnique({ where: { key }, select: { value: true } });
  return row?.value ?? null;
}
