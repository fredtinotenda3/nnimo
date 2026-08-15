"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  createProductAction,
  updateProductAction,
} from "@/app/admin/products/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { Field, FieldRow, CheckboxField, controlClass, textareaClass } from "@/components/admin/field";
import { FormFeedback, SubmitButton, UnsavedChangesGuard } from "@/components/admin/form-controls";
import { AdminSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { PRODUCT_AVAILABILITY_VALUES } from "@/lib/admin/schemas";
import { AVAILABILITY_LABEL } from "@/lib/catalogue-labels";
import { slugify } from "@/lib/admin/slug";

export type ProductFormValues = {
  id?: string;
  name: string;
  slug: string;
  sku: string;
  collectionId: string;
  categoryId: string;
  artistId: string;
  description: string;
  story: string;
  material: string;
  careInstructions: string;
  heightCm: string;
  widthCm: string;
  weightKg: string;
  price: string;
  currency: string;
  availability: string;
  productionLeadTimeDays: string;
  featured: boolean;
  sourceNote: string;
};

export type Option = { id: string; label: string };

/**
 * The product form.
 *
 * One form covering details, pricing and measurement, submitting once. The
 * alternative — a form per section — means an operator entering a new piece
 * saves four times and can leave it half-entered between saves.
 *
 * Images, SEO and publishing are genuinely separate concerns with separate
 * actions, and they live outside this component: an image is attached
 * immediately rather than on save, and publishing is a decision, not an edit.
 *
 * The slug helper runs on the client for convenience only. The server derives
 * its own slug when the field arrives empty and validates the format when it
 * does not, so a client with JavaScript off produces the same result.
 */
export function ProductForm({
  values,
  collections,
  categories,
  artists,
  defaultCurrency,
  cancelHref,
}: {
  values: ProductFormValues;
  collections: Option[];
  categories: Option[];
  artists: Option[];
  defaultCurrency: string;
  cancelHref: string;
}) {
  const isEdit = Boolean(values.id);
  const [state, formAction] = useActionState(
    isEdit ? updateProductAction : createProductAction,
    IDLE_FORM_STATE,
  );

  const [name, setName] = React.useState(values.name);
  const [slug, setSlug] = React.useState(values.slug);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(values.slug));

  /**
   * Mirrors the name into the slug as it is typed — in the event handler, not an
   * effect, because the slug is a consequence of the keystroke rather than a
   * synchronisation with anything outside React.
   *
   * Only while creating, and only until the operator edits the slug themselves.
   * Never on an existing piece: a published slug is a live URL, and silently
   * rewriting it while someone fixes a typo in the name would break every link
   * to that page.
   */
  function handleNameChange(value: string) {
    setName(value);
    if (!isEdit && !slugTouched) setSlug(slugify(value));
  }

  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-12">
      <UnsavedChangesGuard />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <AdminSection
        title="Details"
        description="Name and web address are required. Everything else may be left blank until the studio confirms it."
      >
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
              help={<span className="break-all">/products/{slug || "…"}</span>}
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

          <FieldRow columns={3}>
            <Field name="sku" label="SKU or reference" error={errors.sku} hint="Optional">
              {(props) => <input {...props} type="text" maxLength={60} defaultValue={values.sku} className={controlClass} />}
            </Field>

            <Field name="collectionId" label="Range" error={errors.collectionId}>
              {(props) => (
                <select {...props} defaultValue={values.collectionId} className={controlClass}>
                  <option value="">Not in a range</option>
                  {collections.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field name="artistId" label="Made by" error={errors.artistId}>
              {(props) => (
                <select {...props} defaultValue={values.artistId} className={controlClass}>
                  <option value="">Not recorded</option>
                  {artists.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </FieldRow>

          <FieldRow>
            <Field name="categoryId" label="Category" error={errors.categoryId}>
              {(props) => (
                <select {...props} defaultValue={values.categoryId} className={controlClass}>
                  <option value="">None</option>
                  {categories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field name="material" label="Material" error={errors.material} hint="Optional">
              {(props) => (
                <input {...props} type="text" maxLength={200} defaultValue={values.material} className={controlClass} />
              )}
            </Field>
          </FieldRow>

          <Field
            name="description"
            label="Description"
            error={errors.description}
            help="Shown on the product page and used as the search description when no SEO override is set."
          >
            {(props) => (
              <textarea {...props} maxLength={4000} defaultValue={values.description} className={textareaClass} />
            )}
          </Field>

          <Field
            name="story"
            label="Story"
            error={errors.story}
            help="Optional longer passage about the piece."
          >
            {(props) => <textarea {...props} maxLength={4000} defaultValue={values.story} className={textareaClass} />}
          </Field>

          <Field name="careInstructions" label="Care instructions" error={errors.careInstructions} hint="Optional">
            {(props) => (
              <textarea
                {...props}
                maxLength={2000}
                defaultValue={values.careInstructions}
                className={textareaClass}
              />
            )}
          </Field>
        </div>
      </AdminSection>

      <AdminSection
        title="Price and availability"
        description="A piece with no price stays browsable but cannot be bought, whatever its availability says. Leave the price blank until the studio has confirmed it."
      >
        <div className="flex flex-col gap-5">
          <FieldRow columns={3}>
            <Field
              name="price"
              label="Price"
              error={errors.price}
              help="Blank means “not set”, which is not the same as free."
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  placeholder="Not set"
                  defaultValue={values.price}
                  className={`${controlClass} tabular-nums`}
                />
              )}
            </Field>

            <Field name="currency" label="Currency" error={errors.currency}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  maxLength={3}
                  defaultValue={values.currency || defaultCurrency}
                  className={`${controlClass} uppercase`}
                />
              )}
            </Field>

            <Field
              name="availability"
              label="Availability"
              error={errors.availability}
              help="Set automatically to made-to-order when a piece is published without one."
            >
              {(props) => (
                <select {...props} defaultValue={values.availability} className={controlClass}>
                  <option value="">Not set</option>
                  {PRODUCT_AVAILABILITY_VALUES.map((option) => (
                    <option key={option} value={option}>
                      {AVAILABILITY_LABEL[option]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </FieldRow>

          <FieldRow>
            <Field
              name="productionLeadTimeDays"
              label="Lead time (days)"
              error={errors.productionLeadTimeDays}
              help="Overrides the studio default for this piece only."
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="numeric"
                  placeholder="Use the studio default"
                  defaultValue={values.productionLeadTimeDays}
                  className={`${controlClass} tabular-nums`}
                />
              )}
            </Field>

            <div className="flex items-end pb-2">
              <CheckboxField
                name="featured"
                label="Feature this piece"
                help="Featured pieces appear first on the homepage and in their range."
                defaultChecked={values.featured}
              />
            </div>
          </FieldRow>
        </div>
      </AdminSection>

      <AdminSection title="Measurements" description="As measured by the studio. Leave blank where unknown.">
        <FieldRow columns={3}>
          <Field name="heightCm" label="Height (cm)" error={errors.heightCm} hint="Optional">
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                defaultValue={values.heightCm}
                className={`${controlClass} tabular-nums`}
              />
            )}
          </Field>
          <Field name="widthCm" label="Width (cm)" error={errors.widthCm} hint="Optional">
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                defaultValue={values.widthCm}
                className={`${controlClass} tabular-nums`}
              />
            )}
          </Field>
          <Field name="weightKg" label="Weight (kg)" error={errors.weightKg} hint="Optional">
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                defaultValue={values.weightKg}
                className={`${controlClass} tabular-nums`}
              />
            )}
          </Field>
        </FieldRow>
      </AdminSection>

      <AdminSection
        title="Provenance"
        description="Where this record's information came from, and anything still unconfirmed."
      >
        <Field name="sourceNote" label="Source note" error={errors.sourceNote} hint="Internal only">
          {(props) => (
            <textarea
              {...props}
              maxLength={500}
              defaultValue={values.sourceNote}
              className={textareaClass}
              placeholder="e.g. Nnino Ceramics Brochure-1.pdf, Zebra Range"
            />
          )}
        </Field>
      </AdminSection>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
        <SubmitButton>{isEdit ? "Save changes" : "Create piece"}</SubmitButton>
        <Button asChild variant="ghost" size="md">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
