"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  createCollectionAction,
  updateCollectionAction,
} from "@/app/admin/collections/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { COLLECTION_STATUS_LABEL, COLLECTION_STATUS_VALUES } from "@/lib/admin/schemas";
import { Field, FieldRow, CheckboxField, controlClass, textareaClass } from "@/components/admin/field";
import { FormFeedback, SubmitButton, UnsavedChangesGuard } from "@/components/admin/form-controls";
import { AdminSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/admin/slug";

export type CollectionFormValues = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  story: string;
  status: string;
  featured: boolean;
  sortOrder: string;
  seoTitle: string;
  seoDescription: string;
};

/**
 * The range form.
 *
 * Status is a field rather than a separate toggle, unlike products. A range is
 * a container: publishing one exposes only whichever pieces are themselves
 * published, so the decision is less consequential than publishing a product and
 * does not warrant its own step. The audit log still records the transition
 * separately from the edit.
 */
export function CollectionForm({
  values,
  heroField,
  cancelHref,
  publishedProductCount,
}: {
  values: CollectionFormValues;
  /** Rendered by the server so it can load media rows. */
  heroField: React.ReactNode;
  cancelHref: string;
  publishedProductCount?: number;
}) {
  const isEdit = Boolean(values.id);
  const [state, formAction] = useActionState(
    isEdit ? updateCollectionAction : createCollectionAction,
    IDLE_FORM_STATE,
  );

  const [name, setName] = React.useState(values.name);
  const [slug, setSlug] = React.useState(values.slug);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(values.slug));
  const [status, setStatus] = React.useState(values.status);

  // Derived in the handler rather than an effect — see ProductForm for why an
  // existing range never has its slug rewritten underneath it.
  function handleNameChange(value: string) {
    setName(value);
    if (!isEdit && !slugTouched) setSlug(slugify(value));
  }

  const errors = state.errors ?? {};

  // Worth warning about: a range on the public index whose page shows nothing.
  const publishingEmpty =
    status === "PUBLISHED" && publishedProductCount !== undefined && publishedProductCount === 0;

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
              help={<span className="break-all">/collections/{slug || "…"}</span>}
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
            help="A short passage shown on the ranges index and at the top of the range page."
          >
            {(props) => (
              <textarea {...props} maxLength={2000} defaultValue={values.description} className={textareaClass} />
            )}
          </Field>

          <Field name="story" label="Story" error={errors.story} hint="Optional">
            {(props) => (
              <textarea {...props} maxLength={4000} defaultValue={values.story} className={textareaClass} />
            )}
          </Field>

          {heroField}
        </div>
      </AdminSection>

      <AdminSection title="Visibility and order">
        <div className="flex flex-col gap-5">
          <FieldRow>
            <Field
              name="status"
              label="Status"
              error={errors.status}
              help="Draft and archived ranges are invisible to customers."
            >
              {(props) => (
                <select
                  {...props}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className={controlClass}
                >
                  {COLLECTION_STATUS_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {COLLECTION_STATUS_LABEL[value]}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field
              name="sortOrder"
              label="Display order"
              error={errors.sortOrder}
              help="Lower numbers appear first. Featured ranges come before everything else."
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
          </FieldRow>

          <CheckboxField
            name="featured"
            label="Feature this range"
            help="Featured ranges appear on the homepage."
            defaultChecked={values.featured}
          />

          {publishingEmpty ? (
            <p className="text-body-sm border-l-2 border-ochre pl-3 text-muted-foreground">
              This range has no published pieces. Publishing it puts an empty page on the
              site — publish some of its pieces first, or leave the range as a draft.
            </p>
          ) : null}
        </div>
      </AdminSection>

      <AdminSection
        title="Search and sharing"
        description="Optional overrides. Blank falls back to the name and description above."
      >
        <div className="flex flex-col gap-5">
          <Field name="seoTitle" label="Search title" error={errors.seoTitle} hint="Around 60 characters">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={120}
                defaultValue={values.seoTitle}
                placeholder={name}
                className={controlClass}
              />
            )}
          </Field>
          <Field
            name="seoDescription"
            label="Meta description"
            error={errors.seoDescription}
            hint="Around 155 characters"
          >
            {(props) => (
              <textarea
                {...props}
                maxLength={320}
                defaultValue={values.seoDescription}
                className={textareaClass}
              />
            )}
          </Field>
        </div>
      </AdminSection>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
        <SubmitButton>{isEdit ? "Save changes" : "Create range"}</SubmitButton>
        <Button asChild variant="ghost" size="md">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
