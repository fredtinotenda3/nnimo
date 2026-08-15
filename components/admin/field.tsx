import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A labelled form control with its help text and error message wired up.
 *
 * The accessibility work is the point. WCAG 3.3.1 wants an error identified in
 * text and associated with its field, and 1.3.1 wants the label programmatically
 * linked — which means `htmlFor`, `aria-describedby` naming both the help and
 * error nodes, `aria-invalid`, and `role="alert"` so a screen reader announces
 * the failure without the user hunting for it. Doing that by hand on ~60 inputs
 * guarantees some of them are wrong, so it is done once here.
 *
 * A server component: it renders markup and passes ids down. The inputs
 * themselves are plain HTML, so every admin form submits and validates without
 * JavaScript.
 */
export function Field({
  name,
  label,
  help,
  error,
  required,
  children,
  className,
  hint,
}: {
  name: string;
  label: string;
  help?: React.ReactNode;
  error?: string;
  required?: boolean;
  /** Receives the ids to attach. */
  children: (props: {
    id: string;
    name: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    required: boolean | undefined;
  }) => React.ReactNode;
  className?: string;
  /** Right-aligned note beside the label, e.g. "Optional" or a character budget. */
  hint?: string;
}) {
  const id = `field-${name}`;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-label text-foreground">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-1 text-primary">
              *
            </span>
          ) : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </label>
        {hint ? <span className="text-metadata text-muted-foreground">{hint}</span> : null}
      </div>

      {children({
        id,
        name,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required: required || undefined,
      })}

      {help ? (
        <p id={helpId} className="text-metadata text-muted-foreground">
          {help}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-metadata border-l-2 border-destructive pl-2.5 text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Shared input classes, matching components/ui/input.tsx. */
export const controlClass =
  "text-body-sm h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary aria-[invalid=true]:border-destructive";

export const textareaClass =
  "text-body-sm min-h-28 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary aria-[invalid=true]:border-destructive";

/** A row of fields that collapses to one column on narrow screens. */
export function FieldRow({
  children,
  columns = 2,
}: {
  children: React.ReactNode;
  columns?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-5",
        columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
      )}
    >
      {children}
    </div>
  );
}

/** A checkbox with its label, laid out for scanning down a column. */
export function CheckboxField({
  name,
  label,
  help,
  defaultChecked,
}: {
  name: string;
  label: string;
  help?: string;
  defaultChecked?: boolean;
}) {
  const id = `field-${name}`;
  const helpId = help ? `${id}-help` : undefined;

  return (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        id={id}
        name={name}
        defaultChecked={defaultChecked}
        aria-describedby={helpId}
        className="mt-0.5 h-4 w-4 shrink-0 rounded-[var(--radius-sm)] border-border-strong text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-body-sm cursor-pointer text-foreground">
          {label}
        </label>
        {help ? (
          <p id={helpId} className="text-metadata mt-1 text-muted-foreground">
            {help}
          </p>
        ) : null}
      </div>
    </div>
  );
}
