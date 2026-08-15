import type { ContentBlockType } from "@/lib/generated/prisma/enums";

/**
 * What each ContentBlock key means, and where on the site it appears.
 *
 * `ContentBlock` is keyed free-text, which is what makes it flexible enough to
 * hold every editorial fragment on the site without a table per page. The cost
 * is that "homepage.story.excerpt" tells an operator nothing about where their
 * words will show up. This registry is the missing half: it turns the key list
 * into a page-by-page editing experience.
 *
 * Keys listed here but absent from the database are still rendered as empty,
 * editable fields — that is the point. The Phase 1 seed deliberately left most
 * of these null rather than writing marketing copy on the business's behalf,
 * and this registry is how the team fills them in without a developer.
 *
 * Keys in the database but NOT listed here are still shown, in an "Other" group,
 * rather than hidden. Hiding them would mean content that is live on the site
 * but uneditable in the admin, which is exactly the failure Phase 4 exists to
 * remove.
 */

export const CONTENT_GROUPS = [
  "homepage",
  "about",
  "family",
  "commissions",
  "wholesale",
  "policies",
  "other",
] as const;

export type ContentGroup = (typeof CONTENT_GROUPS)[number];

export const CONTENT_GROUP_LABEL: Record<ContentGroup, string> = {
  homepage: "Homepage",
  about: "About",
  family: "Nnino family",
  commissions: "Custom commissions",
  wholesale: "Wholesale",
  policies: "Policies and care",
  other: "Other",
};

export const CONTENT_GROUP_DESCRIPTION: Record<ContentGroup, string> = {
  homepage: "The first thing a visitor reads.",
  about: "The studio's story, on /about.",
  family: "Introduction to the team, on /family.",
  commissions: "Copy on the /custom commission page.",
  wholesale: "Copy for trade and wholesale enquiries.",
  policies: "Shipping, care, privacy and terms. Legal copy needs review before publishing.",
  other: "Blocks that exist in the database without a registry entry.",
};

export type ContentDefinition = {
  key: string;
  label: string;
  /** Where the words appear, in the operator's language. */
  where: string;
  group: ContentGroup;
  type: ContentBlockType;
  /** Roughly how long the space expects. Guidance only, never enforced silently. */
  guidance?: string;
  /** Copy that must be checked before it goes live. */
  needsReview?: boolean;
};

export const CONTENT_DEFINITIONS: ContentDefinition[] = [
  {
    key: "homepage.hero.headline",
    label: "Hero headline",
    where: "The large line across the top of the homepage.",
    group: "homepage",
    type: "TEXT",
    guidance: "A short line. The brochure tagline is “Made By Hand, With Heart”.",
  },
  {
    key: "homepage.hero.image",
    label: "Hero image",
    where: "The homepage background image.",
    group: "homepage",
    type: "IMAGE",
    guidance: "Choose from the media library. A wide, landscape crop works best.",
  },
  {
    key: "homepage.story.excerpt",
    label: "Homepage story",
    where: "The short passage beneath the homepage hero.",
    group: "homepage",
    type: "RICH_TEXT",
    guidance: "Two or three sentences.",
  },
  {
    key: "legacy.origin",
    label: "How Nnino began",
    where: "The opening passage on /about.",
    group: "about",
    type: "RICH_TEXT",
  },
  {
    key: "legacy.founder",
    label: "About the founder",
    where: "/about, beneath the origin passage.",
    group: "about",
    type: "RICH_TEXT",
    guidance: "Left empty at import — nothing beyond the founder's name was stated in the source material.",
  },
  {
    key: "legacy.craft",
    label: "The craft",
    where: "/about — how the pieces are made.",
    group: "about",
    type: "RICH_TEXT",
  },
  {
    key: "legacy.continuation",
    label: "Where Nnino is going",
    where: "The closing passage on /about.",
    group: "about",
    type: "RICH_TEXT",
  },
  {
    key: "about.products",
    label: "About the pieces",
    where: "/about — the paragraph describing how each piece is made.",
    group: "about",
    type: "RICH_TEXT",
  },
  {
    key: "family.intro",
    label: "Team introduction",
    where: "The passage above the team on /family.",
    group: "family",
    type: "RICH_TEXT",
  },
  {
    key: "commissions.intro",
    label: "Commissions introduction",
    where: "The passage above the commission form on /custom.",
    group: "commissions",
    type: "RICH_TEXT",
  },
  {
    key: "wholesale.intro",
    label: "Wholesale introduction",
    where: "Trade and wholesale enquiry copy.",
    group: "wholesale",
    type: "RICH_TEXT",
  },
  {
    key: "shipping.policy",
    label: "Shipping and delivery",
    where: "Shown to customers at checkout and on the policy page.",
    group: "policies",
    type: "RICH_TEXT",
    guidance: "No delivery rate card exists yet. Say what the studio actually commits to.",
  },
  {
    key: "care.instructions",
    label: "Care instructions",
    where: "The general care guidance shown on product pages.",
    group: "policies",
    type: "RICH_TEXT",
  },
  {
    key: "privacy.policy",
    label: "Privacy policy",
    where: "The privacy page.",
    group: "policies",
    type: "RICH_TEXT",
    needsReview: true,
  },
  {
    key: "terms.of_sale",
    label: "Terms of sale",
    where: "The terms page and checkout.",
    group: "policies",
    type: "RICH_TEXT",
    needsReview: true,
  },
];

const BY_KEY = new Map(CONTENT_DEFINITIONS.map((definition) => [definition.key, definition]));

export function contentDefinition(key: string): ContentDefinition | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * A definition for any key, including one only the database knows about.
 *
 * Unregistered keys land in "Other" with the key itself as the label, so they
 * remain editable. Better a slightly ugly label than live copy no one can change.
 */
export function contentDefinitionOrFallback(key: string, type: ContentBlockType): ContentDefinition {
  return (
    BY_KEY.get(key) ?? {
      key,
      label: key,
      where: "Not listed in the content registry. It may be unused, or added after this page was written.",
      group: "other",
      type,
    }
  );
}

export const CONTENT_KEYS: string[] = CONTENT_DEFINITIONS.map((definition) => definition.key);

/** Keys the site reads but the database has never had a row for. */
export function missingContentKeys(existingKeys: string[]): string[] {
  const existing = new Set(existingKeys);
  return CONTENT_KEYS.filter((key) => !existing.has(key));
}
