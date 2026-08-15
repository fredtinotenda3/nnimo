"use client";

import { useActionState } from "react";
import { updateSettingsAction } from "@/app/admin/settings/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { CheckboxField, controlClass, textareaClass } from "@/components/admin/field";
import { FormFeedback, SubmitButton, UnsavedChangesGuard } from "@/components/admin/form-controls";
import { isSettingTrue, type SettingDefinition, type SettingGroup } from "@/lib/admin/settings-registry";

/**
 * One group of settings, saved together.
 *
 * Rendered from the registry rather than hand-written inputs, so adding a
 * setting is a registry entry and nothing else — no new form field, no new
 * validation branch, no risk of a field that renders but never saves.
 */
export function SettingsGroupForm({
  group,
  definitions,
  values,
}: {
  group: SettingGroup;
  definitions: SettingDefinition[];
  values: Record<string, string>;
}) {
  const [state, formAction] = useActionState(updateSettingsAction, IDLE_FORM_STATE);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <UnsavedChangesGuard />
      <input type="hidden" name="group" value={group} />

      {definitions.map((definition) => {
        const id = `setting-${definition.key.replace(/[^a-z0-9]/gi, "-")}`;
        const value = values[definition.key] ?? "";
        const error = errors[definition.key];
        const helpId = `${id}-help`;
        const errorId = error ? `${id}-error` : undefined;
        const describedBy = [helpId, errorId].filter(Boolean).join(" ");

        if (definition.kind === "boolean") {
          return (
            <CheckboxField
              key={definition.key}
              name={definition.key}
              label={definition.label}
              help={definition.help}
              defaultChecked={isSettingTrue(value)}
            />
          );
        }

        return (
          <div key={definition.key} className="flex flex-col gap-2">
            <label htmlFor={id} className="text-label text-foreground">
              {definition.label}
            </label>

            {definition.kind === "textarea" ? (
              <textarea
                id={id}
                name={definition.key}
                defaultValue={value}
                maxLength={definition.maxLength ?? 500}
                placeholder={definition.placeholder}
                aria-describedby={describedBy}
                aria-invalid={error ? true : undefined}
                className={textareaClass}
              />
            ) : (
              <input
                id={id}
                name={definition.key}
                type={
                  definition.kind === "email"
                    ? "email"
                    : definition.kind === "tel"
                      ? "tel"
                      : definition.kind === "url"
                        ? "url"
                        : "text"
                }
                inputMode={definition.kind === "number" ? "numeric" : undefined}
                defaultValue={value}
                maxLength={definition.maxLength ?? 200}
                placeholder={definition.placeholder}
                aria-describedby={describedBy}
                aria-invalid={error ? true : undefined}
                className={`${controlClass} ${definition.kind === "currency" ? "uppercase" : ""}`}
              />
            )}

            <p id={helpId} className="text-metadata text-muted-foreground">
              {definition.help}
            </p>

            {error ? (
              <p
                id={errorId}
                role="alert"
                className="text-metadata border-l-2 border-destructive pl-2.5 text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton size="sm" variant="outline">
          Save
        </SubmitButton>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
