"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { createCampaignAction, updateCampaignAction } from "@/app/admin/campaigns/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_VALUES } from "@/lib/admin/schemas";
import { Field, FieldRow, controlClass, textareaClass } from "@/components/admin/field";
import { FormFeedback, SubmitButton, UnsavedChangesGuard } from "@/components/admin/form-controls";
import { AdminSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/admin/slug";

export type CampaignFormValues = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  collectionId: string;
  cta: string;
  ctaLabel: string;
  startDate: string;
  endDate: string;
  status: string;
};

/**
 * The campaign form. Mirrors CollectionForm — see there for why status is a
 * field rather than a separate toggle, and why the slug is never rewritten
 * underneath an existing record.
 */
export function CampaignForm({
  values,
  heroField,
  collections,
  cancelHref,
}: {
  values: CampaignFormValues;
  /** Rendered by the server so it can load media rows. */
  heroField: React.ReactNode;
  collections: { id: string; label: string }[];
  cancelHref: string;
}) {
  const isEdit = Boolean(values.id);
  const [state, formAction] = useActionState(
    isEdit ? updateCampaignAction : createCampaignAction,
    IDLE_FORM_STATE,
  );

  const [name, setName] = React.useState(values.name);
  const [slug, setSlug] = React.useState(values.slug);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(values.slug));
  const [status, setStatus] = React.useState(values.status);

  function handleNameChange(value: string) {
    setName(value);
    if (!isEdit && !slugTouched) setSlug(slugify(value));
  }

  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-12">
      <UnsavedChangesGuard />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <AdminSection title="Details">
        <div className="flex flex-col gap-5">
          <FieldRow>
            <Field name="name" label="Name" required error={errors.name}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  maxLength={160}
                  value={name}
                  onChange={(event) => handleNameChange(event.target.value)}
                  className={controlClass}
                />
              )}
            </Field>

            <Field
              name="slug"
              label="Web address"
              error={errors.slug}
              help={<span className="break-all">/c/{slug || "…"}</span>}
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  maxLength={80}
                  value={slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value);
                  }}
                  className={controlClass}
                />
              )}
            </Field>
          </FieldRow>

          <Field
            name="description"
            label="Description"
            error={errors.description}
            hint="Optional"
            help="Internal-facing summary of what this campaign is for. Not shown on the public site — a landing page's own message is what customers see."
          >
            {(props) => (
              <textarea {...props} maxLength={2000} defaultValue={values.description} className={textareaClass} />
            )}
          </Field>

          {heroField}

          <Field
            name="collectionId"
            label="Range"
            error={errors.collectionId}
            hint="Optional"
            help="Featuring a whole range under this campaign, rather than (or alongside) individual products below."
          >
            {(props) => (
              <select {...props} defaultValue={values.collectionId} className={controlClass}>
                <option value="">Not tied to a range</option>
                {collections.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </AdminSection>

      <AdminSection
        title="Call to action"
        description="Used as the default CTA on any landing page attached to this campaign that doesn't set its own."
      >
        <div className="flex flex-col gap-5">
          <FieldRow>
            <Field
              name="cta"
              label="Link"
              error={errors.cta}
              hint="Optional"
              help="A URL — /shop, /collections/a-range, /products/a-piece, /custom, or an external link."
            >
              {(props) => (
                <input {...props} type="text" maxLength={2000} defaultValue={values.cta} className={controlClass} />
              )}
            </Field>
            <Field name="ctaLabel" label="Button text" error={errors.ctaLabel} hint="Optional">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  maxLength={60}
                  defaultValue={values.ctaLabel}
                  placeholder="Shop the range"
                  className={controlClass}
                />
              )}
            </Field>
          </FieldRow>
        </div>
      </AdminSection>

      <AdminSection title="Dates and status">
        <div className="flex flex-col gap-5">
          <FieldRow>
            <Field name="startDate" label="Start date" error={errors.startDate} hint="Optional">
              {(props) => (
                <input {...props} type="date" defaultValue={values.startDate} className={controlClass} />
              )}
            </Field>
            <Field name="endDate" label="End date" error={errors.endDate} hint="Optional">
              {(props) => <input {...props} type="date" defaultValue={values.endDate} className={controlClass} />}
            </Field>
          </FieldRow>

          <Field
            name="status"
            label="Status"
            error={errors.status}
            help="Active is the only status that counts as published — landing pages attached to a non-active campaign still respect their own status."
          >
            {(props) => (
              <select
                {...props}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className={controlClass}
              >
                {CAMPAIGN_STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {CAMPAIGN_STATUS_LABEL[value]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </AdminSection>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
        <SubmitButton>{isEdit ? "Save changes" : "Create campaign"}</SubmitButton>
        <Button asChild variant="ghost" size="md">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
