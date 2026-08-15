"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createTeamMemberAction,
  updateTeamMemberAction,
} from "@/app/admin/team/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { Field, FieldRow, CheckboxField, controlClass, textareaClass } from "@/components/admin/field";
import { FormFeedback, SubmitButton, UnsavedChangesGuard } from "@/components/admin/form-controls";
import { AdminSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";

export type TeamFormValues = {
  id?: string;
  name: string;
  role: string;
  craft: string;
  bio: string;
  featured: boolean;
  isActive: boolean;
  sortOrder: string;
  sourceNote: string;
};

/**
 * A team member.
 *
 * Role is a free-text input, not a dropdown. The supplied material describes
 * roles as "Potter", "Sculptor", "Moulder", "Kiln, glazing and packing" — a
 * fixed list would force ten real people into categories the business never
 * chose, and it is what makes the Marion Moyo Artist / Production Manager
 * disagreement recordable instead of forcing a resolution nobody has authority
 * to make.
 *
 * The biography field is blank for every imported member and the placeholder
 * says so rather than offering a template. Writing plausible-sounding
 * biographies for real people would be inventing facts about them.
 */
export function TeamForm({
  values,
  photoField,
  cancelHref,
}: {
  values: TeamFormValues;
  photoField: React.ReactNode;
  cancelHref: string;
}) {
  const isEdit = Boolean(values.id);
  const [state, formAction] = useActionState(
    isEdit ? updateTeamMemberAction : createTeamMemberAction,
    IDLE_FORM_STATE,
  );
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-12">
      <UnsavedChangesGuard />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <AdminSection title="Who they are">
        <div className="flex flex-col gap-5">
          <FieldRow>
            <Field name="name" label="Name" required error={errors.name}>
              {(props) => (
                <input {...props} type="text" maxLength={120} defaultValue={values.name} className={controlClass} />
              )}
            </Field>

            <Field
              name="role"
              label="Role"
              required
              error={errors.role}
              help="However the studio describes it — this is not a fixed list."
            >
              {(props) => (
                <input {...props} type="text" maxLength={120} defaultValue={values.role} className={controlClass} />
              )}
            </Field>
          </FieldRow>

          <Field
            name="craft"
            label="Craft"
            error={errors.craft}
            hint="Optional"
            help="e.g. wheel throwing, hand sculpting."
          >
            {(props) => (
              <input {...props} type="text" maxLength={120} defaultValue={values.craft} className={controlClass} />
            )}
          </Field>

          <Field
            name="bio"
            label="Biography"
            error={errors.bio}
            hint="Optional"
            help="Shown on the Nnino family page. Left blank at import — nothing beyond names and roles was stated in the source material."
          >
            {(props) => (
              <textarea
                {...props}
                maxLength={4000}
                defaultValue={values.bio}
                placeholder="Not yet written"
                className={textareaClass}
              />
            )}
          </Field>

          {photoField}
        </div>
      </AdminSection>

      <AdminSection title="Visibility">
        <div className="flex flex-col gap-5">
          <Field
            name="sortOrder"
            label="Display order"
            error={errors.sortOrder}
            help="Lower numbers appear first on the family page."
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="numeric"
                defaultValue={values.sortOrder}
                className={`${controlClass} tabular-nums`}
              />
            )}
          </Field>

          <CheckboxField
            name="isActive"
            label="Show on the public site"
            help="Turning this off removes them from the family page without deleting the record or their link to any pieces they made."
            defaultChecked={values.isActive}
          />

          <CheckboxField
            name="featured"
            label="Feature this person"
            help="Featured members appear first."
            defaultChecked={values.featured}
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Source note"
        description="Internal. Where this person's details came from, and anything the sources disagree about."
      >
        <Field name="sourceNote" label="Note" error={errors.sourceNote} hint="Internal only">
          {(props) => (
            <textarea
              {...props}
              maxLength={500}
              defaultValue={values.sourceNote}
              className={textareaClass}
              placeholder="e.g. Listed as Artist in the catalogue; business card states Production Manager. Unresolved."
            />
          )}
        </Field>
      </AdminSection>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
        <SubmitButton>{isEdit ? "Save changes" : "Add to the team"}</SubmitButton>
        <Button asChild variant="ghost" size="md">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
