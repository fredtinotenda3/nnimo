import { z } from "zod";

/**
 * The catalogue of business settings the team may edit.
 *
 * `Setting` is a key/value table, which is flexible but says nothing about what
 * a key means, what shape its value takes, or whether it is safe to show. This
 * registry supplies that: it is the allow-list the settings form renders from
 * and validates against, so an admin cannot invent a key, and a key that exists
 * in the database but not here is never rendered.
 *
 * That direction matters for security. §10 of the brief requires that no secret
 * appears in the UI. Rather than blacklisting the keys that look sensitive — a
 * list that goes stale the moment someone adds one — the settings page can only
 * ever display keys defined here, none of which are credentials. Payment and
 * storage credentials live in the environment (lib/env.ts) and there is no code
 * path that reads them into a page.
 *
 * VALUES ARE INTENTIONALLY BLANK where the source documents do not establish
 * them. Business hours and the delivery policy are not in the brochure, so they
 * seed as empty and read as "Not set" until the studio fills them in.
 */

export type SettingKind = "text" | "textarea" | "email" | "tel" | "url" | "number" | "currency" | "boolean";

export type SettingDefinition = {
  key: string;
  label: string;
  /** What this controls, in the operator's language. Rendered as help text. */
  help: string;
  kind: SettingKind;
  group: SettingGroup;
  /** Shown in the input when the value is empty. Never saved. */
  placeholder?: string;
  min?: number;
  max?: number;
  maxLength?: number;
};

export const SETTING_GROUPS = [
  "business",
  "commerce",
  "production",
  "delivery",
  "seo",
  "social",
] as const;

export type SettingGroup = (typeof SETTING_GROUPS)[number];

export const SETTING_GROUP_LABEL: Record<SettingGroup, string> = {
  business: "Business details",
  commerce: "Commerce",
  production: "Production",
  delivery: "Delivery and collection",
  seo: "Search and sharing",
  social: "Social",
};

export const SETTING_GROUP_DESCRIPTION: Record<SettingGroup, string> = {
  business: "Contact details shown on the site and in order emails.",
  commerce: "How orders are priced and handled.",
  production: "How long pieces take to make. Used to tell customers what to expect.",
  delivery: "What the studio can commit to. Left blank until the business decides.",
  seo: "Defaults for search results and link previews, used where a page has no override.",
  social: "Profile handles, not full URLs. Blank hides the link.",
};

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  // --- Business ------------------------------------------------------------
  {
    key: "business.name",
    label: "Business name",
    help: "Used in page titles, emails and structured data.",
    kind: "text",
    group: "business",
    maxLength: 120,
  },
  {
    key: "business.contact_email",
    label: "Contact email",
    help: "Where general enquiries from the contact form should be answered.",
    kind: "email",
    group: "business",
    maxLength: 320,
  },
  {
    key: "business.orders_email",
    label: "Orders email",
    help: "Where order notifications are sent. May be the same as the contact email.",
    kind: "email",
    group: "business",
    maxLength: 320,
  },
  {
    key: "business.phone",
    label: "Telephone",
    help: "Include the country code, for example +263 29 2260200.",
    kind: "tel",
    group: "business",
    maxLength: 40,
  },
  {
    key: "business.whatsapp",
    label: "WhatsApp number",
    help: "Used for the WhatsApp enquiry links. Include the country code.",
    kind: "tel",
    group: "business",
    maxLength: 40,
  },
  {
    key: "business.studio_address",
    label: "Studio address",
    help: "One line per line. Shown in the footer and on the contact page.",
    kind: "textarea",
    group: "business",
    maxLength: 400,
  },
  {
    key: "business.hours",
    label: "Business hours",
    help: "Not stated in the supplied material — leave blank until the studio confirms them.",
    kind: "textarea",
    group: "business",
    placeholder: "Not set",
    maxLength: 400,
  },

  // --- Commerce ------------------------------------------------------------
  {
    key: "commerce.currency",
    label: "Currency",
    help: "Three-letter code. Applies to new products; existing orders keep the currency they were placed in.",
    kind: "currency",
    group: "commerce",
  },
  {
    key: "commerce.order_number_prefix",
    label: "Order number prefix",
    help: "Prefix for new order numbers. Changing it does not renumber existing orders.",
    kind: "text",
    group: "commerce",
    maxLength: 8,
  },
  {
    key: "inventory.default_low_stock_threshold",
    label: "Low stock threshold",
    help: "At or below this quantity a piece is treated as low stock. Pieces are one-offs, so this is deliberately small.",
    kind: "number",
    group: "commerce",
    min: 0,
    max: 1000,
  },

  // --- Production ----------------------------------------------------------
  {
    key: "production.default_lead_time_days",
    label: "Default lead time (days)",
    help: "Used when a piece does not set its own. The catalogue states 5–6 weeks, weather-dependent.",
    kind: "number",
    group: "production",
    min: 0,
    max: 365,
  },
  {
    key: "production.lead_time_note",
    label: "Lead time note",
    help: "Shown alongside the lead time on made-to-order pieces.",
    kind: "textarea",
    group: "production",
    maxLength: 500,
  },

  // --- Delivery ------------------------------------------------------------
  {
    key: "delivery.collection_instructions",
    label: "Collection instructions",
    help: "Shown to customers who choose to collect from the studio.",
    kind: "textarea",
    group: "delivery",
    maxLength: 1000,
  },
  {
    key: "delivery.policy",
    label: "Delivery policy",
    help: "No rate card exists yet, so orders for delivery are created without a quoted fee. Explain here what happens next.",
    kind: "textarea",
    group: "delivery",
    placeholder: "Not set",
    maxLength: 1000,
  },
  {
    key: "delivery.enabled",
    label: "Offer delivery at checkout",
    help: "When off, checkout offers collection only. Existing orders are unaffected.",
    kind: "boolean",
    group: "delivery",
  },

  // --- SEO -----------------------------------------------------------------
  {
    key: "seo.default_title",
    label: "Default page title",
    help: "Used where a page sets no title of its own.",
    kind: "text",
    group: "seo",
    maxLength: 70,
  },
  {
    key: "seo.default_description",
    label: "Default meta description",
    help: "Around 155 characters is what search results show.",
    kind: "textarea",
    group: "seo",
    maxLength: 320,
  },

  // --- Social --------------------------------------------------------------
  {
    key: "social.instagram",
    label: "Instagram handle",
    help: "Handle only, without the @.",
    kind: "text",
    group: "social",
    maxLength: 60,
  },
  {
    key: "social.facebook",
    label: "Facebook page",
    help: "Page name or handle, not the full URL.",
    kind: "text",
    group: "social",
    maxLength: 120,
  },
];

