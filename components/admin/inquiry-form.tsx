"use client";

import { useActionState } from "react";
import { updateInquiryAction } from "@/app/admin/inquiries/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { INQUIRY_STATUS_LABEL, INQUIRY_STATUS_VALUES } from "@/lib/admin/schemas";
import { Field, FieldRow, controlClass, textareaClass } from "@/components/admin/field";
import { FormFeedback, SubmitButton, UnsavedChangesGuard } from "@/components/admin/form-controls";

/**
 * Working an enquiry.
 *
 * Status, quote and internal notes save together, because in practice they
 * change together: quoting a job means writing the number and moving the status
 * in the same moment.
 */
export function InquiryForm({
  values,
}: {
  values: { id: string; status: string; quote: string; internalNotes: string; currency: string };
}) {
  const [state, formAction] = useActionState(updateInquiryAction, IDLE_FORM_STATE);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <UnsavedChangesGuard />
      <input type="hidden" name="id" value={values.id} />

      <FieldRow>
        <Field name="status" label="Status" error={errors.status}>
          {(props) => (
            <select {...props} defaultValue={values.status} className={controlClass}>
              {INQUIRY_STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {INQUIRY_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          name="quote"
          label={`Quote (${values.currency})`}
          error={errors.quote}
          help="Blank until the studio has priced the work. Never shown to the customer automatically."
        >
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              placeholder="Not quoted"
              defaultValue={values.quote}
              className={`${controlClass} tabular-nums`}
            />
          )}
        </Field>
      </FieldRow>

      <Field
        name="internalNotes"
        label="Internal notes"
        error={errors.internalNotes}
        help="Never shown to the customer."
      >
        {(props) => (
          <textarea
            {...props}
            maxLength={5000}
            defaultValue={values.internalNotes}
            className={textareaClass}
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton size="sm">Save</SubmitButton>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
