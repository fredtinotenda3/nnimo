"use client";

import { useActionState } from "react";
import { updateBannerAction } from "@/app/admin/content/banner-actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { Field, FieldRow, CheckboxField, controlClass } from "@/components/admin/field";
import { FormFeedback, SubmitButton } from "@/components/admin/form-controls";
import type { BannerValue } from "@/lib/admin/schemas";

/**
 * The site-wide promotional banner. One form, since it is one ContentBlock
 * (see lib/marketing/banner.ts) — unlike the rest of /admin/content, which is
 * many small independent block forms.
 */
export function BannerForm({
  value,
  heroField,
}: {
  value: BannerValue;
  /** Rendered by the server so it can load media rows, same pattern as CampaignForm's heroField. */
  heroField: React.ReactNode;
}) {
  const [state, formAction] = useActionState(updateBannerAction, IDLE_FORM_STATE);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <CheckboxField
        name="enabled"
        label="Show this banner on the public site"
        help="Has no effect until there is text below — an enabled banner with no text stays off."
        defaultChecked={value.enabled}
      />

      <Field
        name="text"
        label="Banner text"
        required
        error={errors.text}
        help="Shown across the top of every public page."
      >
        {(props) => (
          <input {...props} type="text" maxLength={200} defaultValue={value.text} className={controlClass} />
        )}
      </Field>

      <FieldRow>
        <Field name="linkUrl" label="Link" error={errors.linkUrl} hint="Optional">
          {(props) => (
            <input
              {...props}
              type="text"
              maxLength={2000}
              defaultValue={value.linkUrl ?? ""}
              placeholder="/shop"
              className={controlClass}
            />
          )}
        </Field>
        <Field name="linkLabel" label="Link text" error={errors.linkLabel} hint="Optional">
          {(props) => (
            <input
              {...props}
              type="text"
              maxLength={40}
              defaultValue={value.linkLabel ?? ""}
              placeholder="Shop now"
              className={controlClass}
            />
          )}
        </Field>
      </FieldRow>

      {heroField}

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <SubmitButton>Save banner</SubmitButton>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
