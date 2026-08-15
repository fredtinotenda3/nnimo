"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { AdminFormState } from "@/lib/admin/forms";
import { cn } from "@/lib/utils";

/**
 * Submit button that knows whether its own form is in flight.
 *
 * `useFormStatus` reads the status of the enclosing form rather than a piece of
 * page state, so a page holding several independent forms — the settings page
 * has one per group — shows a spinner on the one that was actually submitted
 * instead of disabling all of them.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

/**
 * The result of the last submit.
 *
 * `role="status"` rather than `role="alert"` for success, so a screen reader
 * announces it politely instead of interrupting; errors do use `alert`, because
 * an error the user does not hear is an error they will repeat.
 */
export function FormFeedback({ state, className }: { state: AdminFormState; className?: string }) {
  if (state.status === "idle" || !state.message) return null;

  const isError = state.status === "error";

  return (
    <p
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "text-body-sm border-l-2 pl-3",
        isError ? "border-destructive text-destructive" : "border-secondary text-secondary",
        className,
      )}
    >
      {state.message}
    </p>
  );
}

/**
 * Warns before leaving a form with unsaved edits.
 *
 * `beforeunload` covers tab closes and hard navigations. Soft navigations
 * through the Next router are not interceptable without owning every link, so
 * this deliberately covers the destructive-and-recoverable case rather than
 * pretending to cover all of them — a half-working guard that people learn to
 * distrust is worse than a narrow one that always fires.
 *
 * Reset on submit: once the action is in flight the edits are no longer unsaved.
 */
export function UnsavedChangesGuard({ enabled = true }: { enabled?: boolean }) {
  const [dirty, setDirty] = React.useState(false);
  const containerRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!enabled) return;
    const form = containerRef.current?.closest("form");
    if (!form) return;

    const markDirty = () => setDirty(true);
    const markClean = () => setDirty(false);

    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("submit", markClean);
    form.addEventListener("reset", markClean);

    return () => {
      form.removeEventListener("input", markDirty);
      form.removeEventListener("change", markDirty);
      form.removeEventListener("submit", markClean);
      form.removeEventListener("reset", markClean);
    };
  }, [enabled]);

  React.useEffect(() => {
    if (!dirty || !enabled) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers ignore custom text now and show their own wording; assigning
      // returnValue is still what triggers the prompt at all.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, enabled]);

  return (
    <span ref={containerRef} aria-hidden="true" className="hidden">
      {dirty ? (
        <span data-unsaved="true" className="sr-only">
          You have unsaved changes.
        </span>
      ) : null}
    </span>
  );
}

/**
 * Submit button for a destructive action, gated by a typed confirmation.
 *
 * A native `confirm()` is dismissed reflexively. Requiring the operator to
 * commit deliberately — two steps, with the consequence named in between — is
 * the difference between deleting an image on purpose and deleting it because
 * the button was where "Save" used to be.
 */
export function ConfirmSubmit({
  children,
  confirmLabel = "Confirm",
  question,
  variant = "destructive",
  size = "sm",
  pendingLabel = "Working…",
}: {
  children: React.ReactNode;
  confirmLabel?: string;
  question: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  pendingLabel?: string;
}) {
  const [armed, setArmed] = React.useState(false);
  const { pending } = useFormStatus();

  React.useEffect(() => {
    if (!armed) return;
    // Disarms itself, so a confirmation left open on a screen someone walked
    // away from is not still live when they come back.
    const timer = window.setTimeout(() => setArmed(false), 8000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <Button type="button" variant={variant} size={size} onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <span role="alert" className="text-metadata text-muted-foreground">
        {question}
      </span>
      <Button type="submit" variant={variant} size={size} disabled={pending}>
        {pending ? pendingLabel : confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size={size} onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
