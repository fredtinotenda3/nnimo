"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { createLandingPageAction, updateLandingPageAction } from "@/app/admin/landing-pages/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { LANDING_PAGE_STATUS_LABEL, LANDING_PAGE_STATUS_VALUES } from "@/lib/admin/schemas";
import { Field, FieldRow, controlClass, textareaClass } from "@/components/admin/field";
import { FormFeedback, SubmitButton, UnsavedChangesGuard } from "@/components/admin/form-controls";
import { AdminSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/admin/slug";

export type LandingPageFormValues = {
  id?: string;
  title: string;
  slug: string;
  campaignId: string;
  message: string;
  storyContent: string;
  cta: string;
  ctaLabel: string;
  status: string;
  defaultUtmSource: string;
  defaultUtmMedium: string;
  defaultUtmCampaign: string;
  defaultUtmTerm: string;
  defaultUtmContent: string;
};

/**
 * The landing page form. Mirrors CampaignForm — see there for the shared
 * reasoning. The one thing worth calling out here specifically: `status`
 * gates public visibility DIRECTLY (draft/archived pages 404 for a visitor —
 * see app/(site)/c/[slug]/page.tsx), unlike a campaign's status, which is
 * more of a business-lifecycle label. The help text below says so plainly.
 */
export function LandingPageForm({
  values,
  heroField,
  campaigns,
  cancelHref,
}: {
  values: LandingPageFormValues;
  /** Rendered by the server so it can load media rows. */
  heroField: React.ReactNode;
  campaigns: { id: string; label: string }[];
  cancelHref: string;
}) {
  const isEdit = Boolean(values.id);
  const [state, formAction] = useActionState(
    isEdit ? updateLandingPageAction : createLandingPageAction,
    IDLE_FORM_STATE,
  );

  const [title, setTitle] = React.useState(values.title);
  const [slug, setSlug] = React.useState(values.slug);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(values.slug));
  const [status, setStatus] = React.useState(values.status);

  function handleTitleChange(value: string) {
    setTitle(value);
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
            <Field name="title" label="Title" required error={errors.title}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  maxLength={160}
                  value={title}
                  onChange={(event) => handleTitleChange(event.target.value)}
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
            name="campaignId"
            label="Campaign"
            error={errors.campaignId}
            hint="Optional"
            help="Links this page to a campaign for performance reporting. A landing page can also stand alone."
          >
            {(props) => (
              <select {...props} defaultValue={values.campaignId} className={controlClass}>
                <option value="">No campaign</option>
                {campaigns.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {heroField}

          <Field
            name="message"
            label="Message"
            error={errors.message}
            hint="Optional, around 320 characters"
            help="The headline/intro shown at the top of the page."
          >
            {(props) => <textarea {...props} maxLength={320} defaultValue={values.message} className={textareaClass} />}
          </Field>

          <Field name="storyContent" label="Story" error={errors.storyContent} hint="Optional">
            {(props) => (
              <textarea {...props} maxLength={8000} defaultValue={values.storyContent} className={textareaClass} />
            )}
          </Field>
        </div>
      </AdminSection>

      <AdminSection
        title="Call to action"
        description="Falls back to the linked campaign's own CTA when left blank here."
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

      <AdminSection
        title="Default UTM values"
        description="Applied when a visitor reaches this page with no utm_* parameters of their own — useful for a QR code or a direct link where the source can't add a query string itself."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="defaultUtmSource" label="Default utm_source" error={errors.defaultUtmSource} hint="Optional">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={150}
                defaultValue={values.defaultUtmSource}
                placeholder="instagram"
                className={controlClass}
              />
            )}
          </Field>
          <Field name="defaultUtmMedium" label="Default utm_medium" error={errors.defaultUtmMedium} hint="Optional">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={150}
                defaultValue={values.defaultUtmMedium}
                placeholder="bio-link"
                className={controlClass}
              />
            )}
          </Field>
          <Field
            name="defaultUtmCampaign"
            label="Default utm_campaign"
            error={errors.defaultUtmCampaign}
            hint="Optional"
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={150}
                defaultValue={values.defaultUtmCampaign}
                className={controlClass}
              />
            )}
          </Field>
          <Field name="defaultUtmTerm" label="Default utm_term" error={errors.defaultUtmTerm} hint="Optional">
            {(props) => (
              <input {...props} type="text" maxLength={150} defaultValue={values.defaultUtmTerm} className={controlClass} />
            )}
          </Field>
          <Field
            name="defaultUtmContent"
            label="Default utm_content"
            error={errors.defaultUtmContent}
            hint="Optional"
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={150}
                defaultValue={values.defaultUtmContent}
                className={controlClass}
              />
            )}
          </Field>
        </div>
      </AdminSection>

      <AdminSection title="Status">
        <Field
          name="status"
          label="Status"
          error={errors.status}
          help="Only Published pages are visible to the public. Draft and archived pages return a not-found page, even to someone with the direct link."
        >
          {(props) => (
            <select
              {...props}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={controlClass}
            >
              {LANDING_PAGE_STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {LANDING_PAGE_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </AdminSection>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
        <SubmitButton>{isEdit ? "Save changes" : "Create landing page"}</SubmitButton>
        <Button asChild variant="ghost" size="md">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
