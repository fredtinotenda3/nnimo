"use client";

import { useActionState } from "react";
import { attachProductImageAction } from "@/app/admin/products/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { controlClass } from "@/components/admin/field";
import { ConfirmSubmit, FormFeedback, SubmitButton } from "@/components/admin/form-controls";

/**
 * The two gallery controls that genuinely need client state.
 *
 * Everything else in ProductImageManager is a plain form posting to a server
 * action, because reordering and promoting an image need no interactivity beyond
 * the round trip. These two do: attaching reports a validation result inline,
 * and removing needs a confirmation step that a native `confirm()` dialog gets
 * dismissed too readily to provide.
 */
export function AttachImageForm({
  productId,
  options,
}: {
  productId: string;
  options: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState(attachProductImageAction, IDLE_FORM_STATE);

  if (options.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        Every image in the library is already on this piece. Upload another in the media
        library to add more.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <label htmlFor="attach-media" className="text-label text-muted-foreground">
            Image
          </label>
          <select id="attach-media" name="mediaId" className={`${controlClass} mt-2`} defaultValue="">
            <option value="" disabled>
              Choose an image…
            </option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton size="md" variant="outline" pendingLabel="Adding…">
          Add to piece
        </SubmitButton>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

export function RemoveImageButton({ name }: { name: string }) {
  return (
    <ConfirmSubmit
      question={`Remove “${name}” from this piece?`}
      confirmLabel="Remove"
      pendingLabel="Removing…"
      variant="ghost"
    >
      Remove
    </ConfirmSubmit>
  );
}
