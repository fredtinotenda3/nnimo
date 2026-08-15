"use client";

import { useActionState } from "react";
import { updateContentBlockAction } from "@/app/admin/content/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { controlClass, textareaClass } from "@/components/admin/field";
import { FormFeedback, SubmitButton } from "@/components/admin/form-controls";
import { Badge } from "@/components/ui/badge";

/**
 * One editable block of site copy.
 *
 * One form per block rather than one giant form per page: `useFormStatus` then
 * reports on the block actually being saved, and an operator fixing a typo in
 * the footer does not re-submit fourteen other fields they never looked at.
 *
 * There is no rich-text editor. A textarea is honest about what is stored — the
 * site renders these as paragraphs — and a WYSIWYG that produces HTML would need
 * sanitising on the way out, which is a whole security surface bought for
 * italics nobody asked for.
 */
export function ContentBlockForm({
  blockKey,
  label,
  where,
  type,
  value,
  guidance,
  needsReview,
  updatedAt,
  mediaField,
}: {
  blockKey: string;
  label: string;
  where: string;
  type: "TEXT" | "RICH_TEXT" | "IMAGE" | "JSON";
  value: string;
  guidance?: string;
  needsReview?: boolean;
  updatedAt: Date | null;
  /** Media picker, rendered by the server for IMAGE blocks. */
  mediaField?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(updateContentBlockAction, IDLE_FORM_STATE);
  const errors = state.errors ?? {};
  const fieldId = `content-${blockKey.replace(/[^a-z0-9]/gi, "-")}`;
  const isEmpty = value.trim().length === 0;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-border bg-surface p-5"
    >
      <input type="hidden" name="key" value={blockKey} />
      <input type="hidden" name="type" value={type} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={fieldId} className="text-heading-3 block">
            {label}
          </label>
          <p className="text-metadata mt-1.5 text-muted-foreground">{where}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isEmpty ? <Badge variant="neutral">Not written</Badge> : null}
          {needsReview ? <Badge variant="accent">Needs legal review</Badge> : null}
        </div>
      </div>

      {guidance ? <p className="text-metadata text-muted-foreground">{guidance}</p> : null}

      {type === "IMAGE" ? (
        mediaField
      ) : type === "TEXT" ? (
        <input
          id={fieldId}
          name="value"
          type="text"
          maxLength={500}
          defaultValue={value}
          aria-invalid={errors.value ? true : undefined}
          placeholder="Not written yet"
          className={controlClass}
        />
      ) : (
        <textarea
          id={fieldId}
          name="value"
          maxLength={20000}
          defaultValue={value}
          aria-invalid={errors.value ? true : undefined}
          placeholder="Not written yet"
          className={`${textareaClass} min-h-36`}
        />
      )}

      {errors.value ? (
        <p role="alert" className="text-metadata border-l-2 border-destructive pl-2.5 text-destructive">
          {errors.value}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton size="sm" variant="outline">
          Save
        </SubmitButton>
        {updatedAt ? (
          <span className="text-metadata text-muted-foreground">
            Last changed {updatedAt.toISOString().slice(0, 10)}
          </span>
        ) : null}
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
