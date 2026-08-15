"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  deleteMediaAction,
  updateMediaAction,
  uploadMediaAction,
} from "@/app/admin/media/actions";
import { IDLE_FORM_STATE } from "@/lib/admin/forms";
import { ALLOWED_IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/media/types";
import { Field, controlClass } from "@/components/admin/field";
import { ConfirmSubmit, FormFeedback, SubmitButton } from "@/components/admin/form-controls";

const ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(",");
const MAX_MB = MAX_UPLOAD_BYTES / 1024 / 1024;

/**
 * The upload form.
 *
 * `accept` and the client-side size check are courtesies — they save an operator
 * a round trip for an obviously wrong file. Neither is trusted: the server
 * re-checks the size, then reads the actual magic bytes and refuses anything
 * whose contents are not really one of the four accepted image formats,
 * regardless of what the browser declared.
 *
 * Alt text sits on the upload form rather than being deferred, because an image
 * without it is an accessibility gap that nobody comes back to fill in.
 */
export function MediaUploadForm() {
  const [state, formAction] = useActionState(uploadMediaAction, IDLE_FORM_STATE);
  const [clientError, setClientError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  /**
   * Clears the form after a successful upload, so the next one starts blank
   * rather than silently re-submitting the file that just went in.
   *
   * The state reset happens during render via the previous-value comparison
   * React documents for exactly this case — deriving state from a prop change.
   * Only the imperative DOM reset (clearing the native file input, which React
   * does not control) is left in an effect, because that genuinely is
   * synchronising with something outside React.
   */
  const [seenState, setSeenState] = React.useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.status === "success") {
      setFileName(null);
      setClientError(null);
    }
  }

  React.useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  const errors = state.errors ?? {};

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      <Field
        name="file"
        label="Image"
        required
        error={clientError ?? errors.file}
        help={`JPEG, PNG, WebP or AVIF, up to ${MAX_MB} MB.`}
      >
        {(props) => (
          <input
            {...props}
            type="file"
            accept={ACCEPT}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setFileName(file?.name ?? null);
              setClientError(
                file && file.size > MAX_UPLOAD_BYTES
                  ? `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_MB} MB.`
                  : null,
              );
            }}
            className="text-body-sm w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 file:mr-4 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-foreground"
          />
        )}
      </Field>

      <Field
        name="altText"
        label="Alt text"
        error={errors.altText}
        help="Describe what the photograph shows, for people using a screen reader. One short sentence."
      >
        {(props) => (
          <input
            {...props}
            type="text"
            maxLength={200}
            placeholder={fileName ? `Describe ${fileName}` : "e.g. Giraffe tureen seen from the front"}
            className={controlClass}
          />
        )}
      </Field>

      <Field
        name="sourceNote"
        label="Source note"
        error={errors.sourceNote}
        hint="Internal only"
        help="Where the image came from, e.g. a catalogue page or a photographer's name."
      >
        {(props) => <input {...props} type="text" maxLength={300} className={controlClass} />}
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel="Uploading…" disabled={Boolean(clientError)}>
          Upload
        </SubmitButton>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}

/** Editing alt text and provenance on an image already in the library. */
export function MediaMetadataForm({
  id,
  altText,
  sourceNote,
}: {
  id: string;
  altText: string;
  sourceNote: string;
}) {
  const [state, formAction] = useActionState(updateMediaAction, IDLE_FORM_STATE);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />

      <div>
        <label htmlFor={`alt-${id}`} className="text-label text-muted-foreground">
          Alt text
        </label>
        <input
          id={`alt-${id}`}
          name="altText"
          type="text"
          maxLength={200}
          defaultValue={altText}
          aria-invalid={errors.altText ? true : undefined}
          placeholder="Not described yet"
          className={`${controlClass} mt-1.5`}
        />
      </div>

      <div>
        <label htmlFor={`source-${id}`} className="text-label text-muted-foreground">
          Source note
        </label>
        <input
          id={`source-${id}`}
          name="sourceNote"
          type="text"
          maxLength={300}
          defaultValue={sourceNote}
          className={`${controlClass} mt-1.5`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="sm" variant="outline">
          Save
        </SubmitButton>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}

/**
 * Deleting an image.
 *
 * The server refuses while the image is still referenced anywhere, so this is
 * only ever reachable for genuinely unused files — but it still confirms,
 * because the object itself is not recoverable afterwards.
 */
export function MediaDeleteForm({ id, label }: { id: string; label: string }) {
  const [state, formAction] = useActionState(deleteMediaAction, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <ConfirmSubmit
        question={`Permanently delete “${label}”?`}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
      >
        Delete
      </ConfirmSubmit>
      <FormFeedback state={state} />
    </form>
  );
}
