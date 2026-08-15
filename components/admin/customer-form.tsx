"use client";

import { useActionState } from "react";
import { updateCustomerAction } from "@/app/admin/customers/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { Field, FieldRow, CheckboxField, controlClass, textareaClass } from "@/components/admin/field";
import { FormFeedback, SubmitButton, UnsavedChangesGuard } from "@/components/admin/form-controls";

/**
 * Editing a customer record.
 *
 * The email field is rendered read-only and is not submitted — the server
 * schema has no `email` key, so even a crafted POST cannot change it. Showing it
 * disabled rather than hiding it answers "which customer is this" without
 * implying it can be edited.
 */
export function CustomerForm({
  values,
}: {
  values: {
    id: string;
    name: string;
    email: string;
    phone: string;
    marketingConsent: boolean;
    notes: string;
  };
}) {
  const [state, formAction] = useActionState(updateCustomerAction, IDLE_FORM_STATE);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <UnsavedChangesGuard />
      <input type="hidden" name="id" value={values.id} />

      <FieldRow>
        <Field name="name" label="Name" required error={errors.name}>
          {(props) => (
            <input {...props} type="text" maxLength={160} defaultValue={values.name} className={controlClass} />
          )}
        </Field>

        <div className="flex flex-col gap-2">
          <label htmlFor="customer-email" className="text-label text-foreground">
            Email
          </label>
          <input
            id="customer-email"
            type="email"
            value={values.email}
            readOnly
            disabled
            aria-describedby="customer-email-help"
            className={`${controlClass} cursor-not-allowed opacity-70`}
          />
          <p id="customer-email-help" className="text-metadata text-muted-foreground">
            Fixed. It identifies this customer&rsquo;s orders and the links in their emails.
          </p>
        </div>
      </FieldRow>

      <Field name="phone" label="Phone" error={errors.phone} hint="Optional">
        {(props) => (
          <input {...props} type="tel" maxLength={40} defaultValue={values.phone} className={controlClass} />
        )}
      </Field>

      <CheckboxField
        name="marketingConsent"
        label="Has consented to marketing"
        help="Only tick this if the customer actually gave consent. Consent changes are recorded in the audit log."
        defaultChecked={values.marketingConsent}
      />

      <Field
        name="notes"
        label="Internal notes"
        error={errors.notes}
        help="Never shown to the customer."
      >
        {(props) => (
          <textarea {...props} maxLength={4000} defaultValue={values.notes} className={textareaClass} />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton size="sm">Save changes</SubmitButton>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