const BY_KEY = new Map(SETTING_DEFINITIONS.map((definition) => [definition.key, definition]));

export function settingDefinition(key: string): SettingDefinition | null {
  return BY_KEY.get(key) ?? null;
}

export function isKnownSettingKey(key: string): boolean {
  return BY_KEY.has(key);
}

export function settingsInGroup(group: SettingGroup): SettingDefinition[] {
  return SETTING_DEFINITIONS.filter((definition) => definition.group === group);
}

/**
 * Validates one value against its definition.
 *
 * Returns the string to store, or an error message. Empty is always allowed and
 * always stored as an empty string: "the studio has not decided" is a real
 * state for most of these, and refusing to save a blank would force someone to
 * invent business hours to get past the form.
 */
export function validateSettingValue(
  definition: SettingDefinition,
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = definition.kind === "textarea" ? raw.trim() : raw.trim();

  if (value.length === 0) return { ok: true, value: "" };

  const maxLength = definition.maxLength ?? 500;
  if (value.length > maxLength) {
    return { ok: false, error: `Keep this under ${maxLength} characters` };
  }

  switch (definition.kind) {
    case "email": {
      const parsed = z.string().email().safeParse(value);
      return parsed.success ? { ok: true, value } : { ok: false, error: "Enter a valid email address" };
    }
    case "url": {
      const parsed = z.string().url().safeParse(value);
      return parsed.success ? { ok: true, value } : { ok: false, error: "Enter a full URL, including https://" };
    }
    case "tel": {
      return /^[+()\d\s-]{6,40}$/.test(value)
        ? { ok: true, value }
        : { ok: false, error: "Use digits, spaces, +, - and brackets only" };
    }
    case "currency": {
      const upper = value.toUpperCase();
      return /^[A-Z]{3}$/.test(upper)
        ? { ok: true, value: upper }
        : { ok: false, error: "Use a three-letter code, such as USD" };
    }
    case "number": {
      if (!/^-?\d+$/.test(value)) return { ok: false, error: "Enter a whole number" };
      const parsed = Number.parseInt(value, 10);
      const min = definition.min ?? 0;
      const max = definition.max ?? Number.MAX_SAFE_INTEGER;
      if (parsed < min || parsed > max) {
        return { ok: false, error: `Enter a number between ${min} and ${max}` };
      }
      return { ok: true, value: String(parsed) };
    }
    case "boolean": {
      // The form posts "on" when ticked and omits the field otherwise; both
      // arrive here already normalised by the action.
      return { ok: true, value: value === "true" || value === "on" || value === "1" ? "true" : "false" };
    }
    default:
      return { ok: true, value };
  }
}

export function isSettingTrue(value: string | null | undefined): boolean {
  return value === "true" || value === "1" || value === "on";
}
