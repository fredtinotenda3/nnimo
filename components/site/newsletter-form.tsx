"use client";

import { useActionState } from "react";
import { subscribeToNewsletterAction } from "@/app/(site)/newsletter-actions";
import { NEWSLETTER_IDLE } from "@/lib/marketing/newsletter";

const footerSignup = subscribeToNewsletterAction.bind(null, "footer");

/**
 * Newsletter signup, in the site footer. One field plus a consent checkbox —
 * see lib/marketing/newsletter.ts for why consent is required, not assumed.
 * Styled for the footer's own light `bg-surface-sunken` background, not the
 * dark hero — see components/layout/site-footer.tsx.
 */
export function NewsletterForm() {
  const [state, formAction] = useActionState(footerSignup, NEWSLETTER_IDLE);

  if (state.status === "success") {
    return <p className="text-body-sm text-foreground">{state.message}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="newsletter-email" className="text-label text-muted-foreground">
        Join the studio&apos;s mailing list
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          maxLength={320}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          className="text-button rounded-[var(--radius-sm)] border border-border-strong px-4 py-2 text-foreground transition-colors hover:bg-surface-sunken/50"
        >
          Sign up
        </button>
      </div>
      {/* Honeypot — real people never see or fill this. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="flex items-start gap-2 text-metadata text-muted-foreground">
        <input type="checkbox" name="consent" className="mt-0.5" />
        I&apos;d like to receive occasional emails about new pieces and collections.
      </label>
      {state.status === "error" ? (
        <p role="alert" className="text-metadata text-destructive">
          {state.errors?.consent ?? state.message}
        </p>
      ) : null}
    </form>
  );
}
