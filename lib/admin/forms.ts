import { z } from "zod";

/**
 * One form-state contract for every admin mutation.
 *
 * Deliberately NOT `server-only`: client components import the type and the
 * initial value so `useActionState` is typed on both sides of the boundary.
 * Nothing here touches the database or reads a secret.
 *
 * The shape matches lib/inquiries.ts (the Phase 2 public forms) rather than
 * inventing a second one — same `status`/`message`/`errors` triple, so a
 * developer who has read one form has read them all.
 */
export type AdminFormState = {
  status: "idle" | "error" | "success";
  message: string | null;
  /** Field-level messages, keyed by input `name`. */
  errors?: Record<string, string>;
};

export const IDLE_FORM_STATE: AdminFormState = { status: "idle", message: null };

export function formError(message: string, errors?: Record<string, string>): AdminFormState {
  return { status: "error", message, errors };
}

export function formSuccess(message: string): AdminFormState {
  return { status: "success", message, errors: {} };
}

/** First message per field, so an input shows one error rather than a list. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function validationFailed(error: z.ZodError): AdminFormState {
  return formError("Some fields need attention before this can be saved.", toFieldErrors(error));
}

// ---------------------------------------------------------------------------
// Field coercions
//
// HTML forms only ever submit strings, and an empty text input submits "" — not
// null. Left unconverted, "" is written into the database as an empty string,
// and the whole "we do not invent business data" rule quietly collapses: a
// biography nobody wrote stops being NULL and starts being "". Every optional
// field goes through `optionalText` for that reason.
// ---------------------------------------------------------------------------

/** Trimmed text, or null when blank. Never an empty string. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

export const requiredText = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be under ${max} characters`);

/**
 * A decimal money value, or null when the field is left blank.
 *
 * Blank must stay null: for Nnino, a null price is a real and common state
 * ("the studio has not set one yet") and it is what keeps a piece
 * non-purchasable. Coercing blank to 0 would make unpriced pieces free.
 *
 * Rejects more than two decimal places rather than rounding — the database
 * column is NUMERIC(10,2) and silently dropping a digit means the admin and the
 * customer see different prices.
 */
export const optionalDecimal = (opts: { max: number; label: string }) =>
  z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null)
    .refine(
      (value) => value === null || /^\d+(\.\d{1,2})?$/.test(value),
      `${opts.label} must be a number with at most two decimal places`,
    )
    .refine(
      (value) => value === null || Number(value) <= opts.max,
      `${opts.label} looks too large — the limit is ${opts.max}`,
    );

/** A non-negative integer, or null when blank. */
export const optionalInt = (opts: { max: number; label: string; min?: number }) =>
  z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null)
    .refine((value) => value === null || /^\d+$/.test(value), `${opts.label} must be a whole number`)
    .transform((value) => (value === null ? null : Number.parseInt(value, 10)))
    .refine(
      (value) => value === null || (value >= (opts.min ?? 0) && value <= opts.max),
      `${opts.label} must be between ${opts.min ?? 0} and ${opts.max}`,
    );

/** An integer with a default, for sort order and similar always-present fields. */
export const intWithDefault = (fallback: number, opts: { min: number; max: number; label: string }) =>
  z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? String(fallback) : value))
    .refine((value) => /^-?\d+$/.test(value), `${opts.label} must be a whole number`)
    .transform((value) => Number.parseInt(value, 10))
    .refine(
      (value) => value >= opts.min && value <= opts.max,
      `${opts.label} must be between ${opts.min} and ${opts.max}`,
    );

/**
 * An HTML checkbox submits its value only when ticked, and is simply absent
 * otherwise — there is no "false". Anything present counts as true.
 */
export const checkbox = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => value === "on" || value === "true" || value === "1");

/** Currency code. Three letters, upper-cased. */
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code, such as USD");

/** Reads a FormData value as a string, so zod always receives the right type. */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
