import { z } from "zod";

/**
 * Newsletter signup validation.
 *
 * Same shape and reasoning as lib/inquiries.ts: this is a public,
 * unauthenticated write path, so everything is trimmed and capped here, not
 * trusted from the client. Deliberately not `server-only` — the footer form
 * component imports `NewsletterFormState` for `useActionState`.
 */

export const newsletterSignupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320),
  // Consent must be explicitly ticked — an email address alone is not
  // permission to send marketing mail. `checkbox`-style coercion, matching
  // lib/admin/forms.ts: present and "on" is the only way this becomes true.
  consent: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => value === "on" || value === "true" || value === "1")
    .refine((value) => value === true, {
      message: "Please tick the box to confirm you'd like to receive emails from the studio",
    }),
  // Honeypot, same convention as commissionSchema/contactSchema.
  website: z.string().max(0).optional().or(z.literal("")),
});

export type NewsletterSignupInput = z.infer<typeof newsletterSignupSchema>;

export type NewsletterFormState = {
  status: "idle" | "error" | "success";
  message: string | null;
  errors?: Record<string, string>;
};

export const NEWSLETTER_IDLE: NewsletterFormState = { status: "idle", message: null };

export function newsletterFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
