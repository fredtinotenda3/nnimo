import { z } from "zod";

/**
 * Validation and option lists for the two public forms.
 *
 * Deliberately NOT `server-only`: the client forms import REQUEST_TYPES and the
 * form-state shape from here. Anything that must stay on the server (the
 * submission throttle) lives in lib/rate-limit.ts instead.
 *
 * Public write endpoints are the only unauthenticated way into the database, so
 * everything is length-capped and trimmed here rather than trusted from the
 * client. `CustomOrderInquiry.requestType` is free text in the schema, which is
 * why a general contact message can share the table instead of needing a new
 * model and a migration.
 */
export const REQUEST_TYPES = [
  "Custom sculpture",
  "Custom ceramics",
  "Corporate or branded pieces",
  "Event pieces",
  "Dinner service",
  "Bulk or wholesale order",
  "Something else",
] as const;

export const CONTACT_REQUEST_TYPE = "General enquiry";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

export const commissionSchema = z.object({
  customerName: z.string().trim().min(2, "Please give your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320),
  phone: optionalText(40),
  organisation: optionalText(160),
  requestType: z.enum(REQUEST_TYPES),
  quantity: z
    .string()
    .trim()
    .max(6)
    .transform((value) => {
      if (!value) return null;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    })
    .nullable()
    .optional(),
  desiredDate: z
    .string()
    .trim()
    .max(10)
    .transform((value) => {
      if (!value) return null;
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .nullable()
    .optional(),
  budget: optionalText(120),
  description: z
    .string()
    .trim()
    .min(20, "Please describe what you have in mind, in a sentence or two")
    .max(4000),
  // Honeypot. Real people leave it empty; naive bots fill every field.
  website: z.string().max(0).optional().or(z.literal("")),
});

export const contactSchema = z.object({
  customerName: z.string().trim().min(2, "Please give your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320),
  phone: optionalText(40),
  description: z
    .string()
    .trim()
    .min(10, "Please write a short message")
    .max(4000),
  website: z.string().max(0).optional().or(z.literal("")),
});

export type FormState = {
  status: "idle" | "error" | "success";
  message: string | null;
  /** Field-level messages, keyed by input name. */
  errors?: Record<string, string>;
};

export const IDLE_STATE: FormState = { status: "idle", message: null };

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
