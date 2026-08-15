/**
 * Slugs.
 *
 * A slug is a public URL, and a product's URL is the thing customers bookmark
 * and Google indexes. So: generated from the name when the team leaves the field
 * blank, editable when they do not, and never silently changed underneath a
 * published page — the admin forms surface the slug as an explicit field rather
 * than re-deriving it on every save.
 */

const MAX_SLUG_LENGTH = 80;

/**
 * Normalises text into a URL-safe slug.
 *
 * NFD + combining-mark strip means "Café Noir" becomes "cafe-noir" rather than
 * "caf-noir": the accent is decomposed and removed rather than the whole
 * character being dropped.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

/** Whether a slug the team typed is usable as-is. */
export function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= MAX_SLUG_LENGTH;
}

/**
 * Finds a free slug by appending -2, -3, … until `isTaken` says no.
 *
 * The database unique index is still the real guard — two admins saving at the
 * same moment race past any application-level check — so callers must also
 * handle a P2002 from Prisma. This just makes the common case produce a sensible
 * name instead of an error.
 */
export async function uniqueSlug(
  desired: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  const base = slugify(desired) || "item";
  if (!(await isTaken(base))) return base;

  for (let suffix = 2; suffix <= maxAttempts; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - tail.length)}${tail}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  // Falls back to a random tail rather than throwing: the operator is mid-save
  // and a collision on 50 consecutive names is a naming problem, not an error
  // they can act on.
  return `${base.slice(0, MAX_SLUG_LENGTH - 7)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Postgres unique-violation code, as surfaced by Prisma. */
export const UNIQUE_VIOLATION = "P2002";

export function isUniqueViolation(error: unknown): error is { code: string; meta?: { target?: unknown } } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  );
}

/** Which column collided, so the form can point at the right input. */
export function uniqueViolationTarget(error: unknown): string | null {
  if (!isUniqueViolation(error)) return null;
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    const first = target[0];
    return typeof first === "string" ? first : null;
  }
  return typeof target === "string" ? target : null;
}
